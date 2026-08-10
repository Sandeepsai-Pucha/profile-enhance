"""
services/groq_retry.py
────────────────────────
Reusable retry-with-backoff + proactive rate limiting for Groq API calls.

Two independent pieces, meant to be used together:

  GroqRateLimiter    — proactive throttle. Call wait_for_budget() BEFORE each
                       request to sleep if issuing it would exceed the
                       account's tokens-per-minute (TPM) limit. Call
                       record_usage() AFTER a successful call with the real
                       token count so the rolling window stays accurate.

  call_groq_with_retry — reactive retry. Wraps a single Groq SDK call and
                       retries on 429 (rate limit) and transient server/
                       connection errors, honoring the `Retry-After` header
                       when present, falling back to exponential backoff
                       with jitter otherwise. Raises GroqRetryExhausted if
                       every attempt fails — callers must NOT swallow that
                       silently (see indexing_service.py for how it's
                       handled: logged clearly and persisted to the
                       failed_parses table instead of being dropped).

Not Groq-specific in structure — the same pattern works for any provider's
SDK; only the caught exception types are Groq's.
"""

import random
import threading
import time
from collections import deque
from typing import Callable, Optional, TypeVar

import groq

T = TypeVar("T")


# ─────────────────────────────────────────────────────────────
# Exception raised when all retries are exhausted
# ─────────────────────────────────────────────────────────────
class GroqRetryExhausted(Exception):
    """
    Raised by call_groq_with_retry() when every retry attempt failed.
    Carries enough context (label, attempt count, last error) for the
    caller to log clearly and/or persist to a failed-parses table —
    never swallow this silently.
    """

    def __init__(self, label: str, attempts: int, last_error: BaseException):
        self.label       = label
        self.attempts    = attempts
        self.last_error  = last_error
        super().__init__(
            f"Groq call '{label or 'unlabeled'}' failed after {attempts} attempt(s): "
            f"{type(last_error).__name__}: {last_error}"
        )


# ─────────────────────────────────────────────────────────────
# Retry wrapper
# ─────────────────────────────────────────────────────────────
def _retry_after_seconds(e: groq.RateLimitError) -> Optional[float]:
    """Read the Retry-After header from a 429 response, if Groq sent one."""
    try:
        header = e.response.headers.get("retry-after")
        if header:
            return float(header)
    except Exception:
        pass
    return None


def _backoff_seconds(attempt: int, base_delay: float, max_delay: float) -> float:
    """Exponential backoff (base_delay * 2**(attempt-1)), capped at max_delay,
    with +/-25% random jitter so multiple concurrent callers that all failed
    at once don't retry in lockstep (thundering herd)."""
    delay  = min(base_delay * (2 ** (attempt - 1)), max_delay)
    jitter = delay * 0.25
    return max(0.1, delay + random.uniform(-jitter, jitter))


def call_groq_with_retry(
    fn:          Callable[[], T],
    *,
    label:       str = "",
    max_retries: int = 5,
    base_delay:  float = 1.0,
    max_delay:   float = 60.0,
) -> T:
    """
    Call `fn()` — a zero-arg callable that performs ONE Groq SDK request —
    with automatic retry on rate limiting and transient errors.

      - groq.RateLimitError (429): honors the `Retry-After` header if Groq
        sent one; otherwise exponential backoff starting at `base_delay`
        seconds, doubling each retry, capped at `max_delay`.
      - groq.APIConnectionError / groq.InternalServerError (5xx): also
        retried with the same exponential backoff (no Retry-After header
        exists for these, so backoff is always used).
      - Any other exception is NOT retried — it propagates immediately,
        since retrying e.g. an AuthenticationError or BadRequestError would
        just fail identically every time.

    Raises GroqRetryExhausted after `max_retries` failed attempts. The
    caller is responsible for handling that — do not catch-and-ignore it.
    """
    last_error: Optional[BaseException] = None

    for attempt in range(1, max_retries + 1):
        try:
            return fn()
        except groq.RateLimitError as e:
            last_error = e
            wait = _retry_after_seconds(e)
            source = "Retry-After header"
            if wait is None:
                wait   = _backoff_seconds(attempt, base_delay, max_delay)
                source = "exponential backoff"
            print(
                f"[GroqRetry] {label or 'call'}: 429 rate limit "
                f"(attempt {attempt}/{max_retries}) — waiting {wait:.1f}s ({source})"
            )
        except (groq.APIConnectionError, groq.InternalServerError) as e:
            last_error = e
            wait = _backoff_seconds(attempt, base_delay, max_delay)
            print(
                f"[GroqRetry] {label or 'call'}: transient error "
                f"({type(e).__name__}: {e}) (attempt {attempt}/{max_retries}) "
                f"— waiting {wait:.1f}s (exponential backoff)"
            )

        if attempt < max_retries:
            time.sleep(wait)

    raise GroqRetryExhausted(label, max_retries, last_error)


# ─────────────────────────────────────────────────────────────
# Proactive TPM (tokens-per-minute) throttle
# ─────────────────────────────────────────────────────────────
class GroqRateLimiter:
    """
    Sliding-window token-bucket throttle. Thread-safe — safe to share one
    instance across a ThreadPoolExecutor.

    Usage per call:
        limiter.wait_for_budget(estimated_tokens, label="...")   # before
        completion = call_groq_with_retry(lambda: client.chat...(...))
        limiter.record_usage(completion.usage.total_tokens)      # after
    """

    def __init__(self, tpm_limit: int, window_secs: float = 60.0):
        self.tpm_limit   = tpm_limit
        self.window_secs = window_secs
        self._events: deque = deque()  # [(timestamp, token_count), ...]
        self._lock = threading.Lock()

    def _prune(self, now: float) -> None:
        cutoff = now - self.window_secs
        while self._events and self._events[0][0] < cutoff:
            self._events.popleft()

    def _current_usage(self, now: float) -> int:
        self._prune(now)
        return sum(tokens for _, tokens in self._events)

    def wait_for_budget(self, estimated_tokens: int, label: str = "") -> None:
        """
        Block until issuing a call of `estimated_tokens` would NOT push the
        rolling `window_secs`-second usage over `tpm_limit`. Reserves the
        estimated amount immediately on return — call record_usage()
        afterwards to correct it to the real token count.
        """
        with self._lock:
            while True:
                now  = time.time()
                used = self._current_usage(now)
                if used + estimated_tokens <= self.tpm_limit:
                    self._events.append((now, estimated_tokens))
                    return

                oldest_ts = self._events[0][0]
                sleep_for = max(0.1, (oldest_ts + self.window_secs) - now + 0.05)
                print(
                    f"[GroqLimiter] {label or 'call'}: {used}+{estimated_tokens} tokens would "
                    f"exceed {self.tpm_limit} TPM — sleeping {sleep_for:.1f}s"
                )
                time.sleep(sleep_for)

    def record_usage(self, actual_tokens: int) -> None:
        """Replace the most recent reservation's estimate with the real usage Groq reported."""
        with self._lock:
            if self._events:
                ts, _ = self._events[-1]
                self._events[-1] = (ts, actual_tokens)
