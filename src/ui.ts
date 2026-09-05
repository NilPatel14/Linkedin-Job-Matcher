import { Draft, Profile, ResumeMeta, SmtpSettings, User } from "./types";
import { formatBytes } from "./resume";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

const EMPLOYMENT_TYPES = ["FULLTIME", "CONTRACTOR", "PARTTIME", "INTERN"] as const;

const STYLES = `
  :root {
    --bg: #f1f5f9;
    --surface: #ffffff;
    --surface-2: #f8fafc;
    --border: #e2e8f0;
    --text: #0f172a;
    --muted: #64748b;
    --accent: #0a66c2;
    --accent-hover: #084e96;
    --accent-soft: #e8f1fb;
    --ok-bg: #ecfdf5; --ok-fg: #047857; --ok-border: #a7f3d0;
    --err-bg: #fef2f2; --err-fg: #b91c1c; --err-border: #fecaca;
    --warn-bg: #fffbeb; --warn-fg: #b45309; --warn-border: #fde68a;
    --radius: 12px;
    --shadow: 0 1px 2px rgba(15,23,42,.04), 0 2px 8px rgba(15,23,42,.06);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0b1120; --surface: #131c2e; --surface-2: #0f1728; --border: #24314a;
      --text: #e2e8f0; --muted: #94a3b8;
      --accent: #3b82f6; --accent-hover: #60a5fa; --accent-soft: #17253f;
      --ok-bg: #06291d; --ok-fg: #6ee7b7; --ok-border: #065f46;
      --err-bg: #3a1416; --err-fg: #fca5a5; --err-border: #7f1d1d;
      --warn-bg: #2c2109; --warn-fg: #fbbf24; --warn-border: #78500f;
      --shadow: 0 1px 3px rgba(0,0,0,.5);
    }
  }

  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: var(--bg); color: var(--text); margin: 0;
    font-size: 14px; line-height: 1.55;
    -webkit-font-smoothing: antialiased;
  }
  a { color: var(--accent); }

  /* ---- top navigation ---- */
  .nav {
    background: var(--surface); border-bottom: 1px solid var(--border);
    position: sticky; top: 0; z-index: 20;
  }
  .nav-inner {
    max-width: 940px; margin: 0 auto; padding: 0 20px;
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-height: 58px;
  }
  .brand {
    font-weight: 700; font-size: 15px; color: var(--text); text-decoration: none;
    display: flex; align-items: center; gap: 8px; margin-right: 8px;
  }
  .brand .dot {
    width: 22px; height: 22px; border-radius: 6px; background: var(--accent);
    color: #fff; display: grid; place-items: center; font-size: 12px;
  }
  .nav-links { display: flex; gap: 2px; flex: 1; flex-wrap: wrap; }
  .nav-link {
    padding: 8px 12px; border-radius: 8px; text-decoration: none;
    color: var(--muted); font-weight: 600; font-size: 13px;
    display: flex; align-items: center; gap: 6px;
  }
  .nav-link:hover { background: var(--surface-2); color: var(--text); }
  .nav-link.active { background: var(--accent-soft); color: var(--accent); }
  .nav-count { background: var(--accent); color: #fff; border-radius: 20px; font-size: 11px; padding: 1px 7px; font-weight: 700; }
  .nav-actions { display: flex; gap: 8px; align-items: center; }
  .who { color: var(--muted); font-size: 12px; margin-left: 4px; }
  .logout { background: none; border: none; color: var(--muted); font-size: 12px; cursor: pointer; padding: 6px 8px; font-family: inherit; font-weight: 600; }
  .logout:hover { color: var(--err-fg); background: none; }

  /* ---- layout ---- */
  .wrap { max-width: 940px; margin: 0 auto; padding: 26px 20px 60px; }
  .page-head { margin-bottom: 20px; }
  .page-head h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -.01em; }
  .page-head p { margin: 0; color: var(--muted); font-size: 13px; }

  .panel {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); box-shadow: var(--shadow);
    padding: 20px; margin-bottom: 18px;
  }
  .panel > h2 {
    font-size: 12px; text-transform: uppercase; letter-spacing: .06em;
    color: var(--muted); margin: 0 0 14px; font-weight: 700;
  }

  /* ---- forms ---- */
  label { display: block; margin-top: 14px; font-weight: 600; font-size: 13px; }
  label:first-of-type { margin-top: 0; }
  input[type=text], input[type=number], input[type=password], input[type=email], select, textarea {
    width: 100%; padding: 9px 11px; margin-top: 5px;
    border: 1px solid var(--border); border-radius: 8px;
    font-size: 14px; font-family: inherit; font-weight: 400;
    background: var(--surface-2); color: var(--text);
  }
  input:focus, select:focus, textarea:focus {
    outline: none; border-color: var(--accent); background: var(--surface);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  textarea { resize: vertical; line-height: 1.6; }
  .hint { color: var(--muted); font-size: 12px; font-weight: 400; }
  .row { display: flex; gap: 14px; flex-wrap: wrap; }
  .row > div { flex: 1; min-width: 180px; }

  .checks { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  .check {
    display: inline-flex; align-items: center; gap: 7px; margin: 0;
    padding: 7px 12px; border: 1px solid var(--border); border-radius: 20px;
    background: var(--surface-2); cursor: pointer; font-size: 13px; font-weight: 500;
  }
  .check:hover { border-color: var(--accent); }
  .check input { width: auto; margin: 0; accent-color: var(--accent); }

  /* ---- buttons ---- */
  button, .btn {
    padding: 9px 16px; background: var(--accent); color: #fff;
    border: 1px solid transparent; border-radius: 8px;
    font-size: 13px; font-weight: 600; font-family: inherit;
    cursor: pointer; text-decoration: none; display: inline-flex;
    align-items: center; gap: 6px; white-space: nowrap;
  }
  button:hover, .btn:hover { background: var(--accent-hover); }
  .btn-ghost, button.secondary {
    background: var(--surface); color: var(--text); border-color: var(--border);
  }
  .btn-ghost:hover, button.secondary:hover { background: var(--surface-2); color: var(--text); }
  button.danger { background: var(--surface); color: var(--err-fg); border-color: var(--border); }
  button.danger:hover { background: var(--err-bg); }
  .btn-sm { padding: 6px 12px; font-size: 12px; }
  .actions { display: flex; gap: 10px; align-items: center; margin-top: 18px; flex-wrap: wrap; }

  /* ---- messages ---- */
  .msg {
    padding: 11px 14px; border-radius: 8px; margin-bottom: 16px;
    font-size: 13px; font-weight: 500; border: 1px solid transparent;
  }
  .msg.ok { background: var(--ok-bg); color: var(--ok-fg); border-color: var(--ok-border); }
  .msg.err { background: var(--err-bg); color: var(--err-fg); border-color: var(--err-border); }
  .msg.warn { background: var(--warn-bg); color: var(--warn-fg); border-color: var(--warn-border); }
  .msg a { color: inherit; font-weight: 700; }

  /* ---- stats ---- */
  .stats { display: flex; gap: 12px; margin-bottom: 18px; flex-wrap: wrap; }
  .stat {
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    padding: 14px 18px; flex: 1; min-width: 110px; box-shadow: var(--shadow);
  }
  .stat .n { font-size: 24px; font-weight: 700; letter-spacing: -.02em; }
  .stat .k { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; font-weight: 600; }

  /* ---- draft cards ---- */
  .draft {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); box-shadow: var(--shadow); margin-bottom: 12px;
    overflow: hidden;
  }
  .draft[open] { border-color: var(--accent); }
  .draft.is-sent { opacity: .78; }
  .draft > summary {
    padding: 14px 18px; cursor: pointer; list-style: none;
    display: flex; align-items: center; gap: 12px;
  }
  .draft > summary::-webkit-details-marker { display: none; }
  .draft > summary:hover { background: var(--surface-2); }
  .draft .chev { color: var(--muted); font-size: 11px; transition: transform .15s; }
  .draft[open] .chev { transform: rotate(90deg); }
  .draft .title { font-weight: 650; font-size: 14px; }
  .draft .sub { color: var(--muted); font-size: 12px; margin-top: 1px; }
  .draft .grow { flex: 1; min-width: 0; }
  .draft .body { padding: 4px 18px 18px; border-top: 1px solid var(--border); }

  .badge { display: inline-block; font-size: 11px; padding: 2px 9px; border-radius: 20px; font-weight: 700; white-space: nowrap; }
  .badge.sent { background: var(--ok-bg); color: var(--ok-fg); }
  .badge.score-hi { background: var(--ok-bg); color: var(--ok-fg); }
  .badge.score-mid { background: var(--accent-soft); color: var(--accent); }
  .badge.score-lo { background: var(--surface-2); color: var(--muted); }

  /* ---- attachments ---- */
  .attach {
    margin-top: 14px; padding: 12px 14px; background: var(--surface-2);
    border: 1px dashed var(--border); border-radius: 8px;
  }
  .attach-head { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); margin-bottom: 9px; }
  .attach .check { background: var(--surface); }
  .file-name { font-weight: 600; }
  .file-size { color: var(--muted); font-weight: 400; }
  input[type=file] { width: 100%; margin-top: 7px; font-size: 12px; font-family: inherit; color: var(--muted); }
  input[type=file]::file-selector-button {
    padding: 6px 12px; margin-right: 10px; border-radius: 7px;
    border: 1px solid var(--border); background: var(--surface);
    color: var(--text); font-weight: 600; font-size: 12px;
    font-family: inherit; cursor: pointer;
  }
  input[type=file]::file-selector-button:hover { background: var(--surface-2); }

  .empty { text-align: center; padding: 40px 20px; color: var(--muted); }
  .empty h3 { margin: 0 0 6px; color: var(--text); font-size: 15px; }

  /* ---- auth pages ---- */
  .gate { max-width: 400px; margin: 9vh auto; padding: 0 20px; }
  .gate .panel { padding: 28px; }
  .gate h1 { font-size: 19px; margin: 0 0 4px; text-align: center; }
  .gate p.sub { color: var(--muted); text-align: center; margin: 0 0 20px; font-size: 13px; }
  .gate button { width: 100%; justify-content: center; margin-top: 18px; }
  .gate .dot {
    width: 34px; height: 34px; border-radius: 10px; background: var(--accent);
    color: #fff; display: grid; place-items: center; margin: 0 auto 12px; font-size: 16px;
  }
  .gate .alt { text-align: center; margin: 16px 0 0; font-size: 13px; color: var(--muted); }
`;

