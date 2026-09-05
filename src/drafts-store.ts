import { Draft, Env } from "./types";
import { ns } from "./auth";

const TTL_SECONDS = 30 * 24 * 60 * 60;

const prefix = (userId: string) => ns(userId, "draft:");

function key(userId: string, jobId: string): string {
  return `${prefix(userId)}${jobId}`;
}

export async function saveDraft(env: Env, userId: string, draft: Draft): Promise<void> {
  await env.JOBS_KV.put(key(userId, draft.jobId), JSON.stringify(draft), {
    expirationTtl: TTL_SECONDS,
  });
}

export async function getDraft(env: Env, userId: string, jobId: string): Promise<Draft | null> {
  const raw = await env.JOBS_KV.get(key(userId, jobId));
  return raw ? (JSON.parse(raw) as Draft) : null;
}

export async function listDrafts(env: Env, userId: string): Promise<Draft[]> {
  const listed = await env.JOBS_KV.list({ prefix: prefix(userId) });
  const drafts = await Promise.all(listed.keys.map((k) => env.JOBS_KV.get(k.name)));
  return drafts
    .filter((d): d is string => d !== null)
    .map((d) => JSON.parse(d) as Draft)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteDraft(env: Env, userId: string, jobId: string): Promise<void> {
  await env.JOBS_KV.delete(key(userId, jobId));
}

/** Count only, via the key listing - avoids fetching every draft body. */
export async function countDrafts(env: Env, userId: string): Promise<number> {
  const listed = await env.JOBS_KV.list({ prefix: prefix(userId) });
  return listed.keys.length;
}
