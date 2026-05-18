"""Seed the database with 50 major US companies across various ATS platforms."""
from __future__ import annotations
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Company, ATSType

COMPANIES = [
    # Greenhouse
    {"name": "Stripe", "domain": "stripe.com", "career_page_url": "https://stripe.com/jobs", "ats_type": ATSType.GREENHOUSE, "ats_job_board_url": "https://boards.greenhouse.io/stripe"},
    {"name": "Airbnb", "domain": "airbnb.com", "career_page_url": "https://careers.airbnb.com", "ats_type": ATSType.GREENHOUSE, "ats_job_board_url": "https://boards.greenhouse.io/airbnb"},
    {"name": "Shopify", "domain": "shopify.com", "career_page_url": "https://www.shopify.com/careers", "ats_type": ATSType.GREENHOUSE, "ats_job_board_url": "https://boards.greenhouse.io/shopify"},
    {"name": "Twilio", "domain": "twilio.com", "career_page_url": "https://www.twilio.com/en-us/company/jobs", "ats_type": ATSType.GREENHOUSE, "ats_job_board_url": "https://boards.greenhouse.io/twilio"},
    {"name": "HubSpot", "domain": "hubspot.com", "career_page_url": "https://www.hubspot.com/careers", "ats_type": ATSType.GREENHOUSE, "ats_job_board_url": "https://boards.greenhouse.io/hubspot"},
    {"name": "Figma", "domain": "figma.com", "career_page_url": "https://www.figma.com/careers", "ats_type": ATSType.GREENHOUSE, "ats_job_board_url": "https://boards.greenhouse.io/figma"},
    {"name": "Notion", "domain": "notion.so", "career_page_url": "https://www.notion.so/careers", "ats_type": ATSType.GREENHOUSE, "ats_job_board_url": "https://boards.greenhouse.io/notion"},
    {"name": "Plaid", "domain": "plaid.com", "career_page_url": "https://plaid.com/careers", "ats_type": ATSType.GREENHOUSE, "ats_job_board_url": "https://boards.greenhouse.io/plaid"},
    {"name": "Brex", "domain": "brex.com", "career_page_url": "https://www.brex.com/careers", "ats_type": ATSType.GREENHOUSE, "ats_job_board_url": "https://boards.greenhouse.io/brex"},
    {"name": "Gusto", "domain": "gusto.com", "career_page_url": "https://gusto.com/about/careers", "ats_type": ATSType.GREENHOUSE, "ats_job_board_url": "https://boards.greenhouse.io/gusto"},
    # Lever
    {"name": "Netflix", "domain": "netflix.com", "career_page_url": "https://jobs.lever.co/netflix", "ats_type": ATSType.LEVER, "ats_job_board_url": "https://jobs.lever.co/netflix"},
    {"name": "Lyft", "domain": "lyft.com", "career_page_url": "https://www.lyft.com/careers", "ats_type": ATSType.LEVER, "ats_job_board_url": "https://jobs.lever.co/lyft"},
    {"name": "Affirm", "domain": "affirm.com", "career_page_url": "https://www.affirm.com/careers", "ats_type": ATSType.LEVER, "ats_job_board_url": "https://jobs.lever.co/affirm"},
    {"name": "Dropbox", "domain": "dropbox.com", "career_page_url": "https://jobs.lever.co/dropbox", "ats_type": ATSType.LEVER, "ats_job_board_url": "https://jobs.lever.co/dropbox"},
    {"name": "Reddit", "domain": "reddit.com", "career_page_url": "https://www.redditinc.com/careers", "ats_type": ATSType.LEVER, "ats_job_board_url": "https://jobs.lever.co/reddit"},
    {"name": "Chime", "domain": "chime.com", "career_page_url": "https://jobs.lever.co/chime", "ats_type": ATSType.LEVER, "ats_job_board_url": "https://jobs.lever.co/chime"},
    {"name": "Robinhood", "domain": "robinhood.com", "career_page_url": "https://careers.robinhood.com", "ats_type": ATSType.LEVER, "ats_job_board_url": "https://jobs.lever.co/robinhood"},
    {"name": "Duolingo", "domain": "duolingo.com", "career_page_url": "https://careers.duolingo.com", "ats_type": ATSType.LEVER, "ats_job_board_url": "https://jobs.lever.co/duolingo"},
    {"name": "Calm", "domain": "calm.com", "career_page_url": "https://jobs.lever.co/calm", "ats_type": ATSType.LEVER, "ats_job_board_url": "https://jobs.lever.co/calm"},
    {"name": "Carta", "domain": "carta.com", "career_page_url": "https://jobs.lever.co/carta", "ats_type": ATSType.LEVER, "ats_job_board_url": "https://jobs.lever.co/carta"},
    # Workday
    {"name": "Microsoft", "domain": "microsoft.com", "career_page_url": "https://careers.microsoft.com", "ats_type": ATSType.WORKDAY, "ats_job_board_url": "https://microsoft.wd5.myworkdayjobs.com/en-US/microsoft_careers"},
    {"name": "Meta", "domain": "meta.com", "career_page_url": "https://www.metacareers.com", "ats_type": ATSType.WORKDAY, "ats_job_board_url": "https://metacareers.wd5.myworkdayjobs.com/careers"},
    {"name": "Salesforce", "domain": "salesforce.com", "career_page_url": "https://www.salesforce.com/company/careers", "ats_type": ATSType.WORKDAY, "ats_job_board_url": "https://salesforce.wd12.myworkdayjobs.com/Salesforce"},
    {"name": "Adobe", "domain": "adobe.com", "career_page_url": "https://adobe.com/careers", "ats_type": ATSType.WORKDAY, "ats_job_board_url": "https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced"},
    {"name": "Workday", "domain": "workday.com", "career_page_url": "https://www.workday.com/en-us/company/careers.html", "ats_type": ATSType.WORKDAY, "ats_job_board_url": "https://workday.wd5.myworkdayjobs.com/Workday"},
    {"name": "Nvidia", "domain": "nvidia.com", "career_page_url": "https://www.nvidia.com/en-us/about-nvidia/careers", "ats_type": ATSType.WORKDAY, "ats_job_board_url": "https://nvidia.wd5.myworkdayjobs.com/en-US/nvidiaexternalcareersite"},
    {"name": "Visa", "domain": "visa.com", "career_page_url": "https://www.visa.com/en_us/jobs.html", "ats_type": ATSType.WORKDAY, "ats_job_board_url": "https://visacareer.wd5.myworkdayjobs.com/en-US/Visa_Careers"},
    {"name": "JPMorgan Chase", "domain": "jpmorganchase.com", "career_page_url": "https://careers.jpmorgan.com", "ats_type": ATSType.WORKDAY, "ats_job_board_url": "https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001"},
    {"name": "Bank of America", "domain": "bankofamerica.com", "career_page_url": "https://careers.bankofamerica.com", "ats_type": ATSType.WORKDAY, "ats_job_board_url": "https://ghr.wd1.myworkdayjobs.com/en-US/Bankofamerica"},
    {"name": "Capital One", "domain": "capitalone.com", "career_page_url": "https://www.capitalonecareers.com", "ats_type": ATSType.WORKDAY, "ats_job_board_url": "https://capitalone.wd12.myworkdayjobs.com/Capital_One"},
    # Ashby
    {"name": "Linear", "domain": "linear.app", "career_page_url": "https://linear.app/careers", "ats_type": ATSType.ASHBY, "ats_job_board_url": "https://jobs.ashbyhq.com/linear"},
    {"name": "Vercel", "domain": "vercel.com", "career_page_url": "https://vercel.com/careers", "ats_type": ATSType.ASHBY, "ats_job_board_url": "https://jobs.ashbyhq.com/vercel"},
    {"name": "Anthropic", "domain": "anthropic.com", "career_page_url": "https://www.anthropic.com/careers", "ats_type": ATSType.ASHBY, "ats_job_board_url": "https://jobs.ashbyhq.com/anthropic"},
    {"name": "Loom", "domain": "loom.com", "career_page_url": "https://www.loom.com/careers", "ats_type": ATSType.ASHBY, "ats_job_board_url": "https://jobs.ashbyhq.com/loom"},
    {"name": "Retool", "domain": "retool.com", "career_page_url": "https://retool.com/careers", "ats_type": ATSType.ASHBY, "ats_job_board_url": "https://jobs.ashbyhq.com/retool"},
    # SmartRecruiters
    {"name": "Visa (SR)", "domain": "visasrecruiters.com", "career_page_url": "https://careers.smartrecruiters.com/Visa", "ats_type": ATSType.SMARTRECRUITERS, "ats_job_board_url": "https://careers.smartrecruiters.com/Visa"},
    {"name": "Bosch", "domain": "bosch.com", "career_page_url": "https://careers.smartrecruiters.com/BoschGroup", "ats_type": ATSType.SMARTRECRUITERS, "ats_job_board_url": "https://careers.smartrecruiters.com/BoschGroup"},
    # Custom / other
    {"name": "Apple", "domain": "apple.com", "career_page_url": "https://jobs.apple.com/en-us/search", "ats_type": ATSType.CUSTOM, "ats_job_board_url": "https://jobs.apple.com/en-us/search"},
    {"name": "Google", "domain": "google.com", "career_page_url": "https://careers.google.com/jobs/results/", "ats_type": ATSType.CUSTOM, "ats_job_board_url": "https://careers.google.com/jobs/results/"},
    {"name": "Amazon", "domain": "amazon.com", "career_page_url": "https://www.amazon.jobs/en/", "ats_type": ATSType.CUSTOM, "ats_job_board_url": "https://www.amazon.jobs/en/"},
    {"name": "Tesla", "domain": "tesla.com", "career_page_url": "https://www.tesla.com/careers", "ats_type": ATSType.CUSTOM, "ats_job_board_url": "https://www.tesla.com/careers/search"},
    {"name": "Uber", "domain": "uber.com", "career_page_url": "https://www.uber.com/us/en/careers/", "ats_type": ATSType.CUSTOM, "ats_job_board_url": "https://www.uber.com/us/en/careers/list/"},
    {"name": "Twitter/X", "domain": "x.com", "career_page_url": "https://careers.twitter.com", "ats_type": ATSType.GREENHOUSE, "ats_job_board_url": "https://boards.greenhouse.io/twitter"},
    {"name": "Spotify", "domain": "spotify.com", "career_page_url": "https://www.lifeatspotify.com/jobs", "ats_type": ATSType.GREENHOUSE, "ats_job_board_url": "https://boards.greenhouse.io/spotify"},
    {"name": "Snap Inc", "domain": "snap.com", "career_page_url": "https://careers.snap.com", "ats_type": ATSType.GREENHOUSE, "ats_job_board_url": "https://boards.greenhouse.io/snapchat"},
    {"name": "Pinterest", "domain": "pinterest.com", "career_page_url": "https://www.pinterestcareers.com", "ats_type": ATSType.GREENHOUSE, "ats_job_board_url": "https://boards.greenhouse.io/pinterest"},
    {"name": "Datadog", "domain": "datadoghq.com", "career_page_url": "https://www.datadoghq.com/careers/", "ats_type": ATSType.GREENHOUSE, "ats_job_board_url": "https://boards.greenhouse.io/datadog"},
    {"name": "Coinbase", "domain": "coinbase.com", "career_page_url": "https://www.coinbase.com/careers", "ats_type": ATSType.GREENHOUSE, "ats_job_board_url": "https://boards.greenhouse.io/coinbase"},
    {"name": "DoorDash", "domain": "doordash.com", "career_page_url": "https://careers.doordash.com", "ats_type": ATSType.GREENHOUSE, "ats_job_board_url": "https://boards.greenhouse.io/doordash"},
    {"name": "Instacart", "domain": "instacart.com", "career_page_url": "https://instacart.careers", "ats_type": ATSType.GREENHOUSE, "ats_job_board_url": "https://boards.greenhouse.io/instacart"},
]


async def seed_companies(db: AsyncSession) -> int:
    count = 0
    for data in COMPANIES:
        existing = (await db.execute(select(Company).where(Company.domain == data["domain"]))).scalar_one_or_none()
        if not existing:
            company = Company(**data)
            db.add(company)
            count += 1
    if count:
        await db.commit()
    return count
