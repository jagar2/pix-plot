'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchScannerStatus, triggerScan, type ScannerStatus } from '@/lib/api'
import LoadingSpinner from './LoadingSpinner'

function useCountdown(targetDate: string | null) {
  const [remaining, setRemaining] = useState<string>('—')

  useEffect(() => {
    if (!targetDate) {
      setRemaining('—')
      return
    }

    function update() {
      const diff = new Date(targetDate!).getTime() - Date.now()
      if (diff <= 0) {
        setRemaining('Now')
        return
      }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      if (h > 0) {
        setRemaining(`${h}h ${m}m`)
      } else if (m > 0) {
        setRemaining(`${m}m ${s}s`)
      } else {
        setRemaining(`${s}s`)
      }
    }

    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [targetDate])

  return remaining
}

export default function ScanStatus() {
  const [status, setStatus] = useState<ScannerStatus | null>(null)
  const [triggering, setTriggering] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const countdown = useCountdown(status?.next_scan_at ?? null)

  const refresh = useCallback(() => {
    fetchScannerStatus().then(setStatus).catch(() => null)
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 30000)
    return () => clearInterval(id)
  }, [refresh])

  async function handleTrigger() {
    setTriggering(true)
    setMessage(null)
    try {
      const res = await triggerScan()
      setMessage(res.message)
      setTimeout(refresh, 2000)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed to trigger scan')
    } finally {
      setTriggering(false)
    }
  }

  return (
    <div className="rounded-xl bg-slate-800/60 border border-slate-700/50 p-5 flex items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          {status?.is_scanning ? (
            <>
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
              </span>
              <span className="text-sm font-medium text-green-400">Scanning</span>
            </>
          ) : (
            <>
              <span className="relative flex h-3 w-3">
                <span className="relative inline-flex rounded-full h-3 w-3 bg-slate-500" />
              </span>
              <span className="text-sm font-medium text-slate-400">Idle</span>
            </>
          )}
        </div>
        {!status?.is_scanning && status?.next_scan_at && (
          <div className="text-sm text-slate-400">
            Next scan in: <span className="font-semibold text-blue-400 tabular-nums">{countdown}</span>
          </div>
        )}
        {status?.last_scan_at && (
          <div className="text-xs text-slate-500 hidden lg:block">
            Last run: {new Date(status.last_scan_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        {message && (
          <span className="text-xs text-slate-400 max-w-[200px] truncate">{message}</span>
        )}
        <button
          onClick={handleTrigger}
          disabled={triggering || status?.is_scanning}
          className="flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-sm font-semibold text-white transition-colors"
        >
          {triggering ? <LoadingSpinner size="sm" /> : <span>⚡</span>}
          {triggering ? 'Starting...' : 'Trigger Scan'}
        </button>
      </div>
    </div>
  )
}
