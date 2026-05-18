"""Playwright-based application submitter for job application forms."""

from __future__ import annotations

import asyncio
import logging
import os
import re
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

SCREENSHOTS_DIR = Path("screenshots")
SCREENSHOTS_DIR.mkdir(exist_ok=True)

# Common CAPTCHA indicator patterns
CAPTCHA_PATTERNS = [
    r"recaptcha",
    r"hcaptcha",
    r"turnstile",
    r"captcha",
    r"cf-challenge",
    r"challenge-form",
]

# Common login-wall indicators
LOGIN_PATTERNS = [
    r"sign[\s_-]?in",
    r"log[\s_-]?in",
    r"create[\s_-]?account",
    r"register",
    r"login[\s_-]?required",
    r"please[\s_-]?sign",
]

# Fields that typically map to standard profile data
FIELD_MAPPING = {
    "first_name": ["first_name", "first-name", "firstname", "fname"],
    "last_name": ["last_name", "last-name", "lastname", "lname", "surname"],
    "full_name": ["full_name", "full-name", "name", "applicant_name"],
    "email": ["email", "email_address", "emailaddress", "e-mail"],
    "phone": ["phone", "telephone", "mobile", "phone_number", "cell"],
    "linkedin_url": ["linkedin", "linkedin_url", "linkedin-url", "linkedin_profile"],
    "github_url": ["github", "github_url", "github-url", "github_profile"],
    "portfolio_url": ["portfolio", "website", "personal_website", "portfolio_url"],
    "location_city": ["city", "location_city", "current_city"],
    "location_state": ["state", "province", "location_state"],
}


@dataclass
class FormField:
    name: str
    field_type: str  # "text", "textarea", "select", "checkbox", "file", "radio"
    label: str
    selector: str
    options: list[str] = field(default_factory=list)
    required: bool = False
    placeholder: str = ""


@dataclass
class ApplicationResult:
    success: bool
    job_id: Optional[int] = None
    apply_url: str = ""
    screenshot_path: Optional[str] = None
    form_fields_detected: list[FormField] = field(default_factory=list)
    questions_detected: list[str] = field(default_factory=list)
    error_message: Optional[str] = None
    requires_login: bool = False
    has_captcha: bool = False
    submitted_at: Optional[datetime] = None
    details: dict[str, Any] = field(default_factory=dict)


async def check_requires_login(page: Any) -> bool:
    """Detect if the current page requires login to proceed with application."""
    try:
        content = await page.content()
        content_lower = content.lower()
        for pattern in LOGIN_PATTERNS:
            if re.search(pattern, content_lower):
                # Check for actual login form
                login_inputs = await page.query_selector_all(
                    'input[type="password"], form[action*="login"], form[action*="signin"]'
                )
                if login_inputs:
                    return True
        return False
    except Exception as exc:
        logger.debug("check_requires_login error: %s", exc)
        return False


async def check_has_captcha(page: Any) -> bool:
    """Detect CAPTCHA widgets on the page."""
    try:
        content = await page.content()
        content_lower = content.lower()
        for pattern in CAPTCHA_PATTERNS:
            if re.search(pattern, content_lower):
                return True
        # Check for common CAPTCHA iframes
        captcha_frames = await page.query_selector_all(
            'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], '
            'iframe[src*="turnstile"], div.g-recaptcha, div[data-sitekey]'
        )
        return len(captcha_frames) > 0
    except Exception as exc:
        logger.debug("check_has_captcha error: %s", exc)
        return False


