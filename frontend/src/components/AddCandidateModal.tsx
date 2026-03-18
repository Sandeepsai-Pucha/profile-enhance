// src/components/AddCandidateModal.tsx
// ──────────────────────────────────────
// Modal dialog for manually creating a CandidateProfile.
// Shown when the user clicks "Add Candidate" on the Candidates page.

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { X } from 'lucide-react'
import toast from 'react-hot-toast'
import { createCandidate } from '../services/api'

interface Props {
  onClose: () => void
  onSuccess: () => void
}

export default function AddCandidateModal({ onClose, onSuccess }: Props) {
  // ── Form fields ───────────────────────────────────────────────
  const [name,        setName]        = useState('')
  const [email,       setEmail]       = useState('')
  const [phone,       setPhone]       = useState('')
  const [role,        setRole]        = useState('')
  const [experience,  setExperience]  = useState(0)
  const [skillsInput, setSkillsInput] = useState('')    // comma-separated
  const [education,   setEducation]   = useState('')
  const [summary,     setSummary]     = useState('')
  const [resumeText,  setResumeText]  = useState('')

  // ── Create mutation ───────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: () =>
      createCandidate({
        name,
        email,
        phone:            phone || undefined,
        current_role:     role || undefined,
        experience_years: experience,
        skills:           skillsInput.split(',').map((s) => s.trim()).filter(Boolean),
        education:        education || undefined,
        summary:          summary || undefined,
        resume_text:      resumeText || undefined,
      }),
    onSuccess: () => {
      toast.success('Candidate added!')
      onSuccess()
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail ?? 'Failed to add candidate')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !email.trim()) {
      toast.error('Name and email are required')
      return
    }
    mutation.mutate()
  }

  return (
    /* Backdrop */
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-bold text-slate-800">Add Candidate</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Full Name *</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Arjun Mehta" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="arjun@example.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
              <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)}
                placeholder="+91-9876543210" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Current Role</label>
              <input className="input" value={role} onChange={(e) => setRole(e.target.value)}
                placeholder="Senior Python Developer" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Experience (years)</label>
              <input className="input" type="number" min="0" max="50" step="0.5"
                value={experience} onChange={(e) => setExperience(Number(e.target.value))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Education</label>
              <input className="input" value={education} onChange={(e) => setEducation(e.target.value)}
                placeholder="B.Tech CSE – IIT Hyderabad" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Skills <span className="text-slate-400 font-normal">(comma-separated)</span>
            </label>
            <input className="input" value={skillsInput} onChange={(e) => setSkillsInput(e.target.value)}
              placeholder="Python, FastAPI, PostgreSQL, Docker, AWS" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Short Summary</label>
            <textarea className="input min-h-[72px] resize-none" value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="2–3 sentence professional bio" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Resume Text <span className="text-slate-400 font-normal">(paste full CV content)</span>
            </label>
            <textarea className="input min-h-[120px] resize-y" value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              placeholder="Paste the candidate's resume text here for better AI matching…" />
          </div>

          {/* Footer */}
          <div className="flex gap-3 pt-2">
            <button type="submit" className="btn-primary flex-1" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Add Candidate'}
            </button>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}
