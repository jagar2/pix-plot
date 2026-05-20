'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { fetchScannerStatus, type ScannerStatus } from '@/lib/api'

const navItems = [
  { href: '/', label: 'Dashboard', icon: '📊' },
  { href: '/jobs', label: 'Jobs', icon: '💼' },
  { href: '/applications', label: 'Applications', icon: '📝' },
  { href: '/companies', label: 'Companies', icon: '🏢' },
  { href: '/profile', label: 'Profile', icon: '👤' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [scannerStatus, setScannerStatus] = useState<ScannerStatus | null>(null)

  useEffect(() => {
    fetchScannerStatus().then(setScannerStatus).catch(() => null)
    const interval = setInterval(() => {
      fetchScannerStatus().then(setScannerStatus).catch(() => null)
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-slate-900 border-r border-slate-800">
      <div className="flex h-16 items-center gap-3 px-5 border-b border-slate-800">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white text-sm font-bold">
          JP
        </div>
        <span className="text-white font-semibold text-base tracking-tight">JobPilot</span>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3">
        <ul className="space-y-0.5">
          {navItems.map(({ href, label, icon }) => {
            const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <span className="text-base leading-none">{icon}</span>
                  {label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="border-t border-slate-800 px-4 py-4">
        <div className="flex items-center gap-2.5 rounded-lg bg-slate-800/60 px-3 py-2.5">
          {scannerStatus?.is_scanning ? (
            <>
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
              </span>
              <span className="text-xs text-green-400 font-medium">Scanning...</span>
            </>
          ) : (
            <>
              <span className="relative flex h-2.5 w-2.5">
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-slate-500" />
              </span>
              <span className="text-xs text-slate-400 font-medium">Scanner Idle</span>
            </>
          )}
        </div>
      </div>
    </aside>
  )
}
