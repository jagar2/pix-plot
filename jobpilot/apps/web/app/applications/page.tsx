'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchApplications, approveApplication, rejectApplication, type Application } from '@/lib/api'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

const TABS = [
  { key: 'pending_review', label: 'Pending Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'failed', label: 'Failed' },
  { key: '', label: 'All' },
]

const STATUS_COLORS: Record<string, string> = {
  pending_review: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  approved: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  submitted: 'bg-green-500/20 text-green-400 border-green-500/30',
  failed: 'bg-red-500/20 text-red-400 border-red-500/30',
  rejected_by_user: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  submitting: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
}

export default function ApplicationsPage() {
  const [activeTab, setActiveTab] = useState('pending_review')
  const [apps, setApps] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [acting, setActing] = useState<number | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchApplications({ status: activeTab || undefined, page_size: 50 })
      setApps(res.items)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load applications')
    } finally {
      setLoading(false)
    }
  }, [activeTab])

  useEffect(() => { load() }, [load])

  const handleApprove = async (id: number) => {
    setActing(id)
    try {
      await approveApplication(id)
      await load()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to approve')
    } finally {
      setActing(null)
    }
  }

  const handleReject = async (id: number) => {
    setActing(id)
    try {
      await rejectApplication(id)
      await load()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to reject')
    } finally {
      setActing(null)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Applications</h1>
        <p className="mt-1 text-sm text-slate-400">Review and manage your job applications</p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-xl border border-slate-800 bg-slate-900/50 p-1">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><LoadingSpinner /></div>
      ) : apps.length === 0 ? (
        <div className="py-16 text-center text-slate-500">
          No applications in this category yet.
        </div>
      ) : (
        <div className="space-y-4">
          {apps.map(app => (
            <div key={app.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h2 className="font-semibold text-white truncate">{app.job?.title || `Job #${app.job_id}`}</h2>
                    <span className="text-slate-400 text-sm">{app.job?.company?.name || '—'}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[app.status] || STATUS_COLORS.pending_review}`}>
                      {app.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-4 text-xs text-slate-500">
                    <span>Created {new Date(app.created_at).toLocaleDateString()}</span>
                    {app.submitted_at && <span>Submitted {new Date(app.submitted_at).toLocaleDateString()}</span>}
                    {app.job?.match_score != null && (
                      <span className="font-medium text-green-400">{Math.round(app.job.match_score * 100)}%</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {app.status === 'pending_review' && (
                    <>
                      <button
                        disabled={acting === app.id}
                        onClick={() => handleApprove(app.id)}
                        className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-500 disabled:opacity-50 transition-colors"
                      >
                        Approve
                      </button>
                      <button
                        disabled={acting === app.id}
                        onClick={() => handleReject(app.id)}
                        className="rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-red-500/50 hover:text-red-400 disabled:opacity-50 transition-colors"
                      >
                        Reject
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setExpandedId(expandedId === app.id ? null : app.id)}
                    className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    {expandedId === app.id ? 'Collapse' : 'Details'}
                  </button>
                </div>
              </div>

              {expandedId === app.id && app.cover_letter && (
                <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950/60 p-4">
                  <p className="mb-2 text-xs font-medium text-slate-400 uppercase tracking-wider">Cover Letter Preview</p>
                  <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap line-clamp-12">
                    {app.cover_letter}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
