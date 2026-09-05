import { Env, User } from "./types";
import { hashPassword, randomToken, safeEqual } from "./crypto";

const SESSION_TTL = 30 * 24 * 60 * 60;
const COOKIE = "jm_session";

const userKey = (id: string) => `user:${id}`;
const emailKey = (email: string) => `email:${email.trim().toLowerCase()}`;
const sessionKey = (token: string) => `session:${token}`;

/** Per-user key prefix. Every piece of user data hangs off this. */
export const ns = (userId: string, suffix: string) => `u:${userId}:${suffix}`;

export async function getUser(env: Env, id: string): Promise<User | null> {
  const raw = await env.JOBS_KV.get(userKey(id));
  return raw ? (JSON.parse(raw) as User) : null;
}

export async function findUserByEmail(env: Env, email: string): Promise<User | null> {
  const id = await env.JOBS_KV.get(emailKey(email));
  return id ? getUser(env, id) : null;
}

/** Every registered user — the cron walks this to run each person's search. */
export async function listUsers(env: Env): Promise<User[]> {
  const listed = await env.JOBS_KV.list({ prefix: "user:" });
  const raw = await Promise.all(listed.keys.map((k) => env.JOBS_KV.get(k.name)));
  return raw.filter((r): r is string => r !== null).map((r) => JSON.parse(r) as User);
}

export async function createUser(env: Env, email: string, password: string): Promise<User> {
  const normalized = email.trim().toLowerCase();
  const { hash, salt } = await hashPassword(password);
  const user: User = {
    id: crypto.randomUUID(),
    email: normalized,
    passwordHash: hash,
    salt,
    createdAt: new Date().toISOString(),
  };
  await env.JOBS_KV.put(userKey(user.id), JSON.stringify(user));
  await env.JOBS_KV.put(emailKey(normalized), user.id);
  return user;
}

/** 16 zero bytes, base64 — see verifyLogin. */
const DUMMY_SALT = "AAAAAAAAAAAAAAAAAAAAAA==";

export async function verifyLogin(env: Env, email: string, password: string): Promise<User | null> {
  const user = await findUserByEmail(env, email);
  // Derive even when the account doesn't exist, so an unknown email costs the
  // same time as a wrong password and can't be told apart from one.
  const { hash } = await hashPassword(password, user?.salt ?? DUMMY_SALT);
  if (!user) return null;
  return safeEqual(hash, user.passwordHash) ? user : null;
}

export async function createSession(env: Env, userId: string): Promise<string> {
  const token = randomToken();
  await env.JOBS_KV.put(sessionKey(token), userId, { expirationTtl: SESSION_TTL });
  return token;
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}

/** Resolves the signed-in user, or null. Every gated route starts here. */
export async function currentUser(env: Env, req: Request): Promise<User | null> {
  const token = readCookie(req, COOKIE);
  if (!token) return null;
  const userId = await env.JOBS_KV.get(sessionKey(token));
  return userId ? getUser(env, userId) : null;
}

export async function destroySession(env: Env, req: Request): Promise<void> {
  const token = readCookie(req, COOKIE);
  if (token) await env.JOBS_KV.delete(sessionKey(token));
}

/**
 * Secure is omitted on plain http so the cookie still works on
 * http://127.0.0.1:8787 during local development.
 */
export function sessionCookie(token: string, url: URL): string {
  const secure = url.protocol === "https:" ? " Secure;" : "";
  return `${COOKIE}=${token}; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=${SESSION_TTL}`;
}

export function clearedCookie(url: URL): string {
  const secure = url.protocol === "https:" ? " Secure;" : "";
  return `${COOKIE}=; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=0`;
}
