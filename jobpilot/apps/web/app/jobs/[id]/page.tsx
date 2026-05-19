'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { fetchJob, fetchApplications, approveApplication, rejectApplication, type Job, type Application } from '@/lib/api'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

const STATUS_COLORS: Record<string, string> = {
  pending_review: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  approved: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  submitted: 'bg-green-500/20 text-green-400 border-green-500/30',
  failed: 'bg-red-500/20 text-red-400 border-red-500/30',
  rejected_by_user: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  submitting: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  skipped: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
}

export default function JobDetailPage() {
  const params = useParams()
  const router = useRouter()
  const jobId = Number(params.id)

  const [job, setJob] = useState<Job | null>(null)
  const [application, setApplication] = useState<Application | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<'approve' | 'reject' | null>(null)
  const [actionDone, setActionDone] = useState<string | null>(null)

  useEffect(() => {
    if (!jobId) return
    setLoading(true)
    Promise.all([
      fetchJob(jobId),
      fetchApplications({ page_size: 100 }),
    ])
      .then(([j, appsRes]) => {
        setJob(j)
        const match = appsRes.items.find(a => a.job_id === jobId) || null
        setApplication(match)
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load job'))
      .finally(() => setLoading(false))
  }, [jobId])

  async function handleApprove() {
    if (!application) return
    setActionLoading('approve')
    setError(null)
    try {
      const updated = await approveApplication(application.id)
      setApplication(updated)
      setActionDone('Application approved — queued for submission!')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to approve')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleReject() {
    if (!application) return
    setActionLoading('reject')
    setError(null)
    try {
      const updated = await rejectApplication(application.id)
      setApplication(updated)
      setActionDone('Application rejected.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reject')
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-96"><LoadingSpinner size="lg" /></div>
  }

  if (error && !job) {
    return (
      <div className="rounded-xl bg-red-900/20 border border-red-700/50 p-8 text-center">
        <p className="text-red-400 font-medium">Failed to load job</p>
        <p className="text-sm text-red-500/70 mt-1">{error}</p>
        <button onClick={() => router.back()} className="mt-4 rounded-lg bg-slate-700 hover:bg-slate-600 px-4 py-2 text-sm font-semibold text-white transition-colors">
          Go Back
        </button>
      </div>
    )
  }

  if (!job) return null

  const canDecide = application && application.status === 'pending_review'

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <button onClick={() => router.back()} className="text-slate-500 hover:text-slate-300 transition-colors">Jobs</button>
        <span className="text-slate-700">/</span>
        <span className="text-slate-300 truncate">{job.title}</span>
      </div>

      {/* Header */}
      <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-white">{job.title}</h1>
            <p className="text-slate-400 mt-1 font-medium">{job.company?.name || '—'}</p>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {job.location && <span className="text-sm text-slate-500">📍 {job.location}</span>}
              {job.remote_type === 'remote' && (
                <span className="inline-flex items-center rounded-full bg-teal-500/20 px-2.5 py-0.5 text-xs font-medium text-teal-400 border border-teal-500/30">Remote</span>
              )}
              {job.posted_at && (
                <span className="text-xs text-slate-600">
                  Posted {new Date(job.posted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              )}
              {(job.salary_min || job.salary_max) && (
                <span className="text-xs text-slate-500">
                  💰 {job.salary_min ? `$${job.salary_min.toLocaleString()}` : ''}
                  {job.salary_min && job.salary_max ? '–' : ''}
                  {job.salary_max ? `$${job.salary_max.toLocaleString()}` : ''}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            {job.match_score != null && (
              <div className="rounded-lg bg-slate-900/60 border border-slate-700 px-4 py-2 text-center">
                <p className="text-xs text-slate-500 mb-0.5">Match Score</p>
                <span className="text-2xl font-bold text-green-400">{Math.round(job.match_score * 100)}%</span>
              </div>
            )}
            <a href={job.apply_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300 underline">
              View Original Posting ↗
            </a>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left column */}
        <div className="lg:col-span-3 space-y-6">
          {job.description && (
            <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 p-5">
              <h2 className="text-base font-semibold text-white mb-3">Job Description</h2>
              <div className="text-sm text-slate-400 whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto pr-2">
                {job.description}
              </div>
            </div>
          )}

          {application?.cover_letter && (
            <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 p-5">
              <h2 className="text-base font-semibold text-white mb-3">Cover Letter</h2>
              <div className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                {application.cover_letter}
              </div>
            </div>
          )}

          {/* Action buttons */}
          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</p>
          )}
          {actionDone ? (
            <div className="text-sm text-green-400 bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3">{actionDone}</div>
          ) : application ? (
            canDecide ? (
              <div className="flex gap-3">
                <button
                  onClick={handleApprove}
                  disabled={actionLoading !== null}
                  className="flex-1 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-5 py-3 text-sm font-semibold text-white transition-colors"
                >
                  {actionLoading === 'approve' ? 'Approving...' : 'Approve Application'}
                </button>
                <button
                  onClick={handleReject}
                  disabled={actionLoading !== null}
                  className="rounded-lg bg-slate-700 hover:bg-slate-600 border border-slate-600 px-5 py-3 text-sm font-semibold text-slate-300 transition-colors"
                >
                  {actionLoading === 'reject' ? 'Rejecting...' : 'Reject'}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/40 px-4 py-3">
                <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[application.status] || ''}`}>
                  {application.status.replace(/_/g, ' ')}
                </span>
                <span className="text-sm text-slate-400">
                  {application.status === 'submitted' ? 'Successfully submitted.' :
                   application.status === 'approved' ? 'Queued for submission.' :
                   application.status === 'submitting' ? 'Currently submitting...' :
                   application.status === 'failed' ? (application.error_message || 'Submission failed.') :
                   'Application decided.'}
                </span>
              </div>
            )
          ) : (
            <div className="rounded-xl border border-slate-700 bg-slate-800/40 px-4 py-3 text-sm text-slate-500">
              No application generated for this job yet. Trigger a scan to match it to your profile.
            </div>
          )}
        </div>

        {/* Right column - Match info */}
        <div className="lg:col-span-2 space-y-4">
          {application?.match_explanation && (
            <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 p-5">
              <h2 className="text-base font-semibold text-white mb-3">Match Analysis</h2>
              <p className="text-sm text-slate-400 leading-relaxed">{application.match_explanation}</p>
            </div>
          )}
          {application?.tailored_resume_notes && (
            <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 p-5">
              <h2 className="text-sm font-semibold text-slate-300 mb-2">Resume Highlights</h2>
              <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap">{application.tailored_resume_notes}</p>
            </div>
          )}
          {job.requirements && (
            <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 p-5">
              <h2 className="text-sm font-semibold text-slate-300 mb-2">Requirements</h2>
              <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap">{job.requirements}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
