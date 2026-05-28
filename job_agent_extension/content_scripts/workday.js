// Workday ATS content script — no account required for guest apply.

const ja = window.__jobAgent;

function extractJobInfo() {
  const title = document.querySelector(
    '[data-automation-id="jobPostingHeader"] h2, h2[class*="WDUI_Heading"]'
  )?.innerText?.trim() || document.querySelector('h2')?.innerText?.trim() || '';

  const company = document.querySelector(
    '[data-automation-id="HIR_company_name"], [class*="companyName"]'
  )?.innerText?.trim() || '';

  const location = document.querySelector(
    '[data-automation-id="locations"] dd, [data-automation-id="workerSubTypeProfileID"]'
  )?.innerText?.trim() || '';

  const description = document.querySelector(
    '[data-automation-id="jobPostingDescription"], [class*="jobPosting"]'
  )?.innerText?.trim() || '';

  return { title, company, location, description, url: window.location.href, platform: 'workday' };
}

async function fillApplication(tailored) {
  ja.showOverlay('Filling Workday application...');
  const storedProfile = await new Promise(res =>
    chrome.storage.local.get('profile', d => res(d.profile || {}))
  );

  // Workday uses React with data-automation-id attributes
  const automationMap = [
    { id: 'legalNameSection_firstName', value: (storedProfile.full_name || '').split(' ')[0] },
    { id: 'legalNameSection_lastName', value: (storedProfile.full_name || '').split(' ').slice(1).join(' ') },
    { id: 'email', value: storedProfile.email },
    { id: 'phone-number', value: storedProfile.phone },
    { id: 'addressSection_city', value: (storedProfile.location || '').split(',')[0] },
  ];

  for (const { id, value } of automationMap) {
    if (!value) continue;
    const el = document.querySelector(`[data-automation-id="${id}"] input, [data-automation-id="${id}"]`);
    if (el && el.tagName === 'INPUT') ja.fillReact(el, value);
  }

  // Standard profile fields as fallback
  await sleep(300);
  ja.applyProfile(storedProfile);

  // Resume upload
  const resumeInput = document.querySelector(
    'input[type="file"][accept*=".pdf"], input[type="file"][accept*=".doc"], input[type="file"]'
  );
  if (resumeInput && tailored.tailoredResume) {
    ja.uploadTextAsFile(resumeInput, 'resume.txt', tailored.tailoredResume);
    await sleep(400);
  }

  // Cover letter
  if (tailored.coverLetter) ja.injectCoverLetter(tailored.coverLetter);

  ja.showOverlay('Form filled! Review and submit.', 'success');
}

// "Apply as Guest" button click helper
function clickGuestApply() {
  const guestBtn = document.querySelector(
    'button[data-automation-id="applyWithoutAccountButton"]'
  ) || [...document.querySelectorAll('button, a')].find(
    el => /apply without.*account|continue as guest|guest apply/i.test(el.textContent)
  );
  if (guestBtn) { guestBtn.click(); return true; }
  return false;
}

// Workday account creation — used when guest apply is not available
async function createWorkdayAccount() {
  const data = await new Promise(res =>
    chrome.storage.local.get(['profile', 'accountPassword'], d => res(d))
  );
  const profile = data.profile || {};
  const password = data.accountPassword || '';

  if (!profile.email || !password) {
    ja.showOverlay('Set your email and account password in Options first.', 'error');
    return false;
  }

  // Click "Create Account" if on the chooser page
  const createBtn = document.querySelector(
    'button[data-automation-id="createAccountButton"]'
  ) || [...document.querySelectorAll('button, a')].find(
    el => /create.*account|sign.?up|register/i.test(el.textContent)
  );
  if (createBtn) { createBtn.click(); await sleep(1500); }

  const filled = await ja.fillAuthForm('register');
  if (!filled) {
    ja.showOverlay('Could not find account creation fields.', 'error');
    return false;
  }

  // Workday may have extra "Verify Password" field — already handled by fillAuthForm
  ja.showOverlay('Account fields filled — submit to create account, then verify your email.', 'info');
  return true;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_JOB_INFO') {
    const authFormType = ja.detectAuthForm();
    sendResponse({ ...extractJobInfo(), authFormType });
    return true;
  }
  if (msg.type === 'FILL_FORM') {
    fillApplication(msg.tailored)
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }
  if (msg.type === 'GUEST_APPLY') {
    sendResponse({ ok: clickGuestApply() });
    return true;
  }
  if (msg.type === 'CREATE_ACCOUNT') {
    createWorkdayAccount().then(ok => sendResponse({ ok }));
    return true;
  }
  if (msg.type === 'FILL_AUTH_FORM') {
    ja.fillAuthForm(msg.formType || 'register').then(ok => sendResponse({ ok }));
    return true;
  }
});

if (document.querySelector('[data-automation-id="jobPostingHeader"]')) {
  chrome.runtime.sendMessage({ type: 'ATS_PAGE_READY', platform: 'workday', jobInfo: extractJobInfo() });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
