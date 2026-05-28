document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  wireTabs();
  wireButtons();
  await renderLog();
});

// ─── Load / Save ──────────────────────────────────────────────────────────────

async function loadSettings() {
  const data = await chrome.storage.local.get([
    'profile', 'resumeText', 'coverLetterTemplate', 'anthropicApiKey', 'accountPassword',
  ]);

  const p = data.profile || {};
  document.getElementById('fullName').value = p.full_name || '';
  document.getElementById('email').value = p.email || '';
  document.getElementById('phone').value = p.phone || '';
  document.getElementById('location').value = p.location || '';
  document.getElementById('linkedin').value = p.linkedin_url || '';
  document.getElementById('portfolio').value = p.portfolio_url || '';
  document.getElementById('yearsExp').value = p.years_of_experience || '';

  document.getElementById('resumeText').value = data.resumeText || '';
  document.getElementById('coverText').value = data.coverLetterTemplate || '';
  document.getElementById('apiKey').value = data.anthropicApiKey || '';
  document.getElementById('accountPassword').value = data.accountPassword || '';
}

async function saveSettings() {
  const profile = {
    full_name: document.getElementById('fullName').value.trim(),
    email: document.getElementById('email').value.trim(),
    phone: document.getElementById('phone').value.trim(),
    location: document.getElementById('location').value.trim(),
    linkedin_url: document.getElementById('linkedin').value.trim(),
    portfolio_url: document.getElementById('portfolio').value.trim(),
    years_of_experience: parseInt(document.getElementById('yearsExp').value) || 0,
  };

  await chrome.storage.local.set({
    profile,
    resumeText: document.getElementById('resumeText').value,
    coverLetterTemplate: document.getElementById('coverText').value,
    anthropicApiKey: document.getElementById('apiKey').value.trim(),
    accountPassword: document.getElementById('accountPassword').value,
  });

  const status = document.getElementById('saveStatus');
  status.textContent = '✓ Saved';
  status.classList.add('show');
  setTimeout(() => status.classList.remove('show'), 2500);
}

// ─── Application Log ──────────────────────────────────────────────────────────

async function renderLog() {
  const { applicationLog = [] } = await chrome.storage.local.get('applicationLog');
  const container = document.getElementById('logTable');

  if (applicationLog.length === 0) {
    container.innerHTML = '<p class="hint">No applications logged yet.</p>';
    return;
  }

  const rows = applicationLog.map(entry => {
    const score = entry.fitScore ?? '—';
    const scoreClass = score >= 70 ? 'score-high' : score >= 50 ? 'score-mid' : 'score-low';
    const date = entry.appliedAt ? new Date(entry.appliedAt).toLocaleDateString() : '—';
    const company = esc(entry.company || '—');
    const title = entry.url
      ? `<a href="${esc(entry.url)}" target="_blank">${esc(entry.title || '—')}</a>`
      : esc(entry.title || '—');
    const platform = esc(entry.platform || 'indeed');
    return `<tr>
      <td>${date}</td>
      <td>${title}</td>
      <td>${company}</td>
      <td>${platform}</td>
      <td><span class="score-pill ${scoreClass}">${score}</span></td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <table class="log-table">
      <thead><tr><th>Date</th><th>Job</th><th>Company</th><th>Platform</th><th>Fit</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

function wireTabs() {
  const tabMap = {
    profile: 'tabProfile',
    resume: 'tabResume',
    cover: 'tabCover',
    api: 'tabApi',
    log: 'tabLog',
  };

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      Object.values(tabMap).forEach(id => document.getElementById(id)?.classList.add('hidden'));
      const target = tabMap[btn.dataset.tab];
      if (target) {
        document.getElementById(target)?.classList.remove('hidden');
        if (btn.dataset.tab === 'log') renderLog();
      }
    });
  });
}

function wireButtons() {
  document.getElementById('saveBtn').addEventListener('click', saveSettings);
  document.getElementById('clearLogBtn').addEventListener('click', async () => {
    if (confirm('Clear all application history?')) {
      await chrome.storage.local.set({ applicationLog: [] });
      await renderLog();
    }
  });
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
