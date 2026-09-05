# LinkedIn Job Matcher

A multi-user job tracker. Each person registers, sets their own job profile, and
gets a daily digest of matching roles plus ready-to-edit application drafts —
sent from **their own** mail account, not the instance owner's.

## How it works

- **Accounts**: registration needs an invite code you control (`INVITE_CODE`).
  Sessions are HttpOnly cookies; passwords are PBKDF2-SHA256 with a per-user salt.
- **Job data**: uses the [JSearch API](https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch)
  on RapidAPI, which aggregates listings from LinkedIn, Indeed, Glassdoor, and
  others. This avoids scraping LinkedIn directly, which violates their Terms of
  Service and risks your account being restricted.
- **Matching**: a simple scoring function (title match, skill keyword hits,
  location/remote match, exclude-keyword disqualification) — see [src/match.ts](src/match.ts).
- **Per-user mail**: every user enters their own SMTP host, username and app
  password under **Mail setup**. Applications go out from their address, so
  replies come back to them. The app password is encrypted at rest with
  AES-GCM ([src/crypto.ts](src/crypto.ts)) and is never rendered back to the page.
- **Application drafts**: each new match gets a prepared application email
  waiting at `/drafts`, which the user edits and sends one at a time. Nothing
  reaches a recruiter unless they press Send on that specific draft.
- **Resume attachments**: upload a resume once; every draft can attach it with
  one tick. Sent as a real `multipart/mixed` MIME message ([src/mime.ts](src/mime.ts)).
- **State**: everything is namespaced per user in KV under `u:<userId>:*`.

## Quota, and how many users you can support

Every user's searches run on the **one shared** `RAPIDAPI_KEY`. Each daily cron
run costs **one API request per desired job title, per user**. On the JSearch
free tier (~200 requests/month) that is roughly:

| Users | Titles each | Requests/month |
| --- | --- | --- |
| 1 | 1 | ~30 |
| 6 | 1 | ~180 |
| 3 | 2 | ~180 |

So about **six active users on one title each** before you need a paid plan.
Watch it as you invite people, and raise the plan or trim the cron before it
starts failing silently.

## Setup

### 1. Install dependencies

```
npm install
```

### 2. Get a JSearch API key

Sign up at RapidAPI and subscribe to the free tier of
[JSearch](https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch). Copy your API key.

### 3. Create the KV namespace

```
npx wrangler kv namespace create JOBS_KV
```

Paste the returned `id` into `wrangler.toml` under `[[kv_namespaces]]`.

### 4. Set secrets

```
npx wrangler secret put RAPIDAPI_KEY     # shared job-search key
npx wrangler secret put INVITE_CODE      # required to register; rotate to close signups
npx wrangler secret put ENCRYPTION_KEY   # openssl rand -base64 32
npx wrangler secret put PUBLIC_URL       # optional: https://<worker>.<subdomain>.workers.dev
```

`ENCRYPTION_KEY` encrypts every user's stored mail password. **Changing it makes
all stored mail passwords undecryptable** — users would have to re-enter them.
Back it up somewhere safe.

Note there are no `SMTP_*` secrets. Mail credentials are per-user data, entered
in the app.

### 5. Deploy

```
npm run deploy
```

### 6. Register

Visit `https://<your-worker>.<your-subdomain>.workers.dev/signup`, enter your
invite code, and create the first account. Share the URL and the code with
anyone else you want to let in.

## Using it

1. **Mail setup** — add your SMTP host, username and app password, then press
   **Send test email** to confirm before relying on it.
2. **Profile** — desired titles, skills, locations, exclude keywords, employment
   types, minimum score, how far back to search. Also your name/headline/pitch,
   which fill in the drafts.
3. **Resume** — upload once, at the bottom of the profile page.
4. **Run search** — in the nav; runs immediately rather than waiting for cron.
5. **Drafts** — edit, tick the resume, and send one at a time.

### Gmail

Turn on 2-Step Verification, then create an
[App Password](https://myaccount.google.com/apppasswords) — your normal password
will not work. Use:

```
Host: smtp.gmail.com   Port: 587   Implicit TLS: unticked (STARTTLS)
```

`Send from` must match the SMTP username, or Gmail will reject the message.

## Local development

```
nvm use 18      # wrangler needs Node 18+
npm run dev
```

Secrets for local dev live in `.dev.vars` (same `KEY=value` format, gitignored).
Local KV is simulated on disk under `.wrangler/state`, so no Cloudflare account
is needed to try it. Delete that directory to reset all local accounts and data.

The cron does not fire automatically under Miniflare — run
`npx wrangler dev --test-scheduled` and hit `/__scheduled` to exercise it.

## Application drafts

Drafts are filled from the "Your details" section of the profile. They are
**template-based, not LLM-generated**, on purpose: every claim in the email is
text the user wrote themselves, so the tool can't invent experience or
credentials. The only per-job personalization is the job title, the company,
and the intersection of the user's listed skills with the ones that actually
appear in that listing.

You still have to supply the recipient address — job listings almost never
include a recruiter's email, so grab it from the posting or the company site.

### Resume and attachments

Upload your resume once, in the **Resume** panel at the bottom of `/profile`
(PDF or DOC, up to 5 MB). Every draft then shows an **Attachments** block with
a tick-box for it, on by default.

Each draft can also take extra one-off files (a cover letter, a portfolio PDF)
via "Add other files", attached to that email only and not stored. Total
attachments per email are capped at 10 MB.

## How scoring works

Each job is scored out of 100:

| Signal | Points |
| --- | --- |
| Job title contains one of your desired titles | 40 |
| Skill keywords found in title/description | up to 40, pro-rated by how many matched |
| Location matches (or job is remote) | 20 |

An exclude-keyword hit sets the score to 0 outright, regardless of everything else.

Because location is only worth 20 points, a strong title+skills match in the
wrong city still scores 80 and gets through a `minScore` of 55. If you want
location to be effectively mandatory, set `minScore` above 80.

## Security notes

- Mail app passwords are AES-GCM encrypted with `ENCRYPTION_KEY` before being
  written to KV, and the settings page never renders them back.
- Account passwords are PBKDF2-SHA256 (100k iterations) with a per-user salt.
  That costs CPU on every login — on the **Workers Free plan (10ms CPU/request)**
  you may need to lower `PBKDF2_ITERATIONS` in [src/crypto.ts](src/crypto.ts).
- Login derives a hash even for unknown emails, so response timing doesn't
  reveal which accounts exist.
- Users can only ever read their own KV namespace; there is no admin view and
  no cross-user route.
- You, as the instance operator, hold `ENCRYPTION_KEY` and therefore *can*
  technically decrypt users' mail passwords. Tell people that before inviting
  them — it is the unavoidable shape of a self-hosted shared instance.

## Limitations / things to know

- LinkedIn itself has no public job-search API, so results come from JSearch's
  aggregation rather than a direct LinkedIn feed.
- Only the **first** preferred location is sent to the search API; the rest
  affect scoring only.
- Nothing is ever sent to a recruiter automatically. The cron only emails each
  user their own digest; application drafts sit at `/drafts` until sent by hand.
- The cron iterates every registered user. One user's failure is logged and
  skipped rather than aborting the run.
