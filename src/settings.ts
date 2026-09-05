import { Env, SmtpSettings } from "./types";
import { ns } from "./auth";
import { decryptSecret, encryptSecret } from "./crypto";
import { SmtpConfig } from "./smtp";

const key = (userId: string) => ns(userId, "smtp");

export async function getSmtpSettings(env: Env, userId: string): Promise<SmtpSettings | null> {
  const raw = await env.JOBS_KV.get(key(userId));
  return raw ? (JSON.parse(raw) as SmtpSettings) : null;
}

export async function saveSmtpSettings(env: Env, userId: string, s: SmtpSettings): Promise<void> {
  await env.JOBS_KV.put(key(userId), JSON.stringify(s));
}

export async function deleteSmtpSettings(env: Env, userId: string): Promise<void> {
  await env.JOBS_KV.delete(key(userId));
}

/**
 * Builds settings from the form. A blank password field means "leave the stored
 * one alone", so editing the host doesn't force the user to retype their
 * app password (which they cannot read back off the page).
 */
export async function settingsFromForm(
  env: Env,
  form: FormData,
  existing: SmtpSettings | null
): Promise<SmtpSettings> {
  const str = (name: string) => String(form.get(name) || "").trim();
  const password = String(form.get("pass") || "");

  let passEncrypted = existing?.passEncrypted || "";
  if (password) passEncrypted = await encryptSecret(env.ENCRYPTION_KEY, password);

  return {
    host: str("host"),
    port: Number(form.get("port") || 587),
    secure: form.get("secure") === "on",
    user: str("user"),
    passEncrypted,
    mailFrom: str("mailFrom") || str("user"),
    notifyEmail: str("notifyEmail") || str("user"),
  };
}

/** Decrypts the stored password into a config the SMTP client can use. */
export async function toSmtpConfig(env: Env, s: SmtpSettings): Promise<SmtpConfig> {
  return {
    host: s.host,
    port: s.port,
    secure: s.secure,
    user: s.user,
    pass: await decryptSecret(env.ENCRYPTION_KEY, s.passEncrypted),
  };
}

export function isConfigured(s: SmtpSettings | null): s is SmtpSettings {
  return !!s && !!s.host && !!s.user && !!s.passEncrypted && !!s.mailFrom;
}