async def detect_form_fields(page: Any) -> list[FormField]:
    """Identify all fillable form fields on the application page."""
    fields: list[FormField] = []
    try:
        # Text inputs and textareas
        inputs = await page.query_selector_all(
            'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), '
            "textarea, select"
        )
        for inp in inputs:
            try:
                tag = await inp.evaluate("el => el.tagName.toLowerCase()")
                inp_type = await inp.get_attribute("type") or "text"
                inp_name = await inp.get_attribute("name") or ""
                inp_id = await inp.get_attribute("id") or ""
                placeholder = await inp.get_attribute("placeholder") or ""
                required_attr = await inp.get_attribute("required")
                required = required_attr is not None

                # Try to find associated label
                label_text = ""
                if inp_id:
                    label_el = await page.query_selector(f'label[for="{inp_id}"]')
                    if label_el:
                        label_text = (await label_el.inner_text()).strip()

                if not label_text and inp_name:
                    label_text = inp_name.replace("_", " ").replace("-", " ").title()

                selector = f'[name="{inp_name}"]' if inp_name else f'#{inp_id}' if inp_id else tag

                if tag == "select":
                    options_els = await inp.query_selector_all("option")
                    options = []
                    for opt in options_els:
                        val = await opt.get_attribute("value") or ""
                        txt = await opt.inner_text()
                        if val:
                            options.append(val)
                    fields.append(
                        FormField(
                            name=inp_name or inp_id,
                            field_type="select",
                            label=label_text,
                            selector=selector,
                            options=options,
                            required=required,
                            placeholder=placeholder,
                        )
                    )
                elif tag == "textarea":
                    fields.append(
                        FormField(
                            name=inp_name or inp_id,
                            field_type="textarea",
                            label=label_text,
                            selector=selector,
                            required=required,
                            placeholder=placeholder,
                        )
                    )
                elif inp_type in ("text", "email", "tel", "url", "number"):
                    fields.append(
                        FormField(
                            name=inp_name or inp_id,
                            field_type="text",
                            label=label_text,
                            selector=selector,
                            required=required,
                            placeholder=placeholder,
                        )
                    )
                elif inp_type == "file":
                    fields.append(
                        FormField(
                            name=inp_name or inp_id,
                            field_type="file",
                            label=label_text,
                            selector=selector,
                            required=required,
                        )
                    )
                elif inp_type in ("radio", "checkbox"):
                    fields.append(
                        FormField(
                            name=inp_name or inp_id,
                            field_type=inp_type,
                            label=label_text,
                            selector=selector,
                            required=required,
                        )
                    )
            except Exception as field_exc:
                logger.debug("Field detection error: %s", field_exc)
                continue
    except Exception as exc:
        logger.error("detect_form_fields error: %s", exc)
    return fields


def _resolve_field_value(field: FormField, profile: dict[str, Any]) -> Optional[str]:
    """Map a detected form field to the best candidate profile value."""
    name_lower = (field.name + " " + field.label).lower()

    # Try direct mappings
    for profile_key, aliases in FIELD_MAPPING.items():
        for alias in aliases:
            if alias in name_lower:
                raw_val = profile.get(profile_key)
                if raw_val is not None:
                    return str(raw_val)

    # Special cases
    if "full_name" in name_lower or name_lower.strip() == "name":
        return profile.get("full_name")

    if "first" in name_lower:
        full = profile.get("full_name", "")
        parts = full.split()
        return parts[0] if parts else None

    if "last" in name_lower or "surname" in name_lower:
        full = profile.get("full_name", "")
        parts = full.split()
        return parts[-1] if len(parts) > 1 else None

    if "salary" in name_lower or "compensation" in name_lower:
        sal = profile.get("min_salary")
        return str(int(sal)) if sal else None

    if "year" in name_lower and "experience" in name_lower:
        exp = profile.get("experience_years")
        return str(exp) if exp else None

    return None


async def fill_and_submit(
    page: Any,
    form_fields: list[FormField],
    profile: dict[str, Any],
    answers: dict[str, str],
    resume_path: Optional[str] = None,
    dry_run: bool = True,
) -> bool:
    """Fill detected form fields and optionally submit the form.

    Args:
        page: Playwright page object.
        form_fields: Detected fields from detect_form_fields().
        profile: Candidate profile dict.
        answers: Pre-generated answers keyed by question text or field name.
        resume_path: Local path to resume file for file upload fields.
        dry_run: When True, fills fields but does not click Submit.

    Returns:
        True if filling (and submission) succeeded without errors.
    """
    try:
        for ff in form_fields:
            try:
                if ff.field_type == "file" and resume_path and os.path.exists(resume_path):
                    await page.set_input_files(ff.selector, resume_path)
                    continue

                # Check answers dict first (keyed by label or name)
                answer = answers.get(ff.label) or answers.get(ff.name)

                if answer is None:
                    answer = _resolve_field_value(ff, profile)

                if answer is None:
                    continue

                if ff.field_type in ("text", "email", "tel", "url", "number"):
                    el = await page.query_selector(ff.selector)
                    if el:
                        await el.fill(str(answer))
                elif ff.field_type == "textarea":
                    el = await page.query_selector(ff.selector)
                    if el:
                        await el.fill(str(answer))
                elif ff.field_type == "select":
                    if ff.options:
                        # Find best matching option
                        ans_lower = str(answer).lower()
                        best_option = ff.options[0]
                        for opt in ff.options:
                            if ans_lower in opt.lower() or opt.lower() in ans_lower:
                                best_option = opt
                                break
                        await page.select_option(ff.selector, best_option)
                elif ff.field_type == "checkbox":
                    if str(answer).lower() in ("yes", "true", "1"):
                        el = await page.query_selector(ff.selector)
                        if el and not await el.is_checked():
                            await el.click()
            except Exception as field_exc:
                logger.debug("Error filling field %s: %s", ff.name, field_exc)
                continue

        if not dry_run:
            # Find and click the submit button
            submit_selectors = [
                'button[type="submit"]',
                'input[type="submit"]',
                'button:has-text("Submit")',
                'button:has-text("Apply")',
                'button:has-text("Send Application")',
            ]
            for sel in submit_selectors:
                try:
                    btn = await page.query_selector(sel)
                    if btn:
                        await btn.click()
                        await page.wait_for_load_state("networkidle", timeout=10000)
                        return True
                except Exception:
                    continue
            logger.warning("No submit button found")
            return False
        return True
    except Exception as exc:
        logger.error("fill_and_submit error: %s", exc)
        return False


