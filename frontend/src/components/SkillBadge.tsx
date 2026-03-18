// src/components/SkillBadge.tsx
// ──────────────────────────────
// Reusable skill pill badge. Three visual variants:
//   default  → blue (neutral display)
//   matched  → green (skill is present in JD)
//   missing  → red   (skill gap)

import clsx from 'clsx'

interface Props {
  skill: string
  variant?: 'default' | 'matched' | 'missing'
}

const VARIANT_CLASSES = {
  default: 'bg-blue-50 text-blue-700 border-blue-200',
  matched: 'bg-green-50 text-green-700 border-green-200',
  missing: 'bg-red-50 text-red-700 border-red-200',
}

export default function SkillBadge({ skill, variant = 'default' }: Props) {
  return (
    <span
      className={clsx(
        'badge border text-xs font-medium',
        VARIANT_CLASSES[variant],
      )}
    >
      {skill}
    </span>
  )
}
