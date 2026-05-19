const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`API ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface DashboardStats {
  total_companies: number
  active_companies: number
  total_jobs: number
  jobs_matched: number
  total_applications: number
  pending_review: number
  applications_submitted: number
  success_rate: number
  avg_match_score: number | null
  applications_today: number
  scanner: ScannerStatus
  top_matching_jobs: Array<{
    id: number
    title: string
    company_id: number
    match_score: number | null
    status: string
    apply_url: string
  }>
}

export interface ActivityItem {
  id: number
  job_title: string
  company_name: string
  status: string
  changed_at: string
}

export interface CompanyBrief {
  id: number
  name: string
  domain: string
  ats_type: string | null
}

export interface Job {
  id: number
  company_id: number
  external_id: string
  title: string
  department: string | null
  location: string | null
  remote_type: string | null
  description: string | null
  requirements: string | null
  salary_min: number | null
  salary_max: number | null
  apply_url: string
  is_public_apply: boolean
  requires_login: boolean
  has_captcha: boolean
  match_score: number | null
  status: string
  first_seen_at: string
  posted_at: string | null
  company: CompanyBrief | null
}

export interface JobsResponse {
  items: Job[]
  total: number
  page: number
  page_size: number
  pages: number
}

export interface Application {
  id: number
  job_id: number
  status: string
  cover_letter: string | null
  tailored_resume_notes: string | null
  match_explanation: string | null
  answers: Record<string, string> | null
  submitted_at: string | null
  error_message: string | null
  created_at: string
  updated_at: string
  job: Job | null
}

export interface Company {
  id: number
  name: string
  domain: string
  career_page_url: string
  ats_type: string | null
  last_scanned_at: string | null
  jobs_found: number
  is_active: boolean
}

export interface Profile {
  id?: number
  full_name: string
  email: string
  phone: string | null
  linkedin_url: string | null
  github_url: string | null
  portfolio_url: string | null
  location_city: string | null
  location_state: string | null
  willing_to_relocate: boolean
  open_to_remote: boolean
  target_roles: string[]
  target_industries: string[]
  excluded_companies: string[]
  min_salary: number | null
  // stored as 0.0–1.0 on backend; UI shows/inputs as 0–100
  min_match_score: number
  auto_approve_threshold: number
  resume_filename: string | null
  skills: string[]
}

export interface ScannerStatus {
  is_scanning: boolean
  next_scan_at: string | null
  last_scan_at: string | null
}

// ── API Functions ──────────────────────────────────────────────────────────

export async function fetchStats(): Promise<DashboardStats> {
  return request<DashboardStats>('/dashboard/stats')
}

export async function fetchScannerStatus(): Promise<ScannerStatus> {
  return request<ScannerStatus>('/scanner/status')
}

export async function triggerScan(): Promise<{ message: string }> {
  return request<{ message: string }>('/scanner/trigger', { method: 'POST' })
}

export async function fetchJobs(params?: {
  status?: string
  min_match_score?: number
  remote_only?: boolean
  date_from?: string
  date_to?: string
  search?: string
  page?: number
  page_size?: number
}): Promise<JobsResponse> {
  const qs = new URLSearchParams()
  if (params?.status) qs.set('status', params.status)
  if (params?.min_match_score !== undefined) qs.set('min_match_score', String(params.min_match_score))
  if (params?.remote_only) qs.set('remote_only', 'true')
  if (params?.date_from) qs.set('date_from', params.date_from)
  if (params?.date_to) qs.set('date_to', params.date_to)
  if (params?.search) qs.set('search', params.search)
  if (params?.page !== undefined) qs.set('page', String(params.page))
  if (params?.page_size !== undefined) qs.set('page_size', String(params.page_size))
  const q = qs.toString()
  return request<JobsResponse>(`/jobs${q ? `?${q}` : ''}`)
}

export async function fetchJob(id: number): Promise<Job> {
  return request<Job>(`/jobs/${id}`)
}

export async function fetchApplications(params?: {
  status?: string
  job_id?: number
  page?: number
  page_size?: number
}): Promise<{ items: Application[]; total: number; pages: number; page: number }> {
  const qs = new URLSearchParams()
  if (params?.status) qs.set('status', params.status)
  if (params?.job_id !== undefined) qs.set('job_id', String(params.job_id))
  if (params?.page !== undefined) qs.set('page', String(params.page))
  if (params?.page_size !== undefined) qs.set('page_size', String(params.page_size))
  const q = qs.toString()
  return request<{ items: Application[]; total: number; pages: number; page: number }>(
    `/applications${q ? `?${q}` : ''}`
  )
}

export async function approveApplication(id: number): Promise<Application> {
  return request<Application>(`/applications/${id}/approve`, { method: 'POST' })
}

export async function rejectApplication(id: number): Promise<Application> {
  return request<Application>(`/applications/${id}/reject`, { method: 'POST' })
}

export async function fetchCompanies(): Promise<Company[]> {
  return request<Company[]>('/companies')
}

export async function createCompany(data: {
  name: string
  domain: string
  career_page_url: string
  ats_type?: string
}): Promise<Company> {
  return request<Company>('/companies', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateCompany(id: number, data: Partial<Company>): Promise<Company> {
  return request<Company>(`/companies/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function triggerCompanyScan(id: number): Promise<{ message: string }> {
  return request<{ message: string }>(`/companies/${id}/scan`, { method: 'POST' })
}

export async function fetchProfile(): Promise<Profile> {
  return request<Profile>('/profile')
}

export async function updateProfile(data: Partial<Profile>): Promise<Profile> {
  return request<Profile>('/profile', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function uploadResume(file: File): Promise<{ filename: string; parsed_skills: string[] }> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`${API_BASE}/profile/resume`, {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Upload ${res.status}: ${text}`)
  }
  return res.json()
}
