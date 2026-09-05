# RoleCall

**A daily roll-call of the jobs actually worth your time — and a prepared
application waiting for each one.**

RoleCall is a self-hosted, invite-only job tracker. Each user sets a profile
once; every morning it searches the job market, scores what it finds against
that profile, and emails a digest of genuinely new matches. For each match it
prepares an application email — which sits in a drafts queue until the user
reads it, edits it, attaches their resume, and presses Send themselves.

> **Live at** https://rolecall.pnil7877.workers.dev
>
> Alternatives considered: **Shortlist** (describes the output, but generic) and
> **Matchbox** (match + mailbox, memorable, but collides with a well-known toy
> brand). **RoleCall** was chosen: a roll-call of *roles*, ownable, and it
> describes the daily rhythm of the product rather than its plumbing.

---

## The problem

Job hunting has a grinding middle. The hard parts — deciding what you want,
writing a good application — are bracketed by hours of tedium:

- Re-running the same searches across several job boards, every day.
- Re-reading listings you already dismissed last week.
- Retyping the same introduction, with the company name swapped out.
- Re-attaching the same resume, over and over.

Tools that automate this usually go too far: they blast generic applications at
every listing that matches a keyword. That is fast, and it is exactly how you
get filtered out as spam — and how you end up with a CV that claims experience
you don't have.

## What RoleCall does instead

It automates **finding and preparing**, and deliberately stops short of
**sending**.

```
   daily cron
        │
        ▼
   search job boards ──► score against your profile ──► drop anything seen before
                                                              │
                                          ┌───────────────────┴──────────────┐
                                          ▼                                  ▼
                              email you a digest                draft an application per match
                                                                             │
                                                                             ▼
                                                          waits in /drafts until YOU press Send
```

Three commitments follow from that design:

1. **Nothing reaches a recruiter automatically.** The scheduled run only ever
   emails *you*. Every outgoing application is one deliberate human click.
2. **No invented credentials.** Drafts are template-based, not LLM-generated.
   Every sentence comes from text the user wrote in their own profile. The only
   per-job personalisation is the job title, the company, and the *intersection*
   of the user's stated skills with the ones that actually appear in the listing.
   The tool cannot claim experience its user doesn't have.
3. **Mail goes out from the user's own account.** Each person supplies their own
   SMTP credentials, so replies land in their inbox and the sender is really
   them — not a shared robot address that lands in spam.

## Who it's for

- **Active job seekers** who want the search running in the background without
  surrendering control of what gets sent in their name.
- **Small groups** — a bootcamp cohort, a college placement batch, a few
  friends job-hunting together — sharing one instance behind an invite code.
- **Self-hosters** who would rather own the data than hand a resume and job
  preferences to a third-party SaaS.

---

## Platforms and integrations

### Job sources — many boards, one search

RoleCall queries the [JSearch API](https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch),
which wraps Google for Jobs. One search reaches
many boards at once. A single live 10-result query for *"software engineer in
Ahmedabad"* returned postings from **six distinct boards**:

| Board | Postings in that sample |
| --- | --- |
| LinkedIn | 2 |
| Shine | 2 |
| Apna | 2 |
| Kit Job | 2 |
| BeBee | 1 |
| SimplyHired | 1 |

The mix shifts by country and query — a US search leans toward Indeed,
Glassdoor and ZipRecruiter; the Indian market surfaces Shine and Apna. The point
is that the user searches *once* and the aggregator fans out.

This is also a deliberate legal choice: LinkedIn has no public job-search API,
and scraping it directly violates their Terms of Service and risks the user's
account being restricted. Going through an aggregator avoids that entirely.

### Email — any SMTP provider

There is no hard-coded mail vendor. The SMTP client is written from scratch
against raw TCP sockets ([src/smtp.ts](src/smtp.ts)), speaking
EHLO / STARTTLS / AUTH LOGIN / MAIL / RCPT / DATA. Anything that accepts
authenticated SMTP works:

| Provider | Host | Port | Notes |
| --- | --- | --- | --- |
| Gmail | `smtp.gmail.com` | 587 | Needs 2FA + an App Password |
| Zoho | `smtp.zoho.com` | 587 | |
| Fastmail | `smtp.fastmail.com` | 465 | Tick implicit TLS |
| Custom domain | your host | 587 / 465 | |

Both TLS modes are supported: STARTTLS (587) and implicit TLS (465). Port 25 is
blocked by Cloudflare and cannot be used.

### Hosting — Cloudflare Workers

**One platform, by design.** RoleCall depends on three Cloudflare-specific
capabilities and does not run on Node, Vercel or a container without changes:

- **`cloudflare:sockets`** — raw TCP, which is what makes a from-scratch SMTP
  client possible at the edge.
- **Workers KV** — all persistence. No database to run.
- **Cron Triggers** — the daily scheduled run.

The upside is that the entire service runs with no server, no database instance,
and no infrastructure bill at small scale.

### Client — any modern browser

Server-rendered HTML with no front-end framework and no build step. Works on
desktop and mobile, and follows the reader's light/dark system preference.
There is no native app and none is needed.

---

## Feature summary

