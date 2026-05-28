// Popup state machine for the Job Application Agent extension.

const STATES = ['Idle', 'Paste', 'Detected', 'NeedsAuth', 'Tailoring', 'Ready', 'Done', 'Error'];
const pane = id => document.getElementById(`state${id}`);

let currentJob = null;
let tailoredData = null;

// ─── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  wireButtons();
  await detectCurrentPage();
});

async function detectCurrentPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) { showState('Idle'); return; }

  const url = tab.url;
  const isSupportedATS =
    url.includes('indeed.com') ||
    url.includes('boards.greenhouse.io') ||
    url.includes('jobs.lever.co') ||
    url.includes('myworkdayjobs.com') ||
    url.includes('jobs.ashbyhq.com');

  if (!isSupportedATS) { showState('Idle'); return; }

  // Check if this job was already tailored in this session
  try {
    const sessionKey = `app_${url.replace(/[^a-z0-9]/gi, '_').slice(0, 100)}`;
    const sessionData = await chrome.storage.session.get(sessionKey);
    if (sessionData[sessionKey]) {
      tailoredData = sessionData[sessionKey];
      currentJob = tailoredData.job;
      renderReadyState();
      showState('Ready');
      return;
    }
  } catch { /* session may not be available */ }

  // Ask content script for job info
  try {
    const jobInfo = await chrome.tabs.sendMessage(tab.id, { type: 'GET_JOB_INFO' });
    if (!jobInfo?.title) { showState('Idle'); return; }

    currentJob = { ...jobInfo, tabId: tab.id };

    // Check if this is an auth/registration form (any platform)
    if (jobInfo.authFormType) {
      showAuthPrompt(jobInfo.authFormType, tab.id, jobInfo.platform || 'this site');
      return;
    }

    // Indeed Easy Apply requires login
    if (jobInfo.isEasyApply && jobInfo.loggedIn === false) {
      showAuthPrompt('register', tab.id, 'Indeed');
      return;
    }

    renderDetectedState(jobInfo);
    showState('Detected');
  } catch {
    showState('Idle');
  }
}

// ─── Auth prompt ─────────────────────────────────────────────────────────────

function showAuthPrompt(formType, tabId, platformName) {
  const isRegister = formType === 'register';
  document.getElementById('authPrompt').textContent =
    isRegister
      ? `${platformName} requires an account to apply. The extension can create one for you automatically.`
      : `${platformName} requires you to sign in before applying. The extension can fill your credentials.`;

  document.getElementById('createAccountBtn').style.display = isRegister ? '' : 'none';
  document.getElementById('loginBtn').textContent = isRegister ? 'Sign In (already have one)' : 'Sign In';

  // Store which tab + platform needs auth
  currentJob = { ...(currentJob || {}), authTabId: tabId, authPlatform: platformName, authFormType: formType };
  showState('NeedsAuth');
}

// ─── State renders ────────────────────────────────────────────────────────────

function renderDetectedState(job) {
  document.getElementById('jobTitle').textContent = job.title || 'Unknown title';
  document.getElementById('jobCompany').textContent = job.company || '';
  document.getElementById('jobLocation').textContent = job.location || '';

  const badge = document.getElementById('applyType');
  if (job.platform && job.platform !== 'indeed') {
    badge.textContent = `${capitalize(job.platform)} — no account needed`;
    badge.className = 'badge external mt6';
  } else if (job.isEasyApply) {
    badge.textContent = 'Indeed Easy Apply';
    badge.className = 'badge easy-apply mt6';
  } else if (job.isExternal) {
    badge.textContent = 'External application — no account needed';
    badge.className = 'badge external mt6';
  } else {
    badge.textContent = 'Application form';
    badge.className = 'badge mt6';
  }
}

function renderReadyState() {
  if (!tailoredData) return;

  const score = tailoredData.fitScore || 0;
  const el = document.getElementById('fitScore');
  el.textContent = `${score} / 100`;
  el.className = 'fit-score' + (score >= 70 ? '' : score >= 50 ? ' medium' : ' low');

  document.getElementById('resumeText').value = tailoredData.tailoredResume || '';
  document.getElementById('coverText').value = tailoredData.coverLetter || '';
}

// ─── Actions ──────────────────────────────────────────────────────────────────

