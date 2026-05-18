'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { fetchJob, approveApplication, type Job } from '@/lib/api'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import MatchScore from '@/components/ui/MatchScore'

export default function JobDetailPage() {
  const params = useParams()
  const router = useRouter()
  const jobId = Number(params.id)

  const [job, setJob] = useState<Job | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [coverLetter, setCoverLetter] = useState('')
  const [actionLoading, setActionLoading] = useState<'approve' | 'skip' | null>(null)
  const [actionDone, setActionDone] = useState<string | null>(null)

  useEffect(() => {
    if (!jobId) return
    setLoading(true)
    fetchJob(jobId)
      .then((j) => {
        setJob(j)
        setCoverLetter(j.cover_letter ?? '')
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load job'))
      .finally(() => setLoading(false))
  }, [jobId])

  async function handleApprove() {
    setActionLoading('approve')
    setError(null)
    try {
      await approveApplication(jobId)
      setActionDone('Application approved and queued for submission!')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to approve')
    } finally {
      setActionLoading(null)
    }
  }

  function handleSkip() {
    setActionDone('Job skipped.')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (error && !job) {
    return (
      <div className="rounded-xl bg-red-900/20 border border-red-700/50 p-8 text-center">
        <p className="text-red-400 font-medium">Failed to load job</p>
        <p className="text-sm text-red-500/70 mt-1">{error}</p>
        <button
          onClick={() => router.back()}
          className="mt-4 rounded-lg bg-slate-700 hover:bg-slate-600 px-4 py-2 text-sm font-semibold text-white transition-colors"
        >
          Go Back
        </button>
      </div>
    )
  }

  if (!job) return null

  const analysis = job.match_analysis

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <button onClick={() => router.back()} className="text-slate-500 hover:text-slate-300 transition-colors">
          Jobs
        </button>
        <span className="text-slate-700">/</span>
        <span className="text-slate-300 truncate">{job.title}</span>
      </div>

      {/* Header */}
      <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-white">{job.title}</h1>
            <p className="text-slate-400 mt-1 font-medium">{job.company_name}</p>
            <div className="flex items-center gap-3 mt-2">
              {job.location && (
                <span className="text-sm text-slate-500">📍 {job.location}</span>
              )}
              {job.is_remote && (
                <span className="inline-flex items-center rounded-full bg-teal-500/20 px-2.5 py-0.5 text-xs font-medium text-teal-400 border border-teal-500/30">
                  Remote
                </span>
              )}
              {job.posted_at && (
                <span className="text-xs text-slate-600">
                  Posted {new Date(job.posted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            {job.match_score !== null && job.match_score !== undefined && (
              <div className="rounded-lg bg-slate-900/60 border border-slate-700 px-4 py-2 text-center">
                <p className="text-xs text-slate-500 mb-0.5">Match Score</p>
                <MatchScore score={job.match_score} size="lg" />
              </div>
            )}
            {job.job_url && (
              <a
                href={job.job_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:text-blue-300 underline"
              >
                View Original Posting ↗
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left column */}
        <div className="lg:col-span-3 space-y-6">
          {/* Job Description */}
          {job.description && (
            <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 p-5">
              <h2 className="text-base font-semibold text-white mb-3">Job Description</h2>
              <div className="text-sm text-slate-400 whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto scrollbar-thin pr-2">
                {job.description}
              </div>
            </div>
          )}

          {/* Cover Letter */}
          <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 p-5">
            <h2 className="text-base font-semibold text-white mb-3">Cover Letter</h2>
            <textarea
              value={coverLetter}
              onChange={(e) => setCoverLetter(e.target.value)}
              rows={10}
              className="w-full rounded-xl bg-slate-900/60 border border-slate-700 px-4 py-3 text-sm text-slate-300 placeholder-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50 resize-y leading-relaxed"
              placeholder="Cover letter will be generated after scanning..."
            />
          </div>

          {/* Action buttons */}
          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          {actionDone ? (
            <div className="text-sm text-green-400 bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3">
              {actionDone}
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={handleApprove}
                disabled={actionLoading !== null}
                className="flex-1 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed px-5 py-3 text-sm font-semibold text-white transition-colors"
              >
                {actionLoading === 'approve' ? 'Approving...' : 'Approve Application'}
              </button>
              <button
                onClick={handleSkip}
                disabled={actionLoading !== null}
                className="rounded-lg bg-slate-700 hover:bg-slate-600 border border-slate-600 px-5 py-3 text-sm font-semibold text-slate-300 transition-colors"
              >
                Skip Job
              </button>
            </div>
          )}
        </div>

        {/* Right column - Match Analysis */}
        <div className="lg:col-span-2">
          {analysis ? (
            <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 p-5 space-y-5">
              <h2 className="text-base font-semibold text-white">Match Analysis</h2>

              {/* Score bar */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs text-slate-500">Overall Match</span>
                  <MatchScore score={analysis.score} size="md" />
                </div>
                <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      analysis.score >= 80 ? 'bg-green-500' : analysis.score >= 65 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.min(100, analysis.score)}%` }}
                  />
                </div>
              </div>

              {/* Explanation */}
              {analysis.explanation && (
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">AI Analysis</p>
                  <p className="text-sm text-slate-400 leading-relaxed">{analysis.explanation}</p>
                </div>
              )}

              {/* Strengths */}
              {analysis.strengths.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-green-400 uppercase tracking-wide mb-2">Strengths</p>
                  <ul className="space-y-1.5">
                    {analysis.strengths.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                        <span className="text-green-500 shrink-0 mt-0.5">✓</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Gaps */}
              {analysis.gaps.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-red-400 uppercase tracking-wide mb-2">Gaps</p>
                  <ul className="space-y-1.5">
                    {analysis.gaps.map((g, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                        <span className="text-red-500 shrink-0 mt-0.5">✗</span>
                        {g}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 p-5 text-center text-sm text-slate-500">
              No match analysis available yet. Run a scan to generate analysis.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
