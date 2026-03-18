// src/pages/CandidatesPage.tsx
// ──────────────────────────────
// Displays all candidate profiles.
// Supports: search filter, manual create, Drive sync, soft-delete.

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, Plus, RefreshCw, Trash2, Search, ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  fetchCandidates, createCandidate, deleteCandidate, syncFromDrive,
} from '../services/api'
import type { CandidateProfile } from '../types'
import AddCandidateModal from '../components/AddCandidateModal'
import SkillBadge from '../components/SkillBadge'

export default function CandidatesPage() {
  const qc = useQueryClient()

  const [search, setSearch]         = useState('')
  const [showAddModal, setShowAddModal] = useState(false)

  // ── Fetch all candidates ──────────────────────────────────────
  const { data: candidates = [], isLoading } = useQuery<CandidateProfile[]>({
    queryKey: ['candidates'],
    queryFn:  fetchCandidates,
  })

  // ── Delete mutation ───────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteCandidate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['candidates'] })
      toast.success('Candidate removed')
    },
    onError: () => toast.error('Failed to remove candidate'),
  })

  // ── Drive sync mutation ───────────────────────────────────────
  const syncMutation = useMutation({
    mutationFn: syncFromDrive,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['candidates'] })
      toast.success(data.message || 'Drive sync complete')
    },
    onError: () => toast.error('Drive sync failed. Check your Google Drive access.'),
  })

  // ── Filter by name / role / skill ────────────────────────────
  const filtered = candidates.filter((c) => {
    const q = search.toLowerCase()
    return (
      c.name.toLowerCase().includes(q) ||
      (c.current_role ?? '').toLowerCase().includes(q) ||
      c.skills.some((s) => s.toLowerCase().includes(q))
    )
  })

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Users size={24} /> Candidate Profiles
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            {candidates.length} profiles in library
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => syncMutation.mutate(undefined)}
            disabled={syncMutation.isPending}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <RefreshCw size={15} className={syncMutation.isPending ? 'animate-spin' : ''} />
            Sync Drive
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <Plus size={15} /> Add Candidate
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          className="input pl-9"
          placeholder="Search by name, role, or skill…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Candidate cards grid */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-700 border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-16 text-slate-400">
          <Users size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-semibold">No candidates found</p>
          <p className="text-sm mt-1">Try adjusting your search or add a new candidate</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((c) => (
            <CandidateCard
              key={c.id}
              candidate={c}
              onDelete={() => deleteMutation.mutate(c.id)}
            />
          ))}
        </div>
      )}

      {/* Add Candidate Modal */}
      {showAddModal && (
        <AddCandidateModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false)
            qc.invalidateQueries({ queryKey: ['candidates'] })
          }}
        />
      )}
    </div>
  )
}

// ── Sub-component: individual candidate card ────────────────────
function CandidateCard({
  candidate: c,
  onDelete,
}: {
  candidate: CandidateProfile
  onDelete: () => void
}) {
  return (
    <div className="card hover:shadow-md transition-shadow">
      {/* Header row */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {/* Avatar initials */}
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center
                          text-blue-800 font-bold text-sm shrink-0">
            {c.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="font-bold text-slate-800 text-sm">{c.name}</p>
            <p className="text-slate-500 text-xs">{c.current_role ?? 'No role specified'}</p>
          </div>
        </div>
        <button
          onClick={onDelete}
          className="text-slate-300 hover:text-red-500 transition-colors p-1"
          title="Remove candidate"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Stats row */}
      <div className="flex gap-4 text-xs text-slate-500 mb-3 border-t border-slate-100 pt-3">
        <span>📅 {c.experience_years} yrs</span>
        <span>📧 {c.email}</span>
        {c.phone && <span>📞 {c.phone}</span>}
      </div>

      {/* Education */}
      {c.education && (
        <p className="text-xs text-slate-500 mb-3 truncate">🎓 {c.education}</p>
      )}

      {/* Skill badges */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {c.skills.slice(0, 5).map((s) => (
          <SkillBadge key={s} skill={s} />
        ))}
        {c.skills.length > 5 && (
          <span className="badge bg-slate-100 text-slate-500">+{c.skills.length - 5} more</span>
        )}
      </div>

      {/* Drive link */}
      {c.drive_file_url && (
        <a
          href={c.drive_file_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-2"
        >
          <ExternalLink size={11} /> View Resume on Drive
        </a>
      )}
    </div>
  )
}
