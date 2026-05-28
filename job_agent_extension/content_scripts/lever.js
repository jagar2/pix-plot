// Lever ATS content script — no account required.

const ja = window.__jobAgent;

function extractJobInfo() {
  const title = document.querySelector('h2[data-qa="job-title"], .posting-headline h2')?.innerText?.trim() || '';
  const company = document.querySelector('.main-header-logo img')?.alt?.trim() ||
    document.querySelector('meta[property="og:site_name"]')?.content?.trim() || '';
  const location = document.querySelector('[data-qa="posting-location"], .sort-by-location')?.innerText?.trim() || '';
  const description = document.querySelector('.content, .posting-description, [class*="description"]')?.innerText?.trim() || '';

  return { title, company, location, description, url: window.location.href, platform: 'lever' };
}

async function fillApplication(tailored) {
  ja.showOverlay('Filling Lever application...');
  const { profile, tailoredResume, coverLetter } = tailored;
  const storedProfile = await new Promise(res =>
    chrome.storage.local.get('profile', d => res(d.profile || {}))
  );

  await sleep(400);

  // Lever uses specific input names
  const fieldMap = {
    'input[name="name"]': storedProfile.full_name,
    'input[name="email"]': storedProfile.email,
    'input[name="phone"]': storedProfile.phone,
    'input[name="org"]': '',  // current company — skip
    'input[name="urls[LinkedIn]"]': storedProfile.linkedin_url,
    'input[name="urls[Portfolio]"]': storedProfile.portfolio_url,
    'input[name="urls[Other]"]': storedProfile.portfolio_url,
  };

  for (const [selector, value] of Object.entries(fieldMap)) {
    if (!value) continue;
    const el = document.querySelector(selector);
    if (el) ja.fillReact(el, value);
  }

  // Resume upload
  const resumeInput = document.querySelector(
    'input[name="resume"], input[type="file"][id*="resume"], input[type="file"]'
  );
  if (resumeInput && tailoredResume) {
    ja.uploadTextAsFile(resumeInput, 'resume.txt', tailoredResume);
    await sleep(400);
  }

  // Cover letter (Lever uses a textarea for additional info)
  const clField = document.querySelector('textarea[name="comments"], textarea[id*="comment"], textarea[name*="cover"]');
  if (clField && coverLetter) {
    ja.fillReact(clField, coverLetter);
  }

  ja.showOverlay('Form filled! Review and submit.', 'success');
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'GET_JOB_INFO') {
    sendResponse(extractJobInfo());
    return true;
  }
  if (msg.type === 'FILL_FORM') {
    fillApplication(msg.tailored)
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }
});

if (document.querySelector('.application-form, form[action*="/apply"]')) {
  chrome.runtime.sendMessage({ type: 'ATS_PAGE_READY', platform: 'lever', jobInfo: extractJobInfo() });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
