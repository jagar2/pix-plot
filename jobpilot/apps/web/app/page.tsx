'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { fetchStats, type DashboardStats, type ActivityItem, type Job } from '@/lib/api'
import StatCard from '@/components/ui/StatCard'
import MatchScore from '@/components/ui/MatchScore'
import ScanStatus from '@/components/ui/ScanStatus'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

function formatRelativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const activityStatusColors: Record<string, string> = {
  submitted: 'text-blue-400',
  approved: 'text-green-400',
  rejected: 'text-red-400',
  failed: 'text-red-400',
  pending_review: 'text-yellow-400',
  matched: 'text-purple-400',
}

function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-slate-500">
        No recent activity. Trigger a scan to get started.
      </div>
    )
  }
  return (
    <ul className="divide-y divide-slate-800">
      {items.map((item) => {
        const statusKey = item.status?.toLowerCase().replace(/ /g, '_')
        const colorClass = activityStatusColors[statusKey] ?? 'text-slate-400'
        return (
          <li key={item.id} className="flex items-center justify-between gap-4 py-3 px-1">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-200 truncate">{item.job_title}</p>
              <p className="text-xs text-slate-500 mt-0.5">{item.company_name}</p>
            </div>
            <div className="flex flex-col items-end shrink-0 gap-0.5">
              <span className={`text-xs font-semibold capitalize ${colorClass}`}>
                {item.status?.replace(/_/g, ' ')}
              </span>
              <span className="text-xs text-slate-600">{formatRelativeTime(item.changed_at)}</span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function TopJobsTable({ jobs }: { jobs: Job[] }) {
  if (jobs.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-slate-500">
        No matched jobs yet. Run a scan to find opportunities.
      </div>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-700">
            <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">Company</th>
            <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">Title</th>
            <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">Match</th>
            <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">Remote</th>
            <th className="px-3 py-2.5 text-right text-xs font-medium text-slate-500 uppercase tracking-wide">Action</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id} className="border-b border-slate-800/70 hover:bg-slate-800/30 transition-colors">
              <td className="px-3 py-3 text-sm font-medium text-slate-200">{job.company_name}</td>
              <td className="px-3 py-3 text-sm text-slate-300">{job.title}</td>
              <td className="px-3 py-3 min-w-[120px]">
                {job.match_score !== null && job.match_score !== undefined ? (
                  <MatchScore score={job.match_score} showBar />
                ) : (
                  <span className="text-xs text-slate-500">—</span>
                )}
              </td>
              <td className="px-3 py-3">
                {job.is_remote ? (
                  <span className="inline-flex items-center rounded-full bg-teal-500/20 px-2 py-0.5 text-xs font-medium text-teal-400 border border-teal-500/30">
                    Yes
                  </span>
                ) : (
                  <span className="text-xs text-slate-500">No</span>
                )}
              </td>
              <td className="px-3 py-3 text-right">
                <Link
                  href={`/jobs/${job.id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
                >
                  Apply
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await fetchStats()
      setStats(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 60000)
    return () => clearInterval(id)
  }, [load])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl bg-red-900/20 border border-red-700/50 p-8 text-center">
        <p className="text-red-400 font-medium">Failed to load dashboard</p>
        <p className="text-sm text-red-500/70 mt-1">{error}</p>
        <button
          onClick={load}
          className="mt-4 rounded-lg bg-red-700 hover:bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-slate-400 mt-0.5">Overview of your job search automation</p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/applications?tab=pending_review"
            className="rounded-lg bg-slate-700 hover:bg-slate-600 border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 transition-colors"
          >
            Review Pending
          </Link>
        </div>
      </div>

      {/* Scanner status */}
      <ScanStatus />

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard
          label="Total Jobs Found"
          value={stats?.total_jobs_found ?? 0}
          icon="🔍"
        />
        <StatCard
          label="Jobs Matched (≥65%)"
          value={stats?.jobs_matched ?? 0}
          icon="✅"
          colorClass="text-green-400"
        />
        <StatCard
          label="Pending Review"
          value={stats?.pending_review ?? 0}
          icon="⏳"
          colorClass="text-yellow-400"
        />
        <StatCard
          label="Submitted"
          value={stats?.applications_submitted ?? 0}
          icon="📤"
          colorClass="text-blue-400"
        />
        <StatCard
          label="Success Rate"
          value={
            stats?.success_rate !== undefined
              ? `${stats.success_rate.toFixed(1)}%`
              : '0%'
          }
          icon="🎯"
          colorClass="text-purple-400"
        />
      </div>

      {/* Two-column section */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Top matching jobs */}
        <div className="lg:col-span-3 rounded-xl bg-slate-800/60 border border-slate-700/50 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white">Top Matching Jobs</h2>
            <Link
              href="/jobs"
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              View all →
            </Link>
          </div>
          <TopJobsTable jobs={stats?.top_matching_jobs ?? []} />
        </div>

        {/* Recent Activity */}
        <div className="lg:col-span-2 rounded-xl bg-slate-800/60 border border-slate-700/50 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white">Recent Activity</h2>
            <Link
              href="/applications"
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              View all →
            </Link>
          </div>
          <ActivityFeed items={stats?.recent_activity ?? []} />
        </div>
      </div>
    </div>
  )
}