interface NavUser {
  email: string;
}

function nav(user: NavUser, active: string, draftCount?: number): string {
  const count = draftCount ? `<span class="nav-count">${draftCount}</span>` : "";
  const link = (href: string, id: string, label: string) =>
    `<a class="nav-link ${active === id ? "active" : ""}" href="${href}">${label}</a>`;

  return `
  <nav class="nav">
    <div class="nav-inner">
      <a class="brand" href="/profile"><span class="dot">&#9679;</span> Job Matcher</a>
      <div class="nav-links">
        ${link("/profile", "profile", "Profile")}
        ${link("/drafts", "drafts", `Drafts ${count}`)}
        ${link("/settings", "settings", "Mail setup")}
      </div>
      <div class="nav-actions">
        <a class="btn btn-sm" href="/run?ui=1">Run search</a>
        <span class="who">${esc(user.email)}</span>
        <form method="POST" action="/logout" style="display:inline;">
          <button type="submit" class="logout">Sign out</button>
        </form>
      </div>
    </div>
  </nav>`;
}

interface LayoutOpts {
  title: string;
  user: NavUser;
  active: string;
  heading: string;
  sub?: string;
  draftCount?: number;
  savedMessage?: string;
  error?: string;
  warning?: string;
  body: string;
}

function layout(o: LayoutOpts): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(o.title)}</title>
  <style>${STYLES}</style>
