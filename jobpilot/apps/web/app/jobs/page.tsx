'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchJobs, type Job, type JobsResponse } from '@/lib/api'
import MatchScore from '@/components/ui/MatchScore'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Modal from '@/components/ui/Modal'

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'new', label: 'New' },
  { value: 'matched', label: 'Matched' },
  { value: 'low_match', label: 'Low Match' },
  { value: 'applied', label: 'Applied' },
  { value: 'skipped', label: 'Skipped' },
]

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  matched: 'bg-green-500/20 text-green-400 border-green-500/30',
  low_match: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  applied: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  skipped: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  ineligible: 'bg-red-500/20 text-red-400 border-red-500/30',
}

export default function JobsPage() {
  const [data, setData] = useState<JobsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)

  const [filters, setFilters] = useState({
    status: '',
    minScore: 0,
    remoteOnly: false,
    search: '',
    page: 1,
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchJobs({
        status: filters.status || undefined,
        min_match_score: filters.minScore > 0 ? filters.minScore / 100 : undefined,
        remote_only: filters.remoteOnly || undefined,
        search: filters.search || undefined,
        page: filters.page,
        page_size: 50,
      })
      setData(res)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load jobs')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { load() }, [load])

  const formatSalary = (min?: number | null, max?: number | null) => {
    if (!min && !max) return null
    const fmt = (v: number) => `$${(v / 1000).toFixed(0)}k`
    if (min && max) return `${fmt(min)}–${fmt(max)}`
    if (min) return `${fmt(min)}+`
    return `up to ${fmt(max!)}`
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Jobs</h1>
        <span className="text-sm text-slate-400">
          {data ? `${data.total.toLocaleString()} total` : '—'}
        </span>
      </div>

      {/* Filters */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input
          type="text"
          placeholder="Search title or description..."
          value={filters.search}
          onChange={e => setFilters(f => ({ ...f, search: e.target.value, page: 1 }))}
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
        />
        <select
          value={filters.status}
          onChange={e => setFilters(f => ({ ...f, status: e.target.value, page: 1 }))}
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
        >
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div className="flex items-center gap-3">
          <label className="text-xs text-slate-400 whitespace-nowrap">Min match: {filters.minScore}%</label>
          <input
            type="range" min={0} max={100} step={5}
            value={filters.minScore}
            onChange={e => setFilters(f => ({ ...f, minScore: Number(e.target.value), page: 1 }))}
            className="w-full accent-blue-500"
          />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.remoteOnly}
            onChange={e => setFilters(f => ({ ...f, remoteOnly: e.target.checked, page: 1 }))}
            className="accent-blue-500"
          />
          <span className="text-sm text-slate-300">Remote only</span>
        </label>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><LoadingSpinner /></div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Salary</th>
                  <th className="px-4 py-3">Match</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Posted</th>
                  <th className="px-4 py-3">Apply</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {(data?.items || []).length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                      No jobs found. Try adjusting filters or trigger a scan.
                    </td>
                  </tr>
                ) : (data?.items || []).map(job => (
                  <tr
                    key={job.id}
                    className="cursor-pointer bg-slate-900/20 transition-colors hover:bg-slate-800/50"
                    onClick={() => setSelectedJob(job)}
                  >
                    <td className="px-4 py-3 font-medium text-slate-300">
                      {job.company_name || '—'}
                    </td>
                    <td className="px-4 py-3 text-white font-medium max-w-xs truncate">{job.title}</td>
                    <td className="px-4 py-3 text-slate-400">
                      {job.location || '—'}
                      {job.is_remote && (
                        <span className="ml-1.5 rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-xs text-emerald-400">Remote</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap text-xs">
                      —
                    </td>
                    <td className="px-4 py-3">
                      {job.match_score != null
                        ? <MatchScore score={job.match_score} size="sm" />
                        : <span className="text-slate-600 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[job.status] || STATUS_COLORS.new}`}>
                        {job.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                      {job.posted_at ? new Date(job.posted_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <a
                        href={job.job_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 transition-colors"
                      >
                        Apply
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data && data.total_pages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
              <span>Page {data.page} of {data.total_pages}</span>
              <div className="flex gap-2">
                <button
                  disabled={data.page <= 1}
                  onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}
                  className="rounded-md border border-slate-700 px-3 py-1.5 text-xs disabled:opacity-40 hover:border-slate-600 transition-colors"
                >
                  Previous
                </button>
                <button
                  disabled={data.page >= data.total_pages}
                  onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}
                  className="rounded-md border border-slate-700 px-3 py-1.5 text-xs disabled:opacity-40 hover:border-slate-600 transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Job Detail Modal */}
      <Modal isOpen={!!selectedJob} onClose={() => setSelectedJob(null)} title={selectedJob?.title || ''}>
        {selectedJob && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              {selectedJob.match_score != null && <MatchScore score={selectedJob.match_score} size="lg" />}
              <div>
                <p className="text-sm text-slate-400">{(selectedJob as any).company?.name}</p>
                <p className="text-xs text-slate-500">{selectedJob.location}</p>
              </div>
            </div>
            {(selectedJob as any).match_analysis && (
              <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-slate-300">Match Analysis</h3>
                {(selectedJob as any).match_analysis.explanation && (
                  <p className="text-xs text-slate-400">{(selectedJob as any).match_analysis.explanation}</p>
                )}
                {(selectedJob as any).match_analysis.strengths?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-green-400 mb-1">Strengths</p>
                    <ul className="space-y-0.5">
                      {(selectedJob as any).match_analysis.strengths.map((s: string, i: number) => (
                        <li key={i} className="text-xs text-slate-400 flex gap-1.5"><span className="text-green-500">✓</span>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {(selectedJob as any).match_analysis.gaps?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-yellow-400 mb-1">Gaps</p>
                    <ul className="space-y-0.5">
                      {(selectedJob as any).match_analysis.gaps.map((g: string, i: number) => (
                        <li key={i} className="text-xs text-slate-400 flex gap-1.5"><span className="text-yellow-500">△</span>{g}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {selectedJob.description && (
              <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/30 p-4">
                <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{selectedJob.description}</p>
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <a
                href={selectedJob.job_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 rounded-lg bg-blue-600 py-2 text-center text-sm font-medium text-white hover:bg-blue-500 transition-colors"
              >
                Open Application
              </a>
              <a
                href={`/jobs/${selectedJob.id}`}
                className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-center text-sm font-medium text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Full Details
              </a>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
