import { Env, ResumeMeta } from "./types";
import { ns } from "./auth";

const key = (userId: string) => ns(userId, "resume");

/** Cap uploads well under the KV value limit, and under what mail servers accept. */
export const MAX_RESUME_BYTES = 5 * 1024 * 1024;

export async function saveResume(env: Env, userId: string, file: File): Promise<ResumeMeta> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const meta: ResumeMeta = {
    filename: file.name || "resume",
    contentType: file.type || "application/octet-stream",
    size: bytes.byteLength,
    uploadedAt: new Date().toISOString(),
  };
  await env.JOBS_KV.put(key(userId), bytes, { metadata: meta });
  return meta;
}

/** Full file - only needed when actually attaching it to an outgoing email. */
export async function getResume(
  env: Env,
  userId: string
): Promise<{ meta: ResumeMeta; bytes: Uint8Array } | null> {
  const res = await env.JOBS_KV.getWithMetadata<ResumeMeta>(key(userId), { type: "arrayBuffer" });
  if (!res.value || !res.metadata) return null;
  return { meta: res.metadata, bytes: new Uint8Array(res.value) };
}

/** Filename/size only, via the key listing - avoids reading the file body. */
export async function getResumeMeta(env: Env, userId: string): Promise<ResumeMeta | null> {
  const k = key(userId);
  const listed = await env.JOBS_KV.list<ResumeMeta>({ prefix: k });
  const entry = listed.keys.find((e) => e.name === k);
  return entry?.metadata ?? null;
}

export async function deleteResume(env: Env, userId: string): Promise<void> {
  await env.JOBS_KV.delete(key(userId));
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