</head>
<body>
  ${nav(o.user, o.active, o.draftCount)}
  <div class="wrap">
    <div class="page-head">
      <h1>${esc(o.heading)}</h1>
      ${o.sub ? `<p>${esc(o.sub)}</p>` : ""}
    </div>
    ${o.savedMessage ? `<div class="msg ok">${esc(o.savedMessage)}</div>` : ""}
    ${o.error ? `<div class="msg err">${esc(o.error)}</div>` : ""}
    ${o.warning || ""}
    ${o.body}
  </div>
</body>
</html>`;
}

/**
 * Stretches the password in the browser and submits only the derived key, so
 * the Worker never spends CPU on PBKDF2 — it stays inside the 10ms Workers Free
 * budget while the work factor stays high. The real password never leaves the
 * page. Iteration count must match CLIENT_PBKDF2_ITERATIONS in crypto.ts.
 */
const AUTH_SCRIPT = `
<script>
(function () {
  var ITERATIONS = 600000;
  var form = document.getElementById("authForm");
  if (!form || !window.crypto || !window.crypto.subtle) return;

  var note = document.getElementById("jsNote");
  if (note) note.remove();

  form.addEventListener("submit", function (ev) {
    if (form.dataset.ready === "1") return;
    ev.preventDefault();

    var email = form.email.value.trim().toLowerCase();
    var password = form.password.value;
    var button = form.querySelector("button[type=submit]");
    var label = button.textContent;
    button.disabled = true;
    button.textContent = "Securing\\u2026";

    var enc = new TextEncoder();
    crypto.subtle.digest("SHA-256", enc.encode("jobmatcher:" + email))
      .then(function (salt) {
        return crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"])
          .then(function (key) {
            return crypto.subtle.deriveBits(
              { name: "PBKDF2", salt: new Uint8Array(salt), iterations: ITERATIONS, hash: "SHA-256" },
              key, 256
            );
          });
      })
      .then(function (bits) {
        var bytes = new Uint8Array(bits), s = "";
        for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
        form.derivedKey.value = btoa(s);
        // Never transmit the password itself.
        form.password.value = "";
        form.password.removeAttribute("name");
        form.dataset.ready = "1";
        form.submit();
      })
      .catch(function () {
        button.disabled = false;
        button.textContent = label;
        alert("Could not secure your password in this browser. Please try a different one.");
      });
  });
})();
</script>`;

function authShell(title: string, inner: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <style>${STYLES}</style>
</head>
<body>
  <div class="gate">
    <div class="panel">
      <div class="dot">&#9679;</div>
      ${inner}
    </div>
  </div>
  ${AUTH_SCRIPT}
</body>
</html>`;
}

