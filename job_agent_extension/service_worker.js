const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

// ─── Message router ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'TAILOR_APPLICATION') {
    tailorApplication(msg.job).then(sendResponse);
    return true;
  }
  if (msg.type === 'GET_TAILORED') {
    chrome.storage.session.get(sessionKey(msg.jobUrl)).then(data => {
      sendResponse(data[sessionKey(msg.jobUrl)] || null);
    });
    return true;
  }
  if (msg.type === 'LOG_APPLICATION') {
    logApplication(msg.entry).then(() => sendResponse({ ok: true }));
    return true;
  }
});

// ─── Tailoring orchestration ─────────────────────────────────────────────────

async function tailorApplication(job) {
  const stored = await chrome.storage.local.get([
    'anthropicApiKey', 'resumeText', 'coverLetterTemplate', 'profile',
  ]);

  if (!stored.anthropicApiKey) {
    return { error: 'API key not configured. Open Options (⚙) to add it.' };
  }
  if (!stored.resumeText) {
    return { error: 'Resume not set. Open Options (⚙) to add your resume.' };
  }

  const { anthropicApiKey: key, resumeText, coverLetterTemplate, profile } = stored;

  try {
    const [fitScore, tailoredResume, coverLetter] = await Promise.all([
      screenFit(key, resumeText, job),
      tailorResume(key, resumeText, job),
      writeCoverLetter(key, coverLetterTemplate || '', job, profile || {}),
    ]);

    const result = { fitScore, tailoredResume, coverLetter, job };
    await chrome.storage.session.set({ [sessionKey(job.url)]: result });
    return result;
  } catch (err) {
    return { error: err.message };
  }
}

// ─── Claude API calls ─────────────────────────────────────────────────────────

async function callClaude(apiKey, system, messages, model = 'claude-sonnet-4-6', maxTokens = 2000) {
  const body = { model, max_tokens: maxTokens, messages };
  if (system) body.system = system;

  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Claude API error ${res.status}`);
  }
  const data = await res.json();
  return data.content[0].text;
}

async function screenFit(key, resume, job) {
  const text = await callClaude(
    key,
    '',
    [{
      role: 'user',
      content: `Rate resume-to-job fit 0-100. Reply with only a number.\n\nRESUME:\n${resume.slice(0, 3000)}\n\nJOB: ${job.title} at ${job.company}\n${job.description.slice(0, 2000)}`,
    }],
    'claude-haiku-4-5-20251001',
    10,
  );
  return Math.min(100, Math.max(0, parseInt(text.trim()) || 50));
}

async function tailorResume(key, resume, job) {
  return callClaude(
    key,
    `You are an expert resume writer. Tailor the provided resume for the job without fabricating any information. Reorder and reword existing content to mirror the job's keywords and requirements. Output only the tailored resume text, no commentary.`,
    [{
      role: 'user',
      content: `RESUME:\n${resume}\n\nJOB: ${job.title} at ${job.company}\nLOCATION: ${job.location}\n\nDESCRIPTION:\n${job.description}\n\nTailor this resume for the role.`,
    }],
  );
}

async function writeCoverLetter(key, template, job, profile) {
  return callClaude(
    key,
    `You are an expert cover letter writer. Write a compelling, concise cover letter under 350 words. Open with a strong hook connecting the candidate to the role. Highlight 2-3 specific accomplishments relevant to the job. Show genuine interest in the company. End with a clear call to action. Output only the cover letter text, no salutation line needed (it will be added separately).`,
    [{
      role: 'user',
      content: [
        template ? `MY BACKGROUND / TEMPLATE:\n${template}\n\n` : '',
        `CANDIDATE: ${profile.full_name || 'the applicant'}\n`,
        `JOB: ${job.title} at ${job.company}\n`,
        `LOCATION: ${job.location}\n\n`,
        `DESCRIPTION:\n${job.description}\n\n`,
        `Write a tailored cover letter for this candidate and role.`,
      ].join(''),
    }],
    'claude-sonnet-4-6',
    800,
  );
}

// ─── Application log ──────────────────────────────────────────────────────────

async function logApplication(entry) {
  const { applicationLog = [] } = await chrome.storage.local.get('applicationLog');
  applicationLog.unshift({ ...entry, appliedAt: new Date().toISOString() });
  await chrome.storage.local.set({ applicationLog: applicationLog.slice(0, 500) });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sessionKey(url) {
  return `app_${(url || '').replace(/[^a-z0-9]/gi, '_').slice(0, 100)}`;
}