async function startTailoring(job) {
  showState('Tailoring');
  const result = await chrome.runtime.sendMessage({ type: 'TAILOR_APPLICATION', job });

  if (result?.error) {
    showError(result.error);
    return;
  }

  tailoredData = result;
  currentJob = result.job || job;
  renderReadyState();
  showState('Ready');
}

async function fillForm() {
  if (!tailoredData) return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'FILL_FORM',
      tailored: tailoredData,
    });
    if (response?.error) { showError(response.error); return; }

    // Log the application
    await chrome.runtime.sendMessage({
      type: 'LOG_APPLICATION',
      entry: {
        title: currentJob?.title,
        company: currentJob?.company,
        location: currentJob?.location,
        url: currentJob?.url,
        fitScore: tailoredData.fitScore,
        platform: currentJob?.platform || 'indeed',
        status: 'filled',
      },
    });

    showState('Done');
  } catch (err) {
    showError(err.message || 'Could not fill the form. Make sure you are on the application page.');
  }
}

// ─── Button wiring ────────────────────────────────────────────────────────────

function wireButtons() {
  document.getElementById('optionsBtn').addEventListener('click', () => chrome.runtime.openOptionsPage());

  document.getElementById('pasteJobBtn').addEventListener('click', () => showState('Paste'));
  document.getElementById('cancelPasteBtn').addEventListener('click', () => showState('Idle'));

  document.getElementById('manualTailorBtn').addEventListener('click', () => {
    const title = document.getElementById('manualTitle').value.trim();
    const company = document.getElementById('manualCompany').value.trim();
    const description = document.getElementById('manualDesc').value.trim();
    if (!description) { showError('Please paste a job description.'); return; }
    startTailoring({ title, company, location: '', description, url: window.location.href });
  });

  document.getElementById('createAccountBtn').addEventListener('click', async () => {
    const tabId = currentJob?.authTabId;
    if (!tabId) return;

    // Flag for content script to auto-fill when it lands on the register page
    await chrome.storage.session.set({ pendingIndeedAuth: true });

    const platform = (currentJob?.authPlatform || '').toLowerCase();
    const msgType = platform.includes('indeed') ? 'CREATE_INDEED_ACCOUNT' : 'CREATE_ACCOUNT';

    try {
      await chrome.tabs.sendMessage(tabId, { type: msgType });
    } catch {
      // Page may navigate — content script will auto-fill via pendingIndeedAuth flag
    }
  });

  document.getElementById('loginBtn').addEventListener('click', async () => {
    const tabId = currentJob?.authTabId;
    if (!tabId) return;

    await chrome.storage.session.set({ pendingIndeedAuth: true });

    const platform = (currentJob?.authPlatform || '').toLowerCase();
    const msgType = platform.includes('indeed') ? 'LOGIN_INDEED' : 'FILL_AUTH_FORM';

    try {
      await chrome.tabs.sendMessage(tabId, { type: msgType, formType: 'login' });
    } catch { /* page may navigate */ }
  });

  document.getElementById('tailorBtn').addEventListener('click', () => {
    if (currentJob) startTailoring(currentJob);
  });

  document.getElementById('fillBtn').addEventListener('click', fillForm);

  document.getElementById('resetBtn').addEventListener('click', async () => {
    tailoredData = null;
    currentJob = null;
    await detectCurrentPage();
  });
  document.getElementById('errorResetBtn').addEventListener('click', async () => {
    tailoredData = null;
    await detectCurrentPage();
  });

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.getElementById('tabResume').classList.toggle('hidden', tab !== 'resume');
      document.getElementById('tabCover').classList.toggle('hidden', tab !== 'cover');
    });
  });

  // Copy buttons
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const textarea = document.getElementById(btn.dataset.target);
      if (textarea) {
        navigator.clipboard.writeText(textarea.value);
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
      }
    });
  });
}

// ─── State machine ────────────────────────────────────────────────────────────

function showState(name) {
  STATES.forEach(s => pane(s)?.classList.add('hidden'));
  pane(name)?.classList.remove('hidden');
}

function showError(msg) {
  document.getElementById('errorMsg').textContent = msg;
  showState('Error');
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function capitalize(str) {
  return str ? str[0].toUpperCase() + str.slice(1) : '';
}