export function renderLogin(opts: { error?: string; notice?: string; email?: string } = {}): string {
  return authShell(
    "Sign in — Job Matcher",
    `
      <h1>Welcome back</h1>
      <p class="sub">Sign in to your job matcher</p>
      ${opts.notice ? `<div class="msg ok">${esc(opts.notice)}</div>` : ""}
      ${opts.error ? `<div class="msg err">${esc(opts.error)}</div>` : ""}
      <noscript><div class="msg err" id="jsNoteStatic">JavaScript is required to sign in.</div></noscript>
      <div class="msg err" id="jsNote">JavaScript is required to sign in.</div>
      <form method="POST" action="/login" id="authForm">
        <input type="hidden" name="derivedKey" value="">
        <label>Email
          <input type="email" name="email" value="${esc(opts.email || "")}" required autofocus autocomplete="username">
        </label>
        <label>Password
          <input type="password" name="password" required autocomplete="current-password">
        </label>
        <button type="submit">Sign in</button>
      </form>
      <p class="alt">No account yet? <a href="/signup">Register with an invite code</a></p>`
  );
}

export function renderSignup(opts: { error?: string; email?: string } = {}): string {
  return authShell(
    "Register — Job Matcher",
    `
      <h1>Create your account</h1>
      <p class="sub">You need an invite code from whoever runs this instance</p>
      ${opts.error ? `<div class="msg err">${esc(opts.error)}</div>` : ""}
      <noscript><div class="msg err" id="jsNoteStatic">JavaScript is required to register.</div></noscript>
      <div class="msg err" id="jsNote">JavaScript is required to register.</div>
      <form method="POST" action="/signup" id="authForm">
        <input type="hidden" name="derivedKey" value="">
        <label>Email
          <input type="email" name="email" value="${esc(opts.email || "")}" required autofocus autocomplete="username">
        </label>
        <label>Password <span class="hint">(at least 8 characters)</span>
          <input type="password" name="password" required minlength="8" autocomplete="new-password">
        </label>
        <label>Invite code
          <input type="password" name="inviteCode" required>
        </label>
        <button type="submit">Create account</button>
      </form>
      <p class="alt">Already registered? <a href="/login">Sign in</a></p>`
  );
}

