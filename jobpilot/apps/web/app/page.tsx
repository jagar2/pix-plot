'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { fetchStats, type DashboardStats } from '@/lib/api'
import StatCard from '@/components/ui/StatCard'
import MatchScore from '@/components/ui/MatchScore'
import ScanStatus from '@/components/ui/ScanStatus'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

type TopJob = DashboardStats['top_matching_jobs'][number]

function TopJobsTable({ jobs }: { jobs: TopJob[] }) {
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
            <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">Title</th>
            <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">Match</th>
            <th className="px-3 py-2.5 text-right text-xs font-medium text-slate-500 uppercase tracking-wide">Action</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id} className="border-b border-slate-800/70 hover:bg-slate-800/30 transition-colors">
              <td className="px-3 py-3 text-sm text-slate-200 font-medium truncate max-w-[200px]">{job.title}</td>
              <td className="px-3 py-3 min-w-[120px]">
                {job.match_score != null
                  ? <MatchScore score={Math.round(job.match_score * 100)} showBar />
                  : <span className="text-xs text-slate-500">—</span>}
              </td>
              <td className="px-3 py-3 text-right">
                <Link href={`/jobs/${job.id}`}
                  className="inline-flex rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors">
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RecentStats({ stats }: { stats: DashboardStats }) {
  const rows = [
    { label: 'Active companies tracked', value: stats.active_companies },
    { label: 'Applications today', value: stats.applications_today },
    { label: 'Avg match score', value: stats.avg_match_score != null ? `${stats.avg_match_score}%` : '—' },
    { label: 'Total applications', value: stats.total_applications },
  ]
  return (
    <ul className="divide-y divide-slate-800">
      {rows.map(r => (
        <li key={r.label} className="flex items-center justify-between py-3 px-1">
          <span className="text-sm text-slate-400">{r.label}</span>
          <span className="text-sm font-semibold text-white">{r.value}</span>
        </li>
      ))}
    </ul>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setStats(await fetchStats())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 30000)
    return () => clearInterval(id)
  }, [load])

  if (loading) return <div className="flex items-center justify-center h-96"><LoadingSpinner size="lg" /></div>

  if (error) return (
    <div className="rounded-xl bg-red-900/20 border border-red-700/50 p-8 text-center">
      <p className="text-red-400 font-medium">Failed to load dashboard</p>
      <p className="text-sm text-red-500/70 mt-1">{error}</p>
      <button onClick={load} className="mt-4 rounded-lg bg-red-700 hover:bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors">
        Retry
      </button>
    </div>
  )

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-slate-400 mt-0.5">Overview of your job search automation</p>
        </div>
        <Link href="/applications"
          className="rounded-lg bg-slate-700 hover:bg-slate-600 border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 transition-colors">
          Review Pending
        </Link>
      </div>

      <ScanStatus />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard label="Jobs Found" value={stats?.total_jobs ?? 0} icon="🔍" />
        <StatCard label="Matched" value={stats?.jobs_matched ?? 0} icon="✅" colorClass="text-green-400" />
        <StatCard label="Pending Review" value={stats?.pending_review ?? 0} icon="⏳" colorClass="text-yellow-400" />
        <StatCard label="Submitted" value={stats?.applications_submitted ?? 0} icon="📤" colorClass="text-blue-400" />
        <StatCard label="Success Rate" value={`${stats?.success_rate?.toFixed(1) ?? '0'}%`} icon="🎯" colorClass="text-purple-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 rounded-xl bg-slate-800/60 border border-slate-700/50 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white">Top Matching Jobs</h2>
            <Link href="/jobs" className="text-xs text-blue-400 hover:text-blue-300 transition-colors">View all →</Link>
          </div>
          <TopJobsTable jobs={stats?.top_matching_jobs ?? []} />
        </div>

        <div className="lg:col-span-2 rounded-xl bg-slate-800/60 border border-slate-700/50 p-5">
          <h2 className="mb-4 font-semibold text-white">Quick Stats</h2>
          {stats && <RecentStats stats={stats} />}
        </div>
      </div>
    </div>
  )
}
