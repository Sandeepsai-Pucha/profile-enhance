// src/components/BackButton.tsx
// ────────────────────────────
// Reusable back-navigation arrow button.
// Uses browser history by default; pass `to` to navigate to a specific route.

import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

interface Props {
  to?:   string   // explicit route; omit to use browser history (-1)
  label?: string  // optional label next to the arrow
}

export default function BackButton({ to, label = 'Back' }: Props) {
  const navigate = useNavigate()

  return (
    <button
      onClick={() => (to ? navigate(to) : navigate(-1))}
      className="inline-flex items-center gap-1.5 text-sm text-slate-500
                 hover:text-blue-900 transition-colors group"
    >
      <ArrowLeft
        size={16}
        className="group-hover:-translate-x-0.5 transition-transform"
      />
      {label}
    </button>
  )
}