/** Shown across pages when the user hasn't set up their own outgoing mail yet. */
function smtpWarning(configured: boolean, active: string): string {
  if (configured || active === "settings") return "";
  return `<div class="msg warn">
    Your outgoing email isn't set up yet, so nothing can be sent.
    <a href="/settings">Add your mail account</a>.
  </div>`;
}

export function renderSettings(
  user: User,
  settings: SmtpSettings | null,
  opts: { savedMessage?: string; error?: string; draftCount?: number } = {}
): string {
  const s = settings;
  const hasPassword = !!s?.passEncrypted;

  const body = `
  <div class="panel">
    <h2>Your outgoing mail account</h2>
    <p class="hint" style="margin:-8px 0 14px;">
      Applications and digests are sent from <strong>your own</strong> mail account, so replies
      come back to you. Nothing is sent through anyone else's address.
    </p>

    <form method="POST" action="/settings">
      <div class="row">
        <div>
          <label>SMTP host
            <input type="text" name="host" value="${esc(s?.host || "smtp.gmail.com")}" required placeholder="smtp.gmail.com">
          </label>
        </div>
        <div>
          <label>Port
            <input type="number" name="port" value="${s?.port ?? 587}" required>
          </label>
        </div>
      </div>

      <div class="checks">
        <label class="check">
          <input type="checkbox" name="secure" ${s?.secure ? "checked" : ""}>
          Implicit TLS (port 465)
        </label>
      </div>
      <p class="hint" style="margin-top:6px;">Leave unticked for port 587, which uses STARTTLS.</p>

      <label>SMTP username <span class="hint">(usually your full email address)</span>
        <input type="email" name="user" value="${esc(s?.user || user.email)}" required>
      </label>

      <label>App password
        <span class="hint">${hasPassword ? "(stored — leave blank to keep it)" : "(16 characters, no spaces)"}</span>
        <input type="password" name="pass" ${hasPassword ? "" : "required"} placeholder="${hasPassword ? "•••••••••••••••• stored" : "abcdefghijklmnop"}" autocomplete="new-password">
      </label>
      <p class="hint" style="margin-top:6px;">
        Use an <strong>app password</strong>, never your real account password. For Gmail, turn on
        2-Step Verification then create one at
        <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener">Google App Passwords</a>.
        It's encrypted before being stored, and can never be read back out of this page.
      </p>

      <div class="row" style="margin-top:14px;">
        <div>
          <label>Send from <span class="hint">(must match the username)</span>
            <input type="email" name="mailFrom" value="${esc(s?.mailFrom || user.email)}" required>
          </label>
        </div>
        <div>
          <label>Send digests to
            <input type="email" name="notifyEmail" value="${esc(s?.notifyEmail || user.email)}" required>
          </label>
        </div>
      </div>

      <div class="actions">
        <button type="submit">Save mail settings</button>
        ${hasPassword ? `<a class="btn btn-ghost" href="/test-email?ui=1">Send test email</a>` : ""}
      </div>
    </form>
  </div>

  ${
    hasPassword
      ? `<div class="panel">
           <h2>Danger zone</h2>
           <p class="hint" style="margin:-8px 0 12px;">
             Removes your stored credentials. Searches keep running, but nothing can be emailed.
           </p>
           <form method="POST" action="/settings/delete">
             <button type="submit" class="danger">Remove mail settings</button>
           </form>
         </div>`
      : ""
  }`;

  return layout({
    title: "Mail setup — Job Matcher",
    user,
    active: "settings",
    heading: "Mail setup",
    sub: "The account your applications are sent from.",
    draftCount: opts.draftCount,
    savedMessage: opts.savedMessage,
    error: opts.error,
    body,
  });
}

