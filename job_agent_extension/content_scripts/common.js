// Shared utilities injected alongside every ATS-specific script.

window.__jobAgent = window.__jobAgent || {};

// ─── Field filling ────────────────────────────────────────────────────────────

window.__jobAgent.fillText = function (el, value) {
  if (!el || !value) return false;
  el.focus();
  el.value = '';
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.blur();
  return true;
};

window.__jobAgent.fillReact = function (el, value) {
  // Works with React-controlled inputs (Workday, Greenhouse, etc.)
  if (!el || !value) return false;
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  )?.set;
  const nativeTextareaSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
  )?.set;
  const setter = el.tagName === 'TEXTAREA' ? nativeTextareaSetter : nativeInputValueSetter;
  if (setter) {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    window.__jobAgent.fillText(el, value);
  }
  return true;
};

window.__jobAgent.qs = (selector, root = document) => root.querySelector(selector);
window.__jobAgent.qsa = (selector, root = document) => [...root.querySelectorAll(selector)];

window.__jobAgent.waitFor = function (selector, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(selector);
    if (existing) { resolve(existing); return; }
    const obs = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) { obs.disconnect(); resolve(el); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { obs.disconnect(); reject(new Error(`Timeout waiting for ${selector}`)); }, timeout);
  });
};

// ─── File upload helper ───────────────────────────────────────────────────────

window.__jobAgent.uploadTextAsFile = function (fileInput, filename, textContent) {
  try {
    const blob = new Blob([textContent], { type: 'text/plain' });
    const file = new File([blob], filename, { type: 'text/plain', lastModified: Date.now() });
    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  } catch {
    return false;
  }
};

// ─── Profile field mapping ────────────────────────────────────────────────────

window.__jobAgent.applyProfile = function (profile) {
  const map = [
    { selectors: ['input[name*="firstName" i]', 'input[id*="firstName" i]', 'input[placeholder*="first name" i]'], value: (profile.full_name || '').split(' ')[0] },
    { selectors: ['input[name*="lastName" i]', 'input[id*="lastName" i]', 'input[placeholder*="last name" i]'], value: (profile.full_name || '').split(' ').slice(1).join(' ') },
    { selectors: ['input[name*="fullName" i]', 'input[id*="fullName" i]', 'input[placeholder*="full name" i]', 'input[name="name"]'], value: profile.full_name || '' },
    { selectors: ['input[type="email"]', 'input[name*="email" i]'], value: profile.email || '' },
    { selectors: ['input[type="tel"]', 'input[name*="phone" i]', 'input[id*="phone" i]'], value: profile.phone || '' },
    { selectors: ['input[name*="city" i]', 'input[name*="location" i]', 'input[placeholder*="city" i]'], value: profile.location || '' },
    { selectors: ['input[name*="linkedin" i]', 'input[placeholder*="linkedin" i]'], value: profile.linkedin_url || '' },
    { selectors: ['input[name*="portfolio" i]', 'input[name*="website" i]', 'input[placeholder*="website" i]'], value: profile.portfolio_url || '' },
  ];

  for (const { selectors, value } of map) {
    if (!value) continue;
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && !el.value) {
        window.__jobAgent.fillReact(el, value);
        break;
      }
    }
  }
};

// ─── Cover letter injection ───────────────────────────────────────────────────

window.__jobAgent.injectCoverLetter = function (text) {
  const selectors = [
    'textarea[name*="cover" i]',
    'textarea[id*="cover" i]',
    'textarea[placeholder*="cover" i]',
    'div[contenteditable][aria-label*="cover" i]',
    'textarea[name*="letter" i]',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      window.__jobAgent.fillReact(el, text);
      return true;
    }
  }
  return false;
};

// ─── Generic registration / login form handler ───────────────────────────────

window.__jobAgent.detectAuthForm = function () {
  const url = window.location.href.toLowerCase();
  const bodyText = document.body.innerText.toLowerCase();

  const isRegister =
    url.includes('register') || url.includes('signup') || url.includes('sign-up') ||
    url.includes('create-account') || url.includes('createaccount') ||
    !!document.querySelector(
      'form [name*="confirm" i][type="password"], input[id*="confirmPass" i], input[placeholder*="confirm password" i]'
    ) ||
    bodyText.includes('create your account') || bodyText.includes('create an account') ||
    bodyText.includes('sign up') || bodyText.includes('register to apply');

  const isLogin =
    !isRegister && (
      url.includes('login') || url.includes('signin') || url.includes('sign-in') ||
      !!document.querySelector('form input[type="password"]')
    );

  return isRegister ? 'register' : isLogin ? 'login' : null;
};

window.__jobAgent.fillAuthForm = async function (type) {
  const data = await new Promise(res =>
    chrome.storage.local.get(['profile', 'accountPassword'], d => res(d))
  );
  const profile = data.profile || {};
  const password = data.accountPassword || '';

  if (!profile.email || !password) return false;

  const filled = [];

  if (type === 'register') {
    // Name fields
    const firstName = (profile.full_name || '').split(' ')[0];
    const lastName = (profile.full_name || '').split(' ').slice(1).join(' ');
    for (const [sel, val] of [
      ['input[name*="firstName" i], input[id*="firstName" i], input[placeholder*="first name" i]', firstName],
      ['input[name*="lastName" i], input[id*="lastName" i], input[placeholder*="last name" i]', lastName],
      ['input[name*="fullName" i], input[name="name"], input[placeholder*="full name" i]', profile.full_name || ''],
    ]) {
      const el = document.querySelector(sel);
      if (el && !el.value) { window.__jobAgent.fillReact(el, val); filled.push(sel); }
    }
  }

  // Email
  const emailEl = document.querySelector('input[type="email"], input[name*="email" i], input[id*="email" i]');
  if (emailEl && !emailEl.value) { window.__jobAgent.fillReact(emailEl, profile.email); filled.push('email'); }

  // Password(s)
  const pwEls = document.querySelectorAll('input[type="password"]');
  pwEls.forEach(el => { if (!el.value) window.__jobAgent.fillReact(el, password); });
  if (pwEls.length) filled.push('password');

  return filled.length > 0;
};

// ─── Status overlay ───────────────────────────────────────────────────────────

window.__jobAgent.showOverlay = function (message, type = 'info') {
  let overlay = document.getElementById('__jobAgentOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = '__jobAgentOverlay';
    overlay.style.cssText = `
      position: fixed; bottom: 24px; right: 24px; z-index: 999999;
      background: ${type === 'error' ? '#dc2626' : type === 'success' ? '#16a34a' : '#1d4ed8'};
      color: #fff; padding: 12px 18px; border-radius: 8px;
      font: 14px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;
      max-width: 320px; box-shadow: 0 4px 12px rgba(0,0,0,.3);
      transition: opacity .3s;
    `;
    document.body.appendChild(overlay);
  }
  overlay.style.background = type === 'error' ? '#dc2626' : type === 'success' ? '#16a34a' : '#1d4ed8';
  overlay.textContent = `Job Agent: ${message}`;
  clearTimeout(overlay.__timer);
  overlay.__timer = setTimeout(() => { overlay.style.opacity = '0'; }, 5000);
  overlay.style.opacity = '1';
};
