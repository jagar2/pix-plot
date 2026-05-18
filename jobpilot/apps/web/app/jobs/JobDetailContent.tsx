'use client'

import { useEffect, useState } from 'react'
import { fetchJob, approveApplication, type Job } from '@/lib/api'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import MatchScore from '@/components/ui/MatchScore'

interface JobDetailContentProps {
  jobId: number
}

export default function JobDetailContent({ jobId }: JobDetailContentProps) {
  const [job, setJob] = useState<Job | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [coverLetter, setCoverLetter] = useState('')
  const [actionLoading, setActionLoading] = useState<'approve' | 'skip' | null>(null)
  const [actionDone, setActionDone] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetchJob(jobId)
      .then((j) => {
        setJob(j)
        setCoverLetter(j.cover_letter ?? '')
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load job'))
      .finally(() => setLoading(false))
  }, [jobId])

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (error || !job) {
    return (
      <div className="py-8 text-center text-sm text-red-400">
        {error ?? 'Job not found'}
      </div>
    )
  }

  async function handleApprove() {
    setActionLoading('approve')
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

  const analysis = job.match_analysis

  return (
    <div className="space-y-6">
      {/* Company info */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-400">{job.company_name}</p>
          {job.location && <p className="text-xs text-slate-500 mt-0.5">{job.location}</p>}
          {job.is_remote && (
            <span className="inline-flex mt-1 items-center rounded-full bg-teal-500/20 px-2 py-0.5 text-xs font-medium text-teal-400 border border-teal-500/30">
              Remote
            </span>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          {job.match_score !== null && job.match_score !== undefined && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Match:</span>
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
              View Career Page ↗
            </a>
          )}
        </div>
      </div>

      {/* Match Analysis */}
      {analysis && (
        <div className="rounded-xl bg-slate-900/60 border border-slate-700 p-4 space-y-4">
          <h3 className="text-sm font-semibold text-slate-300">Match Analysis</h3>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-500">Overall Score</span>
              <MatchScore score={analysis.score} size="md" />
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  analysis.score >= 80 ? 'bg-green-500' : analysis.score >= 65 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ width: `${Math.min(100, analysis.score)}%` }}
              />
            </div>
          </div>

          {analysis.explanation && (
            <p className="text-sm text-slate-400 leading-relaxed">{analysis.explanation}</p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {analysis.strengths.length > 0 && (
              <div>
                <p className="text-xs font-medium text-green-400 mb-2">Strengths</p>
                <ul className="space-y-1">
                  {analysis.strengths.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                      <span className="text-green-500 mt-0.5 shrink-0">✓</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {analysis.gaps.length > 0 && (
              <div>
                <p className="text-xs font-medium text-red-400 mb-2">Gaps</p>
                <ul className="space-y-1">
                  {analysis.gaps.map((g, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                      <span className="text-red-500 mt-0.5 shrink-0">✗</span>
                      {g}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Job Description */}
      {job.description && (
        <div>
          <h3 className="text-sm font-semibold text-slate-300 mb-2">Job Description</h3>
          <div className="rounded-xl bg-slate-900/60 border border-slate-700 p-4 max-h-48 overflow-y-auto scrollbar-thin">
            <p className="text-sm text-slate-400 whitespace-pre-wrap leading-relaxed">{job.description}</p>
          </div>
        </div>
      )}

      {/* Cover Letter */}
      <div>
        <h3 className="text-sm font-semibold text-slate-300 mb-2">Cover Letter</h3>
        <textarea
          value={coverLetter}
          onChange={(e) => setCoverLetter(e.target.value)}
          rows={8}
          className="w-full rounded-xl bg-slate-900/60 border border-slate-700 px-4 py-3 text-sm text-slate-300 placeholder-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50 resize-y leading-relaxed"
          placeholder="Cover letter will be generated when you run a scan..."
        />
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* Success */}
      {actionDone && (
        <p className="text-xs text-green-400 bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-2">
          {actionDone}
        </p>
      )}

      {/* Action buttons */}
      {!actionDone && (
        <div className="flex gap-3 pt-1">
          <button
            onClick={handleApprove}
            disabled={actionLoading !== null}
            className="flex-1 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed px-5 py-2.5 text-sm font-semibold text-white transition-colors"
          >
            {actionLoading === 'approve' ? 'Approving...' : 'Approve Application'}
          </button>
          <button
            onClick={handleSkip}
            disabled={actionLoading !== null}
            className="rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 border border-slate-600 px-5 py-2.5 text-sm font-semibold text-slate-300 transition-colors"
          >
            Skip Job
          </button>
        </div>
      )}
    </div>
  )
}