export function renderProfileForm(
  user: User,
  profile: Profile,
  opts: {
    savedMessage?: string;
    error?: string;
    resume?: ResumeMeta | null;
    draftCount?: number;
    smtpConfigured?: boolean;
  } = {}
): string {
  const employmentCheckboxes = EMPLOYMENT_TYPES.map(
    (ty) => `
      <label class="check">
        <input type="checkbox" name="employmentTypes" value="${ty}" ${profile.employmentTypes.includes(ty) ? "checked" : ""}>
        ${ty}
      </label>`
  ).join("");

  const body = `
  <form method="POST" action="/profile">
    <div class="panel">
      <h2>Search criteria</h2>

      <label>Desired job titles <span class="hint">(comma-separated &mdash; each one costs a separate API request)</span>
        <input type="text" name="titles" value="${esc(profile.titles.join(", "))}" placeholder="Software Engineer, Frontend Developer">
      </label>

      <label>Skills / keywords <span class="hint">(comma-separated &mdash; these drive the match score)</span>
        <input type="text" name="skills" value="${esc(profile.skills.join(", "))}" placeholder="React, Python, MySQL">
      </label>

      <label>Preferred locations <span class="hint">(only the first is sent to the search API; the rest affect scoring only)</span>
        <input type="text" name="locations" value="${esc(profile.locations.join(", "))}" placeholder="Ahmedabad, Pune">
      </label>

      <div class="checks">
        <label class="check">
          <input type="checkbox" name="remoteOnly" ${profile.remoteOnly ? "checked" : ""}>
          Remote only
        </label>
      </div>

      <label>Exclude keywords <span class="hint">(any hit disqualifies the job outright)</span>
        <input type="text" name="excludeKeywords" value="${esc(profile.excludeKeywords.join(", "))}" placeholder="senior, manager">
      </label>

      <label>Employment types</label>
      <div class="checks">${employmentCheckboxes}</div>

      <div class="row" style="margin-top:16px;">
        <div>
          <label>Minimum match score <span class="hint">(0&ndash;100)</span>
            <input type="number" name="minScore" min="0" max="100" value="${profile.minScore}">
          </label>
        </div>
        <div>
          <label>Posted within
            <select name="datePosted">
              ${["today", "3days", "week", "month"]
                .map((v) => `<option value="${v}" ${profile.datePosted === v ? "selected" : ""}>${v}</option>`)
                .join("")}
            </select>
          </label>
        </div>
        <div>
          <label>Country <span class="hint">(2-letter code)</span>
            <input type="text" name="country" value="${esc(profile.country)}" maxlength="2" placeholder="in">
          </label>
        </div>
      </div>
    </div>

    <div class="panel">
      <h2>Your details</h2>
      <p class="hint" style="margin:-8px 0 14px;">
        Used verbatim to fill in application drafts. Nothing here is invented for you.
      </p>

      <div class="row">
        <div>
          <label>Full name
            <input type="text" name="fullName" value="${esc(profile.applicant.fullName)}">
          </label>
        </div>
        <div>
          <label>Phone <span class="hint">(optional)</span>
            <input type="text" name="phone" value="${esc(profile.applicant.phone)}">
          </label>
        </div>
      </div>

      <label>Headline <span class="hint">(one line)</span>
        <input type="text" name="headline" value="${esc(profile.applicant.headline)}" placeholder="Frappe/ERPNext developer, 3 years experience">
      </label>

      <label>Pitch <span class="hint">(a short paragraph in your own words)</span>
        <textarea name="pitch" rows="4">${esc(profile.applicant.pitch)}</textarea>
      </label>

      <div class="row">
        <div>
          <label>LinkedIn URL
            <input type="text" name="linkedinUrl" value="${esc(profile.applicant.linkedinUrl)}">
          </label>
        </div>
        <div>
          <label>Portfolio URL
            <input type="text" name="portfolioUrl" value="${esc(profile.applicant.portfolioUrl)}">
          </label>
        </div>
      </div>

      <div class="actions">
        <button type="submit">Save profile</button>
      </div>
    </div>
  </form>

  ${renderResumePanel(opts.resume ?? null)}`;

  return layout({
    title: "Profile — Job Matcher",
    user,
    active: "profile",
    heading: "Profile",
    sub: "What to search for, and what goes into your application drafts.",
    draftCount: opts.draftCount,
    savedMessage: opts.savedMessage,
    error: opts.error,
    warning: smtpWarning(!!opts.smtpConfigured, "profile"),
    body,
  });
}