| Area | What it does |
| --- | --- |
| **Accounts** | Invite-code registration, browser-side PBKDF2 (600k), HttpOnly cookie sessions |
| **Search** | Daily cron per user, plus on-demand "Run search" |
| **Matching** | 0–100 score: title (40) + skills (up to 40) + location (20); exclusions zero it out |
| **Deduplication** | A job you've been told about is never sent twice (30-day memory) |
| **Digest** | HTML email summarising new matches, linking back to the drafts page |
| **Drafts** | One prepared application per match, editable, collapsible, unsent-first |
| **Attachments** | Resume stored once and attached with one tick; extra per-draft files |
| **Mail setup** | Per-user SMTP credentials, encrypted at rest, with a test-send button |
| **Isolation** | Every user's data namespaced under `u:<userId>:*` |

---

## Architecture

~2,300 lines of TypeScript across 18 modules, no runtime dependencies.

| Module | Lines | Responsibility |
| --- | --- | --- |
| `ui.ts` | 756 | All server-rendered HTML and the design system |
| `index.ts` | 446 | Router, session gate, cron entry point |
| `types.ts` | 141 | Shared interfaces |
| `smtp.ts` | 135 | SMTP client over raw TCP |
| `mime.ts` | 115 | RFC 5322/2045 message construction |
| `auth.ts` | 99 | Users, sessions, cookies, key namespacing |
| `crypto.ts` | 95 | Credential hashing, AES-GCM encryption |
| `match.ts` | 69 | Scoring |
| `settings.ts` | 61 | Per-user SMTP settings |
| `profile.ts` · `jobsearch.ts` | 60 each | Profile storage · JSearch queries |
| `draft.ts` · `digest.ts` | 56 · 53 | Draft templating · digest HTML |
| `resume.ts` · `drafts-store.ts` | 47 · 40 | Resume blobs · draft CRUD |
| `seen.ts` · `migrate.ts` | 27 each | Dedup memory · one-time legacy import |

**Stack:** TypeScript · Cloudflare Workers · Workers KV · WebCrypto · Wrangler.
No React, no ORM, no CSS framework, no npm runtime dependencies.

### Data model

Everything lives in one KV namespace, namespaced by user:

```
user:<uuid>              → account record
email:<address>          → uuid            (login index)
session:<token>          → uuid            (30-day TTL)
u:<uuid>:profile         → search criteria + applicant details
u:<uuid>:smtp            → mail settings, password encrypted
u:<uuid>:resume          → file bytes + metadata
u:<uuid>:draft:<jobId>   → prepared application  (30-day TTL)
u:<uuid>:seen:<jobId>    → dedup marker          (30-day TTL)
```

---

## Security model

- **Account passwords**: stretched in the BROWSER with PBKDF2-SHA256 at 600,000
  iterations; only the derived key is transmitted. The Worker stores a salted
  SHA-256 of it, costing near-zero CPU (what keeps the app on the Workers Free
  plan). Requires JavaScript to sign in.
- **Login timing**: a hash is derived even for unknown emails, so response time
  doesn't reveal which accounts exist.
- **Mail passwords**: AES-GCM encrypted under a master `ENCRYPTION_KEY` before
  being written to KV, and never rendered back to the page.
- **Sessions**: HttpOnly, SameSite=Lax, `Secure` over HTTPS. No tokens in URLs.
- **Isolation**: there is no admin view and no cross-user route. Every handler
  reads only the signed-in user's namespace.

**The honest caveat:** whoever operates the instance holds `ENCRYPTION_KEY` and
can therefore technically decrypt users' stored mail passwords. That is the
unavoidable shape of a self-hosted shared instance, and invitees should be told
before they hand over an app password.

---

## Capacity and cost

At small scale this runs free, but **one limit binds before all others**: every
user's searches run on a single shared RapidAPI key, costing one request per
job title per user per day.

| Users | Titles each | Requests/month | Free tier (~200) |
| --- | --- | --- | --- |
| 1 | 1 | ~30 | fine |
| 1 | 3 | ~90 | fine |
| 6 | 1 | ~180 | at the edge |
| 10 | 2 | ~600 | needs a paid plan |

Roughly **six active users on one title each**. Cloudflare's free tier
(100k requests/day, 1 GB KV) is nowhere near binding by comparison.

---

## Known limitations

- **Only the first preferred location is searched.** The rest affect scoring
  but don't widen the query — the most common source of user confusion.
- **Recruiter addresses aren't discoverable.** Listings rarely publish them, so
  the user supplies the recipient by hand. This is the one genuinely manual step.
- **Cloudflare-only.** The TCP-socket SMTP client doesn't port to other runtimes.
- **No password reset.** A locked-out user needs the operator to intervene.
- **JavaScript required for auth.** Password stretching happens client-side to
  stay inside the Workers Free 10ms CPU budget, so login and signup do not work
  with JS disabled. Every other page is plain server-rendered HTML.
- **Aggregator coverage.** Results come from JSearch's aggregation, not a direct
  feed from any single board.

## Possible next steps

- Password reset via emailed token (the SMTP layer already exists).
- Per-user API keys, removing the shared-quota ceiling entirely.
- Recruiter-address lookup or a per-company address book.
- Application status tracking — replied, interviewing, rejected.
- Digest frequency per user, instead of one global cron time.

---

## Documentation

| Document | Audience |
| --- | --- |
| [README.md](README.md) | Operators — setup, secrets, deployment |
| [docs/setup-guide.html](docs/setup-guide.html) | End users — eight-step onboarding walkthrough |
| PROJECT.md | This file — what the project is and why |
