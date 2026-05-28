// Indeed content script — job extraction, account creation/login, Easy Apply.

const ja = window.__jobAgent;

// ─── Auth detection ───────────────────────────────────────────────────────────

function isLoggedIn() {
  return !!(
    document.querySelector(
      '[data-testid="user-account-link"], .gnav-LoggedInLinks, a[href*="/account/logout"], [aria-label*="account menu" i]'
    )
  );
}

function isOnLoginPage() {
  return window.location.pathname.includes('/account/Login') ||
    window.location.pathname.includes('/account/login');
}

function isOnRegisterPage() {
  return window.location.pathname.includes('/account/Register') ||
    window.location.pathname.includes('/account/register') ||
    !!document.querySelector('input[name="confirmPassword"], input[id*="confirmPassword"]');
}

// ─── Account creation + login ─────────────────────────────────────────────────

async function createIndeedAccount() {
  const data = await new Promise(res =>
    chrome.storage.local.get(['profile', 'accountPassword'], d => res(d))
  );
  const profile = data.profile || {};
  const password = data.accountPassword || '';

  if (!profile.email || !password) {
    ja.showOverlay('Set your email and account password in Options first.', 'error');
    return false;
  }

  // If already on login page, click "Create account" link
  if (isOnLoginPage()) {
    const createLink = document.querySelector(
      'a[href*="register" i], a[href*="signup" i], button:not([type="submit"]):not([type="button"])'
    );
    const linkByText = [...document.querySelectorAll('a, button')].find(
      el => /create.*(account|one)|sign.?up|register/i.test(el.textContent)
    );
    if (createLink || linkByText) {
      (createLink || linkByText).click();
      await sleep(1500);
    }
  }

  // Fill registration form
  const filled = await ja.fillAuthForm('register');
  if (!filled) {
    ja.showOverlay('Could not find registration fields on this page.', 'error');
    return false;
  }

  ja.showOverlay('Registration filled — check fields, then submit. Verify your email when it arrives.');
  return true;
}

async function loginToIndeed() {
  const data = await new Promise(res =>
    chrome.storage.local.get(['profile', 'accountPassword'], d => res(d))
  );
  const profile = data.profile || {};
  const password = data.accountPassword || '';

  if (!profile.email || !password) {
    ja.showOverlay('Set your email and account password in Options first.', 'error');
    return false;
  }

  if (!isOnLoginPage()) {
    window.location.href = 'https://www.indeed.com/account/Login';
    return false;
  }

  const filled = await ja.fillAuthForm('login');
  if (!filled) {
    ja.showOverlay('Could not find login fields.', 'error');
    return false;
  }

  ja.showOverlay('Login filled — click Sign in to continue.');
  return true;
}

// Auto-fill when landing on the Indeed login/register page from the extension
(async () => {
  if (!isOnLoginPage() && !isOnRegisterPage()) return;

  const { pendingIndeedAuth } = await new Promise(res =>
    chrome.storage.session.get('pendingIndeedAuth', d => res(d))
  );
  if (!pendingIndeedAuth) return;

  await sleep(800);
  if (isOnRegisterPage()) {
    await createIndeedAccount();
  } else {
    await loginToIndeed();
  }
})();

// ─── Job info extraction ──────────────────────────────────────────────────────

function extractJobInfo() {
  const title =
    document.querySelector('h1[data-testid="job-title"], h1.jobsearch-JobInfoHeader-title')?.innerText?.trim() ||
    document.querySelector('h1')?.innerText?.trim() || '';

  const company =
    document.querySelector('[data-testid="inlineHeader-companyName"] a, [data-testid="inlineHeader-companyName"]')?.innerText?.trim() ||
    document.querySelector('.jobsearch-InlineCompanyRating-companyHeader a')?.innerText?.trim() || '';

  const location =
    document.querySelector('[data-testid="inlineHeader-companyLocation"]')?.innerText?.trim() ||
    document.querySelector('.jobsearch-JobInfoHeader-subtitle .jobsearch-JobInfoHeader-locationName')?.innerText?.trim() || '';

  const description =
    document.querySelector('#jobDescriptionText')?.innerText?.trim() ||
    document.querySelector('.jobsearch-jobDescriptionText')?.innerText?.trim() || '';

  const applyBtn = document.querySelector('[id="indeedApplyButton"], button.ia-IndeedApplyButton');
  const externalBtn = document.querySelector('a[href*="/rc/clk"], a[data-jk][target="_blank"], a:not([id*="indeedApply"]):is(.jobsearch-IndeedApplyButton)');

  const isEasyApply = !!applyBtn && applyBtn.tagName === 'BUTTON';
  const isExternal = !isEasyApply && !!document.querySelector(
    'a.jobsearch-IndeedApplyButton-newDesign, a[href*="applyredirect"]'
  );

  return {
    title,
    company,
    location,
    description,
    url: window.location.href,
    isEasyApply,
    isExternal,
  };
}

// ─── Easy Apply form filler ───────────────────────────────────────────────────

async function fillEasyApply(tailored) {
  const { profile, tailoredResume, coverLetter } = tailored;

  // Click the apply button to open the modal
  const applyBtn = document.querySelector('[id="indeedApplyButton"], button.ia-IndeedApplyButton');
  if (applyBtn) {
    applyBtn.click();
    await sleep(2000);
  }

  const storedProfile = await new Promise(res =>
    chrome.storage.local.get('profile', d => res(d.profile || {}))
  );

  // Multi-step form loop
  for (let step = 0; step < 12; step++) {
    await sleep(800);

    ja.applyProfile(storedProfile);

    // Resume upload
    const fileInput = document.querySelector('input[type="file"][accept*=".pdf"], input[type="file"][accept*=".doc"], input[type="file"]');
    if (fileInput && tailoredResume) {
      const ext = fileInput.accept?.includes('.pdf') ? '.pdf' : '.txt';
      ja.uploadTextAsFile(fileInput, `resume${ext}`, tailoredResume);
      await sleep(500);
    }

    // Cover letter
    if (coverLetter) ja.injectCoverLetter(coverLetter);

    // Detect final submit vs next
    const submitBtn = document.querySelector(
      'button[data-testid="submit-application-button"], button:contains("Submit"), button[type="submit"]'
    );
    const nextBtn = document.querySelector(
      'button[data-testid="continue-button"], button:contains("Continue"), button:contains("Next")'
    );

    if (submitBtn && (submitBtn.offsetParent !== null)) {
      ja.showOverlay('Ready to submit — review and click Submit.', 'success');
      return;
    }

    if (nextBtn && nextBtn.offsetParent !== null) {
      nextBtn.click();
      await sleep(1200);
    } else {
      break;
    }
  }
}

// ─── Message listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_JOB_INFO') {
    sendResponse({ ...extractJobInfo(), loggedIn: isLoggedIn() });
    return true;
  }
  if (msg.type === 'FILL_FORM') {
    fillEasyApply(msg.tailored)
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }
  if (msg.type === 'CREATE_INDEED_ACCOUNT') {
    createIndeedAccount().then(ok => sendResponse({ ok }));
    return true;
  }
  if (msg.type === 'LOGIN_INDEED') {
    loginToIndeed().then(ok => sendResponse({ ok }));
    return true;
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));