/** Resume lives outside the profile form — HTML forbids nested forms. */
function renderResumePanel(resume: ResumeMeta | null): string {
  const current = resume
    ? `<div class="attach" style="border-style:solid;">
         <div class="attach-head">Currently stored</div>
         <div>
           <span class="file-name">${esc(resume.filename)}</span>
           <span class="file-size">&middot; ${formatBytes(resume.size)} &middot; uploaded ${esc(resume.uploadedAt.slice(0, 10))}</span>
         </div>
         <div class="actions" style="margin-top:12px;">
           <a class="btn btn-ghost btn-sm" href="/resume" target="_blank" rel="noopener">Download</a>
           <form method="POST" action="/profile/resume/delete" style="display:inline;">
             <button type="submit" class="danger btn-sm" style="margin:0;">Remove</button>
           </form>
         </div>
       </div>`
    : `<p class="hint" style="margin:-8px 0 12px;">
         No resume stored yet. Upload one and you can attach it to any application with a single click.
       </p>`;

  return `
  <div class="panel">
    <h2>Resume</h2>
    ${current}
    <form method="POST" action="/profile/resume" enctype="multipart/form-data">
      <label style="margin-top:16px;">${resume ? "Replace it" : "Upload your resume"}
        <span class="hint">(PDF or DOC, up to 5 MB)</span>
        <input type="file" name="resume" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required>
      </label>
      <div class="actions">
        <button type="submit" class="btn-ghost">${resume ? "Replace resume" : "Upload resume"}</button>
      </div>
    </form>
  </div>`;
}

