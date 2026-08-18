// src/components/DuplicateWarningModal.tsx
// ───────────────────────────────────────────
// Shown when the backend flags a new JD as a near-duplicate of an existing
// one (POST /jobs/ or /jobs/upload-file returns 409). Lets the user cancel
// or resubmit with force=true.

import { AlertTriangle } from 'lucide-react'
import type { JDDuplicate } from '../types'

export default function DuplicateWarningModal({
  duplicates,
  onCancel,
  onContinue,
  loading,
}: {
  duplicates: JDDuplicate[]
  onCancel: () => void
  onContinue: () => void
  loading?: boolean
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-center gap-2 text-amber-700">
          <AlertTriangle size={20} />
          <h3 className="font-semibold text-lg">Possible duplicate job description</h3>
        </div>
        <p className="text-sm text-slate-600">
          This looks similar to {duplicates.length} existing job description{duplicates.length > 1 ? 's' : ''}:
        </p>
        <ul className="space-y-2 max-h-56 overflow-y-auto">
          {duplicates.map((d) => (
            <li
              key={d.id}
              className="border border-slate-200 rounded-lg px-3 py-2 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-slate-800 text-sm truncate">{d.title}</p>
                {d.company && <p className="text-xs text-slate-400 truncate">{d.company}</p>}
              </div>
              <span className="shrink-0 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                {Math.round(d.score * 100)}% similar
              </span>
            </li>
          ))}
        </ul>
        <div className="flex gap-3 pt-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={onContinue}
            disabled={loading}
            className="flex-1 py-2 bg-blue-900 text-white rounded-lg text-sm font-semibold hover:bg-blue-950 disabled:opacity-60"
          >
            {loading ? 'Saving…' : 'Continue anyway'}
          </button>
        </div>
      </div>
    </div>
  )
}
