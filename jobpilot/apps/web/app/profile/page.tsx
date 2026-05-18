'use client'

import { useState, useEffect, useRef } from 'react'
import { fetchProfile, updateProfile, uploadResume, type Profile } from '@/lib/api'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']

function TagInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [input, setInput] = useState('')

  const add = () => {
    const trimmed = input.trim()
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed])
      setInput('')
    }
  }

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 flex flex-wrap gap-1.5 min-h-[42px]">
      {value.map(tag => (
        <span key={tag} className="flex items-center gap-1 rounded-full bg-blue-600/20 border border-blue-500/30 px-2 py-0.5 text-xs text-blue-400">
          {tag}
          <button onClick={() => onChange(value.filter(t => t !== tag))} className="hover:text-red-400 transition-colors">×</button>
        </span>
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() } }}
        onBlur={add}
        placeholder={placeholder}
        className="flex-1 min-w-24 bg-transparent text-sm text-slate-200 placeholder-slate-600 focus:outline-none"
      />
    </div>
  )
}

const emptyProfile: Profile = {
  name: '', email: '', phone: null, linkedin_url: null, github_url: null,
  portfolio_url: null, city: null, state: null, willing_to_relocate: false,
  open_to_remote: true, target_roles: [], target_industries: [],
  excluded_companies: [], min_salary: null, min_match_score: 65,
  auto_approve_threshold: 85, resume_filename: null, parsed_skills: [],
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile>(emptyProfile)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchProfile()
      .then(p => setProfile({ ...emptyProfile, ...p }))
      .catch(() => setProfile(emptyProfile))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const updated = await updateProfile(profile)
      setProfile({ ...emptyProfile, ...updated })
      setSaveMsg('Profile saved!')
      setTimeout(() => setSaveMsg(''), 3000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleResumeUpload = async (file: File) => {
    setUploading(true)
    setError(null)
    try {
      const res = await uploadResume(file)
      setProfile(p => ({
        ...p,
        resume_filename: res.filename,
        parsed_skills: res.parsed_skills || [],
      }))
      setSaveMsg('Resume uploaded and parsed!')
      setTimeout(() => setSaveMsg(''), 3000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const set = <K extends keyof Profile>(key: K, value: Profile[K]) =>
    setProfile(p => ({ ...p, [key]: value }))

  if (loading) return <div className="flex justify-center py-20"><LoadingSpinner /></div>

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Candidate Profile</h1>
          <p className="mt-1 text-sm text-slate-400">Your info, resume, and preferences drive job matching and applications.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {saveMsg && <div className="mb-4 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">{saveMsg}</div>}
      {error && <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}

      <div className="space-y-6">
        {/* Personal Info */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
          <h2 className="mb-4 text-base font-semibold text-white">Personal Info</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {([
              ['Full Name', 'name', 'text', 'Jane Doe'],
              ['Email', 'email', 'email', 'jane@example.com'],
              ['Phone', 'phone', 'tel', '+1 (555) 000-0000'],
              ['LinkedIn URL', 'linkedin_url', 'url', 'https://linkedin.com/in/...'],
              ['GitHub URL', 'github_url', 'url', 'https://github.com/...'],
              ['Portfolio / Website', 'portfolio_url', 'url', 'https://...'],
            ] as [string, keyof Profile, string, string][]).map(([label, key, type, placeholder]) => (
              <div key={key}>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">{label}</label>
                <input
                  type={type}
                  value={(profile[key] as string) || ''}
                  onChange={e => set(key, (e.target.value || null) as Profile[typeof key])}
                  placeholder={placeholder}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                />
              </div>
            ))}
          </div>
        </section>

        {/* Location */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
          <h2 className="mb-4 text-base font-semibold text-white">Location</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">City</label>
              <input
                type="text"
                value={profile.city || ''}
                onChange={e => set('city', e.target.value || null)}
                placeholder="San Francisco"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">State</label>
              <select
                value={profile.state || ''}
                onChange={e => set('state', e.target.value || null)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
              >
                <option value="">Select state...</option>
                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={profile.willing_to_relocate} onChange={e => set('willing_to_relocate', e.target.checked)} className="accent-blue-500" />
              <span className="text-sm text-slate-300">Willing to relocate</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={profile.open_to_remote} onChange={e => set('open_to_remote', e.target.checked)} className="accent-blue-500" />
              <span className="text-sm text-slate-300">Open to remote</span>
            </label>
          </div>
        </section>

        {/* Job Preferences */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
          <h2 className="mb-4 text-base font-semibold text-white">Job Preferences</h2>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Target Roles (press Enter to add)</label>
              <TagInput value={profile.target_roles} onChange={v => set('target_roles', v)} placeholder="Software Engineer, Product Manager..." />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Target Industries</label>
              <TagInput value={profile.target_industries} onChange={v => set('target_industries', v)} placeholder="FinTech, SaaS, Healthcare..." />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Excluded Companies</label>
              <TagInput value={profile.excluded_companies} onChange={v => set('excluded_companies', v)} placeholder="Companies to skip..." />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Minimum Salary (annual USD)</label>
              <input
                type="number"
                value={profile.min_salary || ''}
                onChange={e => set('min_salary', e.target.value ? Number(e.target.value) : null)}
                placeholder="80000"
                className="w-48 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
        </section>

        {/* Resume */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
          <h2 className="mb-4 text-base font-semibold text-white">Resume</h2>
          <div
            className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-700 bg-slate-800/30 px-6 py-10 text-center cursor-pointer hover:border-blue-500/50 transition-colors"
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleResumeUpload(f) }}
          >
            {uploading ? (
              <><LoadingSpinner /><p className="mt-2 text-sm text-slate-400">Parsing resume...</p></>
            ) : (
              <>
                <div className="text-3xl mb-2">📄</div>
                <p className="text-sm font-medium text-slate-300">
                  {profile.resume_filename || 'Drop your resume here or click to upload'}
                </p>
                <p className="mt-1 text-xs text-slate-500">PDF or DOCX, max 10MB</p>
              </>
            )}
            <input ref={fileRef} type="file" accept=".pdf,.docx" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleResumeUpload(f) }} />
          </div>
          {profile.parsed_skills.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium text-slate-400">Parsed Skills</p>
              <div className="flex flex-wrap gap-1.5">
                {profile.parsed_skills.map(skill => (
                  <span key={skill} className="rounded-full bg-slate-700/60 px-2 py-0.5 text-xs text-slate-300">{skill}</span>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Matching Settings */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
          <h2 className="mb-4 text-base font-semibold text-white">Matching Settings</h2>
          <div className="space-y-5">
            <div>
              <div className="mb-2 flex justify-between text-xs text-slate-400">
                <label>Minimum Match Score</label>
                <span className="font-medium text-white">{profile.min_match_score}%</span>
              </div>
              <input type="range" min={10} max={100} step={5} value={profile.min_match_score}
                onChange={e => set('min_match_score', Number(e.target.value))}
                className="w-full accent-blue-500" />
              <p className="mt-1 text-xs text-slate-500">Jobs below this score will not be queued for application.</p>
            </div>
            <div>
              <div className="mb-2 flex justify-between text-xs text-slate-400">
                <label>Auto-Approve Threshold</label>
                <span className="font-medium text-white">{profile.auto_approve_threshold}%</span>
              </div>
              <input type="range" min={profile.min_match_score} max={100} step={5} value={profile.auto_approve_threshold}
                onChange={e => set('auto_approve_threshold', Number(e.target.value))}
                className="w-full accent-green-500" />
              <p className="mt-1 text-xs text-slate-500">Applications above this score are auto-approved without manual review.</p>
            </div>
          </div>
        </section>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Profile'}
        </button>
      </div>
    </div>
  )
}
