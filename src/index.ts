import { Env, MatchedJob, User } from "./types";
import { getProfile, profileFromFormData, saveProfile } from "./profile";
import { fetchCandidateJobs } from "./jobsearch";
import { matchJobs } from "./match";
import { filterUnseen, markSeen } from "./seen";
import { buildDigestHtml } from "./digest";
import { Attachment, sendMail } from "./smtp";
import { buildDraft } from "./draft";
import { countDrafts, deleteDraft, getDraft, listDrafts, saveDraft } from "./drafts-store";
import { deleteResume, getResume, getResumeMeta, MAX_RESUME_BYTES, saveResume, formatBytes } from "./resume";
import {
  clearedCookie,
  createSession,
  createUser,
  currentUser,
  destroySession,
  findUserByEmail,
  listUsers,
  verifyLogin,
  sessionCookie,
} from "./auth";
import {
  deleteSmtpSettings,
  getSmtpSettings,
  isConfigured,
  saveSmtpSettings,
  settingsFromForm,
  toSmtpConfig,
} from "./settings";
import { safeEqual } from "./crypto";
import { claimLegacyData } from "./migrate";
import {
  renderDraftsPage,
  renderLogin,
  renderProfileForm,
  renderSettings,
  renderSignup,
} from "./ui";

/** Passwords are stretched in the browser, so a JS-less client cannot sign in. */
const JS_REQUIRED = "JavaScript must be enabled to sign in — passwords are secured in your browser before being sent.";

/** Total attachment bytes per email, before base64 expansion. */
const MAX_ATTACHMENT_TOTAL = 10 * 1024 * 1024;

function html(body: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html;charset=UTF-8", ...headers },
  });
}

/** Post-redirect-get, so a refresh never resubmits a send or a profile save. */
function redirectTo(path: string, msg: { ok?: string; err?: string } = {}, headers: Record<string, string> = {}): Response {
  const qs = new URLSearchParams();
  if (msg.ok) qs.set("ok", msg.ok);
  if (msg.err) qs.set("err", msg.err);
  const query = qs.toString();
  return new Response(null, {
    status: 303,
    headers: { Location: query ? `${path}?${query}` : path, ...headers },
  });
}

/**
 * workers-types declares FormData as string-only, but the runtime does hand back
 * File objects for file inputs. Narrow through unknown at that boundary.
 */
function asFile(value: unknown): File | null {
  return value && typeof value === "object" && "arrayBuffer" in value ? (value as File) : null;
}

/** Runs one user's search and mails them a digest through their own account. */
async function runSearchAndNotify(
  env: Env,
  user: User
): Promise<{ found: number; notified: number }> {
  const profile = await getProfile(env, user.id);
  const jobs = await fetchCandidateJobs(env, profile);
  const matches = matchJobs(jobs, profile);
  const unseen: MatchedJob[] = await filterUnseen(env, user.id, matches);

  if (unseen.length > 0) {
    // Prepare a draft per match up front, so the digest can link straight to them.
    await Promise.all(unseen.map((m) => saveDraft(env, user.id, buildDraft(m, profile))));

    const settings = await getSmtpSettings(env, user.id);
    if (isConfigured(settings)) {
      await sendMail(await toSmtpConfig(env, settings), {
        from: settings.mailFrom,
        to: settings.notifyEmail,
        subject: `${unseen.length} new job match${unseen.length === 1 ? "" : "es"}`,
        body: buildDigestHtml(unseen, env.PUBLIC_URL),
      });
      await markSeen(env, user.id, unseen);
    }
    // With no mail account configured the drafts still land; leaving them
    // unseen means the digest goes out once the user sets mail up.
  }

  return { found: matches.length, notified: unseen.length };
}

