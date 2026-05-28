// Ashby HQ ATS content script — no account required.

const ja = window.__jobAgent;

function extractJobInfo() {
  const title = document.querySelector('h1[class*="jobTitle"], h1')?.innerText?.trim() || '';
  const company = document.querySelector('[class*="companyName"], [class*="company-name"]')?.innerText?.trim() ||
    document.title.split(' at ').pop()?.trim() || '';
  const location = document.querySelector('[class*="location" i], [class*="jobLocation" i]')?.innerText?.trim() || '';
  const description = document.querySelector('[class*="jobDescription" i], [class*="description" i]')?.innerText?.trim() || '';

  return { title, company, location, description, url: window.location.href, platform: 'ashby' };
}

async function fillApplication(tailored) {
  ja.showOverlay('Filling Ashby application...');
  const storedProfile = await new Promise(res =>
    chrome.storage.local.get('profile', d => res(d.profile || {}))
  );

  await sleep(400);
  ja.applyProfile(storedProfile);

  const resumeInput = document.querySelector('input[type="file"]');
  if (resumeInput && tailored.tailoredResume) {
    ja.uploadTextAsFile(resumeInput, 'resume.txt', tailored.tailoredResume);
    await sleep(400);
  }

  if (tailored.coverLetter) ja.injectCoverLetter(tailored.coverLetter);

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

if (document.querySelector('form[class*="application" i], [class*="applicationForm" i]')) {
  chrome.runtime.sendMessage({ type: 'ATS_PAGE_READY', platform: 'ashby', jobInfo: extractJobInfo() });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