/** Review page: every draft is edited and sent by hand, one at a time. */
export function renderDraftsPage(
  user: User,
  drafts: Draft[],
  opts: {
    savedMessage?: string;
    error?: string;
    resume?: ResumeMeta | null;
    smtpConfigured?: boolean;
  } = {}
): string {
  const resume = opts.resume ?? null;
  // Unsent first — those are the ones that still need action.
  const ordered = [...drafts].sort((a, b) => {
    if (!!a.sentAt !== !!b.sentAt) return a.sentAt ? 1 : -1;
    return b.createdAt.localeCompare(a.createdAt);
  });
  const sentCount = drafts.filter((d) => d.sentAt).length;

  const stats = drafts.length
    ? `<div class="stats">
         <div class="stat"><div class="n">${drafts.length}</div><div class="k">Total</div></div>
         <div class="stat"><div class="n">${drafts.length - sentCount}</div><div class="k">Awaiting you</div></div>
         <div class="stat"><div class="n">${sentCount}</div><div class="k">Sent</div></div>
       </div>`
    : "";

  const cards = ordered.length
    ? ordered.map((d) => renderDraftCard(d, resume)).join("")
    : `<div class="panel empty">
         <h3>No drafts yet</h3>
         <p class="hint">They appear here automatically when a search finds new matches.<br>
         Hit <strong>Run search</strong> up top to look now.</p>
       </div>`;

  const resumeNote = resume
    ? ""
    : `<div class="msg" style="background:var(--surface);border-color:var(--border);color:var(--muted);">
         No resume stored yet &mdash; <a href="/profile">upload one on your profile</a>
         to attach it to applications with one click.
       </div>`;

  return layout({
    title: "Drafts — Job Matcher",
    user,
    active: "drafts",
    heading: "Application drafts",
    sub: "Nothing is sent until you press Send on a specific draft.",
    draftCount: drafts.length,
    savedMessage: opts.savedMessage,
    error: opts.error,
    warning: smtpWarning(!!opts.smtpConfigured, "drafts"),
    body: `${stats}${resumeNote}${cards}`,
  });
}

function scoreBadge(score?: number): string {
  if (typeof score !== "number") return "";
  const cls = score >= 80 ? "score-hi" : score >= 60 ? "score-mid" : "score-lo";
  return `<span class="badge ${cls}">${score}% match</span>`;
}

function renderDraftCard(d: Draft, resume: ResumeMeta | null): string {
  const sent = !!d.sentAt;

  const attachBlock = `
      <div class="attach">
        <div class="attach-head">Attachments</div>
        ${
          resume
            ? `<label class="check">
                 <input type="checkbox" name="attachResume" checked>
                 <span><span class="file-name">${esc(resume.filename)}</span>
                 <span class="file-size">&middot; ${formatBytes(resume.size)}</span></span>
               </label>`
            : `<div class="hint">No stored resume. Upload one on your profile to attach it automatically.</div>`
        }
        <label style="margin-top:10px;">Add other files <span class="hint">(optional, e.g. a cover letter)</span>
          <input type="file" name="extraFiles" multiple>
        </label>
      </div>`;

  return `
  <details class="draft ${sent ? "is-sent" : ""}">
    <summary>
      <span class="chev">&#9654;</span>
      <span class="grow">
        <div class="title">${esc(d.jobTitle)}</div>
        <div class="sub">${esc(d.employer)}${
          d.applyLink ? ` &middot; <a href="${esc(d.applyLink)}" target="_blank" rel="noopener">view posting</a>` : ""
        }</div>
      </span>
      ${scoreBadge(d.score)}
      ${sent ? `<span class="badge sent">Sent</span>` : ""}
    </summary>
    <div class="body">
      <form method="POST" action="/drafts/send" enctype="multipart/form-data">
        <input type="hidden" name="jobId" value="${esc(d.jobId)}">

        <label>To
          <input type="email" name="to" value="${esc(d.sentTo || "")}" placeholder="recruiter@company.com" required>
        </label>
        <label>Subject
          <input type="text" name="subject" value="${esc(d.subject)}">
        </label>
        <label>Body
          <textarea name="body" rows="14">${esc(d.body)}</textarea>
        </label>

        ${attachBlock}

        <div class="actions">
          <button type="submit">${sent ? "Send again" : "Send application"}</button>
          <span class="hint">${
            sent ? `Already sent to ${esc(d.sentTo || "")}` : "Goes out through your own mail account."
          }</span>
        </div>
      </form>

      <form method="POST" action="/drafts/discard" style="margin-top:10px;">
        <input type="hidden" name="jobId" value="${esc(d.jobId)}">
        <button type="submit" class="danger btn-sm">Discard draft</button>
      </form>
    </div>
  </details>`;
}
