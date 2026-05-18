'use client'

import { useState } from 'react'
import { type Application, approveApplication, rejectApplication } from '@/lib/api'
import MatchScore from './MatchScore'

interface ApplicationCardProps {
  application: Application
  onUpdate?: (updated: Application) => void
}

function formatDateTime(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const statusColors: Record<string, string> = {
  pending_review: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  approved: 'bg-green-500/20 text-green-400 border-green-500/30',
  submitted: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  failed: 'bg-red-500/20 text-red-400 border-red-500/30',
  rejected: 'bg-slate-600/20 text-slate-400 border-slate-600/30',
}

export default function ApplicationCard({ application, onUpdate }: ApplicationCardProps) {
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const statusKey = application.status?.toLowerCase().replace(/ /g, '_') ?? ''
  const statusClass = statusColors[statusKey] ?? statusColors['pending_review']
  const isPending = statusKey === 'pending_review'

  async function handleApprove() {
    setLoading('approve')
    setError(null)
    try {
      const updated = await approveApplication(application.id)
      onUpdate?.(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to approve')
    } finally {
      setLoading(null)
    }
  }

  async function handleReject() {
    setLoading('reject')
    setError(null)
    try {
      const updated = await rejectApplication(application.id)
      onUpdate?.(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reject')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 p-5 flex flex-col gap-4 hover:border-slate-600 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-100 truncate">{application.job_title}</h3>
          <p className="text-sm text-slate-400 mt-0.5">{application.company_name}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${statusClass}`}>
            {application.status?.replace(/_/g, ' ') ?? 'pending'}
          </span>
          {application.match_score !== null && application.match_score !== undefined && (
            <MatchScore score={application.match_score} size="sm" />
          )}
        </div>
      </div>

      {/* Cover letter preview */}
      {application.cover_letter && (
        <div className="rounded-lg bg-slate-900/60 border border-slate-700 px-4 py-3">
          <p className="text-xs text-slate-500 font-medium mb-1.5 uppercase tracking-wide">Cover Letter</p>
          <p className="text-sm text-slate-300 line-clamp-3">{application.cover_letter}</p>
        </div>
      )}

      {/* Timestamps */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Created: {formatDateTime(application.created_at)}</span>
        {application.submitted_at && (
          <span className="text-blue-400">Submitted: {formatDateTime(application.submitted_at)}</span>
        )}
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* Actions */}
      {isPending && (
        <div className="flex gap-3 pt-1">
          <button
            onClick={handleApprove}
            disabled={loading !== null}
            className="flex-1 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-sm font-semibold text-white transition-colors"
          >
            {loading === 'approve' ? 'Approving...' : 'Approve'}
          </button>
          <button
            onClick={handleReject}
            disabled={loading !== null}
            className="flex-1 rounded-lg bg-slate-700 hover:bg-red-800/60 disabled:opacity-50 disabled:cursor-not-allowed border border-slate-600 hover:border-red-600/50 px-4 py-2 text-sm font-semibold text-slate-300 hover:text-red-400 transition-colors"
          >
            {loading === 'reject' ? 'Rejecting...' : 'Reject'}
          </button>
        </div>
      )}
    </div>
  )
}
