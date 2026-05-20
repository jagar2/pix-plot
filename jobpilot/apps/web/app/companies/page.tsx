'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchCompanies, createCompany, updateCompany, triggerCompanyScan, type Company } from '@/lib/api'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Modal from '@/components/ui/Modal'

const ATS_COLORS: Record<string, string> = {
  greenhouse: 'bg-emerald-500/20 text-emerald-400',
  lever: 'bg-blue-500/20 text-blue-400',
  workday: 'bg-orange-500/20 text-orange-400',
  bamboohr: 'bg-pink-500/20 text-pink-400',
  ashby: 'bg-violet-500/20 text-violet-400',
  smartrecruiters: 'bg-cyan-500/20 text-cyan-400',
  icims: 'bg-yellow-500/20 text-yellow-400',
  custom: 'bg-slate-500/20 text-slate-400',
  unknown: 'bg-slate-700/40 text-slate-500',
}

const ATS_TYPES = ['greenhouse', 'lever', 'workday', 'bamboohr', 'ashby', 'smartrecruiters', 'icims', 'jobvite', 'rippling', 'custom', 'unknown']

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [scanning, setScanning] = useState<number | null>(null)
  const [search, setSearch] = useState('')

  const [newCompany, setNewCompany] = useState({
    name: '', domain: '', career_page_url: '', ats_type: 'unknown'
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchCompanies()
      setCompanies(Array.isArray(res) ? res : ((res as { items?: Company[] }).items || []))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load companies')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleAdd = async () => {
    try {
      await createCompany(newCompany)
      setShowAddModal(false)
      setNewCompany({ name: '', domain: '', career_page_url: '', ats_type: 'unknown' })
      await load()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to add company')
    }
  }

  const handleToggleActive = async (company: Company) => {
    try {
      await updateCompany(company.id, { is_active: !company.is_active })
      await load()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to update')
    }
  }

  const handleScan = async (id: number) => {
    setScanning(id)
    try {
      await triggerCompanyScan(id)
      await load()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Scan failed')
    } finally {
      setScanning(null)
    }
  }

  const filtered = companies.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.domain.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Companies</h1>
          <p className="mt-1 text-sm text-slate-400">{companies.length} companies tracked</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
        >
          + Add Company
        </button>
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="Search companies..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-sm rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
        />
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><LoadingSpinner /></div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Domain</th>
                <th className="px-4 py-3">ATS</th>
                <th className="px-4 py-3">Last Scanned</th>
                <th className="px-4 py-3">Active</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-500">No companies found.</td></tr>
              ) : filtered.map(company => (
                <tr key={company.id} className="bg-slate-900/20 hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <a href={company.career_page_url} target="_blank" rel="noopener noreferrer"
                      className="font-medium text-white hover:text-blue-400 transition-colors">
                      {company.name}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{company.domain}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ATS_COLORS[company.ats_type || 'unknown']}`}>
                      {company.ats_type || 'unknown'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {company.last_scanned_at ? new Date(company.last_scanned_at).toLocaleString() : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggleActive(company)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        company.is_active ? 'bg-blue-600' : 'bg-slate-700'
                      }`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        company.is_active ? 'translate-x-4.5' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleScan(company.id)}
                      disabled={scanning === company.id}
                      className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-blue-500/50 hover:text-blue-400 disabled:opacity-50 transition-colors"
                    >
                      {scanning === company.id ? 'Scanning...' : 'Scan Now'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add Company">
        <div className="space-y-4">
          {(['name', 'domain', 'career_page_url'] as const).map(field => (
            <div key={field}>
              <label className="mb-1.5 block text-xs font-medium text-slate-400 capitalize">
                {field.replace(/_/g, ' ')}
              </label>
              <input
                type="text"
                value={newCompany[field]}
                onChange={e => setNewCompany(c => ({ ...c, [field]: e.target.value }))}
                placeholder={field === 'career_page_url' ? 'https://...' : field === 'domain' ? 'company.com' : 'Company Name'}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
          ))}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">ATS Type</label>
            <select
              value={newCompany.ats_type}
              onChange={e => setNewCompany(c => ({ ...c, ats_type: e.target.value }))}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
            >
              {ATS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleAdd}
              disabled={!newCompany.name || !newCompany.domain || !newCompany.career_page_url}
              className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
            >
              Add Company
            </button>
            <button
              onClick={() => setShowAddModal(false)}
              className="flex-1 rounded-lg border border-slate-700 py-2 text-sm text-slate-300 hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
