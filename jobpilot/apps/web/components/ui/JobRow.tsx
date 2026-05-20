'use client'

import { type Job } from '@/lib/api'
import MatchScore from './MatchScore'

interface JobRowProps {
  job: Job
  onClick?: () => void
  onApply?: () => void
}

const statusColors: Record<string, string> = {
  new: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  matched: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  pending_review: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  approved: 'bg-green-500/20 text-green-400 border-green-500/30',
  submitted: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  failed: 'bg-red-500/20 text-red-400 border-red-500/30',
  skipped: 'bg-slate-600/20 text-slate-500 border-slate-600/30',
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function JobRow({ job, onClick, onApply }: JobRowProps) {
  const statusKey = job.status?.toLowerCase().replace(/ /g, '_') ?? 'new'
  const statusClass = statusColors[statusKey] ?? statusColors['new']

  return (
    <tr
      className="border-b border-slate-800 hover:bg-slate-800/40 transition-colors cursor-pointer"
      onClick={onClick}
    >
      <td className="px-4 py-3 text-sm font-medium text-slate-200">
        {job.company_name}
      </td>
      <td className="px-4 py-3 text-sm text-slate-300">
        {job.title}
      </td>
      <td className="px-4 py-3 text-sm text-slate-400">
        {job.location || '—'}
      </td>
      <td className="px-4 py-3">
        {job.is_remote ? (
          <span className="inline-flex items-center rounded-full bg-teal-500/20 px-2 py-0.5 text-xs font-medium text-teal-400 border border-teal-500/30">
            Remote
          </span>
        ) : (
          <span className="text-xs text-slate-500">On-site</span>
        )}
      </td>
      <td className="px-4 py-3 min-w-[120px]">
        {job.match_score !== null && job.match_score !== undefined ? (
          <MatchScore score={job.match_score} showBar />
        ) : (
          <span className="text-xs text-slate-500">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-slate-400 whitespace-nowrap">
        {formatDate(job.posted_at)}
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${statusClass}`}>
          {job.status?.replace(/_/g, ' ') ?? 'new'}
        </span>
      </td>
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onApply}
          className="rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
        >
          Apply
        </button>
      </td>
    </tr>
  )
}
