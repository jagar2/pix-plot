// Greenhouse ATS content script — no account required.

const ja = window.__jobAgent;

function extractJobInfo() {
  const title = document.querySelector('h1.app-title, h1[class*="Header"]')?.innerText?.trim() || '';
  const company = document.querySelector('.company-name, a[class*="company"]')?.innerText?.trim() ||
    document.title.split(' at ').pop()?.trim() || '';
  const location = document.querySelector('[class*="location"], [data-qa="job-location"]')?.innerText?.trim() || '';
  const description = document.querySelector('#content, .content, [class*="description"]')?.innerText?.trim() || '';

  return { title, company, location, description, url: window.location.href, platform: 'greenhouse' };
}

async function fillApplication(tailored) {
  ja.showOverlay('Filling application form...');
  const { profile, tailoredResume, coverLetter } = tailored;
  const storedProfile = await new Promise(res =>
    chrome.storage.local.get('profile', d => res(d.profile || {}))
  );

  await sleep(500);
  ja.applyProfile(storedProfile);

  // Resume upload — Greenhouse uses a specific file input
  const resumeInput = document.querySelector(
    '#resume, input[name="resume"], input[id*="resume"], input[type="file"]'
  );
  if (resumeInput && tailoredResume) {
    ja.uploadTextAsFile(resumeInput, 'resume.txt', tailoredResume);
    await sleep(400);
  }

  // Cover letter textarea or file input
  const clTextarea = document.querySelector(
    '#cover_letter, textarea[name*="cover"], textarea[id*="cover"]'
  );
  if (clTextarea && coverLetter) {
    ja.fillReact(clTextarea, coverLetter);
  } else {
    const clInput = document.querySelector('input[id*="cover"], input[name*="cover"]');
    if (clInput && coverLetter) {
      ja.uploadTextAsFile(clInput, 'cover_letter.txt', coverLetter);
    }
  }

  // LinkedIn URL
  if (storedProfile.linkedin_url) {
    const liInput = document.querySelector('input[id*="linkedin" i], input[name*="linkedin" i]');
    if (liInput) ja.fillReact(liInput, storedProfile.linkedin_url);
  }

  // Website/portfolio
  if (storedProfile.portfolio_url) {
    const webInput = document.querySelector('input[id*="website" i], input[name*="portfolio" i]');
    if (webInput) ja.fillReact(webInput, storedProfile.portfolio_url);
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

// Auto-detect and notify popup that we're on an application form
if (document.querySelector('#application_form, form#application')) {
  chrome.runtime.sendMessage({ type: 'ATS_PAGE_READY', platform: 'greenhouse', jobInfo: extractJobInfo() });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
