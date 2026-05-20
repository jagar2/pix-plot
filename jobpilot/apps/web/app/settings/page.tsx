'use client'

import { useState } from 'react'
import { triggerScan } from '@/lib/api'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function SettingsPage() {
  const [scanInterval, setScanInterval] = useState(60)
  const [maxAppsPerDay, setMaxAppsPerDay] = useState(20)
  const [notifyOnMatch, setNotifyOnMatch] = useState(true)
  const [notifyOnSubmit, setNotifyOnSubmit] = useState(true)
  const [autoApplyEnabled, setAutoApplyEnabled] = useState(false)
  const [triggerLoading, setTriggerLoading] = useState(false)
  const [triggerMessage, setTriggerMessage] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleTriggerScan() {
    setTriggerLoading(true)
    setTriggerMessage(null)
    try {
      const res = await triggerScan()
      setTriggerMessage(res.message)
    } catch (e) {
      setTriggerMessage(e instanceof Error ? e.message : 'Failed to trigger scan')
    } finally {
      setTriggerLoading(false)
    }
  }

  function handleSave() {
    // Settings are stored locally for now; backend settings endpoint can be wired up
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const sectionClass = 'rounded-xl bg-slate-800/60 border border-slate-700/50 p-6 space-y-5'
  const inputClass =
    'w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50'

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-slate-400 mt-0.5">Configure JobPilot AutoApply behavior</p>
      </div>

      {/* Scanner Settings */}
      <div className={sectionClass}>
        <h2 className="text-base font-semibold text-white border-b border-slate-700 pb-3">Scanner Settings</h2>

        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-sm font-medium text-slate-300">Scan Interval</label>
            <span className="text-sm font-bold text-blue-400">{scanInterval} min</span>
          </div>
          <input
            type="range"
            min={15}
            max={360}
            step={15}
            value={scanInterval}
            onChange={(e) => setScanInterval(Number(e.target.value))}
            className="w-full h-2 bg-slate-700 rounded-full accent-blue-500 cursor-pointer"
          />
          <div className="flex justify-between text-xs text-slate-600 mt-1">
            <span>15 min</span>
            <span>6 hours</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Max Applications Per Day</label>
          <input
            type="number"
            value={maxAppsPerDay}
            onChange={(e) => setMaxAppsPerDay(Math.max(1, Math.min(100, Number(e.target.value))))}
            min={1}
            max={100}
            className={inputClass + ' max-w-xs'}
          />
          <p className="text-xs text-slate-500 mt-1">Limit daily auto-submissions to avoid spam flags.</p>
        </div>

        <div className="rounded-lg bg-slate-900/60 border border-slate-700 p-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setAutoApplyEnabled(!autoApplyEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                autoApplyEnabled ? 'bg-blue-600' : 'bg-slate-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  autoApplyEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </div>
            <div>
              <span className="text-sm font-medium text-slate-200">Enable Auto-Apply</span>
              <p className="text-xs text-slate-500 mt-0.5">
                Automatically submit applications that meet the auto-approve threshold set in your profile.
              </p>
            </div>
          </label>
          {autoApplyEnabled && (
            <p className="mt-3 text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
              Warning: Applications will be submitted automatically. Review your profile thresholds carefully.
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleTriggerScan}
            disabled={triggerLoading}
            className="flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white transition-colors"
          >
            {triggerLoading ? <LoadingSpinner size="sm" /> : <span>⚡</span>}
            {triggerLoading ? 'Starting...' : 'Trigger Manual Scan'}
          </button>
          {triggerMessage && (
            <span className="text-xs text-slate-400">{triggerMessage}</span>
          )}
        </div>
      </div>

      {/* Notification Settings */}
      <div className={sectionClass}>
        <h2 className="text-base font-semibold text-white border-b border-slate-700 pb-3">Notifications</h2>

        <div className="space-y-4">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <span className="text-sm font-medium text-slate-200">New Job Match</span>
              <p className="text-xs text-slate-500 mt-0.5">Notify when a job meets your match threshold</p>
            </div>
            <div
              onClick={() => setNotifyOnMatch(!notifyOnMatch)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                notifyOnMatch ? 'bg-blue-600' : 'bg-slate-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  notifyOnMatch ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </div>
          </label>

          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <span className="text-sm font-medium text-slate-200">Application Submitted</span>
              <p className="text-xs text-slate-500 mt-0.5">Notify when an application is successfully submitted</p>
            </div>
            <div
              onClick={() => setNotifyOnSubmit(!notifyOnSubmit)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                notifyOnSubmit ? 'bg-blue-600' : 'bg-slate-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  notifyOnSubmit ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </div>
          </label>
        </div>
      </div>

      {/* API Info */}
      <div className={sectionClass}>
        <h2 className="text-base font-semibold text-white border-b border-slate-700 pb-3">API Configuration</h2>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Backend API URL</label>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-400 font-mono">
              {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}
            </code>
          </div>
          <p className="text-xs text-slate-600 mt-1">Set via NEXT_PUBLIC_API_URL environment variable.</p>
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          className="rounded-lg bg-blue-600 hover:bg-blue-500 px-6 py-2.5 text-sm font-semibold text-white transition-colors"
        >
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}