/** Collects the resume (if ticked) plus any one-off files added to this draft. */
async function collectAttachments(env: Env, userId: string, form: FormData): Promise<Attachment[]> {
  const attachments: Attachment[] = [];

  if (form.get("attachResume") === "on") {
    const stored = await getResume(env, userId);
    if (stored) {
      attachments.push({
        filename: stored.meta.filename,
        contentType: stored.meta.contentType,
        content: stored.bytes,
      });
    }
  }

  for (const entry of form.getAll("extraFiles")) {
    const file = asFile(entry);
    if (!file || file.size === 0) continue;
    attachments.push({
      filename: file.name,
      contentType: file.type || "application/octet-stream",
      content: new Uint8Array(await file.arrayBuffer()),
    });
  }

  const total = attachments.reduce((sum, a) => sum + a.content.byteLength, 0);
  if (total > MAX_ATTACHMENT_TOTAL) {
    throw new Error(
      `Attachments total ${formatBytes(total)}, over the ${formatBytes(MAX_ATTACHMENT_TOTAL)} limit.`
    );
  }
  return attachments;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const ok = url.searchParams.get("ok") || undefined;
    const err = url.searchParams.get("err") || undefined;

    // ---------------------------------------------------------------- public
    if (path === "/login") {
      if (req.method === "GET") {
        if (await currentUser(env, req)) return redirectTo("/profile");
        return html(renderLogin({ error: err, notice: ok }));
      }
      if (req.method === "POST") {
        const form = await req.formData();
        const email = String(form.get("email") || "");
        const derivedKey = String(form.get("derivedKey") || "");
        if (!derivedKey) {
          return html(renderLogin({ error: JS_REQUIRED, email }), 400);
        }
        const user = await verifyLogin(env, email, derivedKey);
        if (!user) {
          return html(renderLogin({ error: "Wrong email or password.", email }), 401);
        }
        const token = await createSession(env, user.id);
        return redirectTo("/profile", {}, { "Set-Cookie": sessionCookie(token, url) });
      }
    }

    if (path === "/signup") {
      if (req.method === "GET") {
        if (await currentUser(env, req)) return redirectTo("/profile");
        return html(renderSignup({ error: err }));
      }
      if (req.method === "POST") {
        const form = await req.formData();
        const email = String(form.get("email") || "").trim();
        const derivedKey = String(form.get("derivedKey") || "");
        const invite = String(form.get("inviteCode") || "");

        if (!env.INVITE_CODE || !safeEqual(invite, env.INVITE_CODE)) {
          return html(renderSignup({ error: "That invite code isn't valid.", email }), 403);
        }
        if (!derivedKey) {
          return html(renderSignup({ error: JS_REQUIRED, email }), 400);
        }
        if (await findUserByEmail(env, email)) {
          return html(renderSignup({ error: "That email is already registered.", email }), 409);
        }

        const user = await createUser(env, email, derivedKey);
        const adopted = await claimLegacyData(env, user.id);
        const token = await createSession(env, user.id);
        return redirectTo(
          "/settings",
          {
            ok: adopted
              ? "Account created, and your existing profile was carried over. Add your mail account to start sending."
              : "Account created. Add your mail account to start sending.",
          },
          { "Set-Cookie": sessionCookie(token, url) }
        );
      }
    }

    if (path === "/logout" && req.method === "POST") {
      await destroySession(env, req);
      return redirectTo("/login", {}, { "Set-Cookie": clearedCookie(url) });
    }

    // --------------------------------------------------------------- private
    const user = await currentUser(env, req);
    if (!user) {
      if (path === "/" || path === "/login") return redirectTo("/login");
      // An API-style call deserves a status code, not a login page.
      if (path === "/run" && url.searchParams.get("ui") !== "1") {
        return new Response("Unauthorized", { status: 401 });
      }
      return redirectTo("/login");
    }

    if (path === "/") return redirectTo("/profile");

    if (path === "/profile") {
      if (req.method === "GET") {
        const [profile, resume, draftCount, settings] = await Promise.all([
          getProfile(env, user.id),
          getResumeMeta(env, user.id),
          countDrafts(env, user.id),
          getSmtpSettings(env, user.id),
        ]);
        return html(
          renderProfileForm(user, profile, {
            resume,
            draftCount,
            savedMessage: ok,
            error: err,
            smtpConfigured: isConfigured(settings),
          })
        );
      }
      if (req.method === "POST") {
        const form = await req.formData();
        await saveProfile(env, user.id, profileFromFormData(form));
        return redirectTo("/profile", { ok: "Profile saved." });
      }
    }

    if (path === "/settings") {
      if (req.method === "GET") {
        const [settings, draftCount] = await Promise.all([
          getSmtpSettings(env, user.id),
          countDrafts(env, user.id),
        ]);
        return html(renderSettings(user, settings, { savedMessage: ok, error: err, draftCount }));
      }
      if (req.method === "POST") {
        const form = await req.formData();
        const existing = await getSmtpSettings(env, user.id);
        const next = await settingsFromForm(env, form, existing);
        if (!next.passEncrypted) {
          return redirectTo("/settings", { err: "An app password is required." });
        }
        await saveSmtpSettings(env, user.id, next);
        return redirectTo("/settings", { ok: "Mail settings saved. Try a test email." });
      }
    }

    if (path === "/settings/delete" && req.method === "POST") {
      await deleteSmtpSettings(env, user.id);
      return redirectTo("/settings", { ok: "Mail settings removed." });
    }

    if (path === "/profile/resume" && req.method === "POST") {
      const form = await req.formData();
      const file = asFile(form.get("resume"));
      if (!file || file.size === 0) {
        return redirectTo("/profile", { err: "Choose a file to upload first." });
      }
      if (file.size > MAX_RESUME_BYTES) {
        return redirectTo("/profile", {
          err: `That file is ${formatBytes(file.size)} — the limit is ${formatBytes(MAX_RESUME_BYTES)}.`,
        });
      }
      const meta = await saveResume(env, user.id, file);
      return redirectTo("/profile", { ok: `Resume saved: ${meta.filename}` });
    }

    if (path === "/profile/resume/delete" && req.method === "POST") {
      await deleteResume(env, user.id);
      return redirectTo("/profile", { ok: "Resume removed." });
    }

    if (path === "/resume" && req.method === "GET") {
      const stored = await getResume(env, user.id);
      if (!stored) return new Response("No resume stored.", { status: 404 });
      return new Response(stored.bytes, {
        headers: {
          "content-type": stored.meta.contentType,
          "content-disposition": `inline; filename="${stored.meta.filename.replace(/["\r\n]/g, "")}"`,
        },
      });
    }

    if (path === "/drafts" && req.method === "GET") {
      const [drafts, resume, settings] = await Promise.all([
        listDrafts(env, user.id),
        getResumeMeta(env, user.id),
        getSmtpSettings(env, user.id),
      ]);
      return html(
        renderDraftsPage(user, drafts, {
          resume,
          savedMessage: ok,
          error: err,
          smtpConfigured: isConfigured(settings),
        })
      );
    }

    if (path === "/drafts/send" && req.method === "POST") {
      const form = await req.formData();
      const jobId = String(form.get("jobId") || "");
      const to = String(form.get("to") || "").trim();
      const subject = String(form.get("subject") || "");
      const body = String(form.get("body") || "");

      const settings = await getSmtpSettings(env, user.id);
      if (!isConfigured(settings)) {
        return redirectTo("/drafts", { err: "Set up your mail account first, under Mail setup." });
      }

      const draft = await getDraft(env, user.id, jobId);
      if (!draft) return redirectTo("/drafts", { err: "Draft no longer exists." });
      if (!to) return redirectTo("/drafts", { err: "Enter a recipient address first." });

      // Persist the edits before attempting delivery, so a failed send never
      // costs you the text you just wrote.
      await saveDraft(env, user.id, { ...draft, subject, body });

      let attachments: Attachment[];
      try {
        attachments = await collectAttachments(env, user.id, form);
      } catch (e) {
        return redirectTo("/drafts", { err: (e as Error).message });
      }

      try {
        await sendMail(await toSmtpConfig(env, settings), {
          from: settings.mailFrom,
          to,
          subject,
          body,
          contentType: "text/plain",
          attachments,
        });
      } catch (e) {
        return redirectTo("/drafts", { err: `Send failed: ${(e as Error).message}` });
      }

      await saveDraft(env, user.id, {
        ...draft,
        subject,
        body,
        sentTo: to,
        sentAt: new Date().toISOString(),
      });
      const withFiles = attachments.length
        ? ` with ${attachments.length} attachment${attachments.length === 1 ? "" : "s"}`
        : "";
      return redirectTo("/drafts", { ok: `Sent to ${to}${withFiles}.` });
    }

    if (path === "/drafts/discard" && req.method === "POST") {
      const form = await req.formData();
      await deleteDraft(env, user.id, String(form.get("jobId") || ""));
      return redirectTo("/drafts", { ok: "Draft discarded." });
    }

    // Verifies mail settings on their own, without needing a job search to
    // return results first. Sends a sample digest to the user's own address.
    if (path === "/test-email") {
      const fromUi = url.searchParams.get("ui") === "1";
      const settings = await getSmtpSettings(env, user.id);
      if (!isConfigured(settings)) {
        const message = "No mail account set up yet.";
        return fromUi ? redirectTo("/settings", { err: message }) : new Response(message, { status: 400 });
      }
      const sample: MatchedJob[] = [
        {
          score: 92,
          reasons: ["this is a test email — the job below is not real"],
          job: {
            job_id: "test",
            job_title: "Sample Job Title",
            employer_name: "Sample Company",
            job_city: "Ahmedabad",
            job_country: "IN",
            job_apply_link: "https://example.com",
          },
        },
      ];
      try {
        await sendMail(await toSmtpConfig(env, settings), {
          from: settings.mailFrom,
          to: settings.notifyEmail,
          subject: "RoleCall test email",
          body: buildDigestHtml(sample, env.PUBLIC_URL),
        });
      } catch (e) {
        const message = `SMTP failed: ${(e as Error).message}`;
        return fromUi ? redirectTo("/settings", { err: message }) : new Response(message, { status: 502 });
      }
      const done = `Test email sent to ${settings.notifyEmail}. Check your inbox (and spam).`;
      return fromUi ? redirectTo("/settings", { ok: done }) : new Response(done);
    }

    if (path === "/run") {
      const fromUi = url.searchParams.get("ui") === "1";
      try {
        const result = await runSearchAndNotify(env, user);
        if (!fromUi) {
          return new Response(JSON.stringify(result), {
            headers: { "content-type": "application/json" },
          });
        }
        return redirectTo("/drafts", {
          ok: `Search done — ${result.found} match${result.found === 1 ? "" : "es"}, ${result.notified} new.`,
        });
      } catch (e) {
        const message = `Run failed: ${(e as Error).message}`;
        // Drafts are saved before the digest goes out, so a mail failure here
        // still leaves the new matches waiting on the drafts page.
        return fromUi ? redirectTo("/drafts", { err: message }) : new Response(message, { status: 500 });
      }
    }

    return new Response("Not found", { status: 404 });
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    const users = await listUsers(env);
    console.log(`Scheduled run for ${users.length} user(s).`);

    // One user's failure (bad credentials, quota, whatever) must not stop the rest.
    for (const user of users) {
      try {
        const result = await runSearchAndNotify(env, user);
        console.log(`  ${user.email}: ${result.found} matches, ${result.notified} new.`);
      } catch (err) {
        console.error(`  ${user.email}: failed —`, (err as Error).message);
      }
    }
  },
};