async def take_screenshot_evidence(page: Any, job_id: int, label: str = "submitted") -> str:
    """Take a screenshot as evidence of application submission."""
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = SCREENSHOTS_DIR / f"job_{job_id}_{label}_{ts}.png"
    try:
        await page.screenshot(path=str(filename), full_page=True)
        logger.info("Screenshot saved: %s", filename)
        return str(filename)
    except Exception as exc:
        logger.error("Screenshot failed: %s", exc)
        return ""


async def submit_application(
    apply_url: str,
    profile: dict[str, Any],
    answers: dict[str, str],
    cover_letter: str = "",
    resume_path: Optional[str] = None,
    job_id: Optional[int] = None,
    dry_run: bool = True,
) -> ApplicationResult:
    """Full application submission pipeline using Playwright.

    Args:
        apply_url: The application form URL.
        profile: Candidate profile dict.
        answers: Pre-generated answers from ai_service.generate_answers().
        cover_letter: Generated cover letter text.
        resume_path: Local path to resume file.
        job_id: DB job ID for screenshot naming.
        dry_run: When True, fills fields but does not submit.
    """
    try:
        from playwright.async_api import async_playwright  # local import to avoid import error if not installed
    except ImportError:
        return ApplicationResult(
            success=False,
            job_id=job_id,
            apply_url=apply_url,
            error_message="Playwright is not installed. Run: playwright install",
        )

    result = ApplicationResult(job_id=job_id, apply_url=apply_url)

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            )
        )
        page = await context.new_page()

        try:
            await page.goto(apply_url, wait_until="networkidle", timeout=30000)

            # Eligibility checks
            result.requires_login = await check_requires_login(page)
            result.has_captcha = await check_has_captcha(page)

            if result.requires_login:
                result.success = False
                result.error_message = "Application page requires login"
                result.screenshot_path = await take_screenshot_evidence(
                    page, job_id or 0, "login_wall"
                )
                return result

            if result.has_captcha:
                result.success = False
                result.error_message = "Application page has CAPTCHA – manual intervention required"
                result.screenshot_path = await take_screenshot_evidence(
                    page, job_id or 0, "captcha"
                )
                return result

            # Detect fields
            form_fields = await detect_form_fields(page)
            result.form_fields_detected = form_fields

            # Detect open-ended questions (textareas often contain questions)
            questions = [
                ff.label
                for ff in form_fields
                if ff.field_type == "textarea" and ff.label
            ]
            result.questions_detected = questions

            # Add cover letter to answers if there's a cover letter textarea
            enriched_answers = dict(answers)
            for ff in form_fields:
                if ff.field_type == "textarea" and cover_letter:
                    label_lower = ff.label.lower()
                    if any(
                        kw in label_lower
                        for kw in ("cover letter", "cover_letter", "motivation", "why do you")
                    ):
                        enriched_answers[ff.label] = cover_letter
                        enriched_answers[ff.name] = cover_letter

            success = await fill_and_submit(
                page,
                form_fields,
                profile,
                enriched_answers,
                resume_path=resume_path,
                dry_run=dry_run,
            )

            label = "filled" if dry_run else "submitted"
            result.screenshot_path = await take_screenshot_evidence(
                page, job_id or 0, label
            )
            result.success = success
            if success and not dry_run:
                result.submitted_at = datetime.utcnow()

        except Exception as exc:
            logger.error("submit_application error for %s: %s", apply_url, exc)
            result.success = False
            result.error_message = str(exc)
            try:
                result.screenshot_path = await take_screenshot_evidence(
                    page, job_id or 0, "error"
                )
            except Exception:
                pass
        finally:
            await browser.close()

    return result
