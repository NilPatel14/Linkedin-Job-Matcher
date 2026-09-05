import { Env } from "./types";
import { ns } from "./auth";

const LEGACY_PROFILE = "profile";
const LEGACY_RESUME = "resume:file";
const CLAIMED = "legacy:claimed";

/**
 * Before accounts existed this was a single-user tool, with one profile at
 * "profile" and one resume at "resume:file". The first account created after
 * the upgrade adopts them, so the original owner doesn't have to retype
 * everything. Runs once — after that the marker key short-circuits it.
 */
export async function claimLegacyData(env: Env, userId: string): Promise<boolean> {
  if (await env.JOBS_KV.get(CLAIMED)) return false;

  const profile = await env.JOBS_KV.get(LEGACY_PROFILE);
  if (profile) await env.JOBS_KV.put(ns(userId, "profile"), profile);

  const resume = await env.JOBS_KV.getWithMetadata(LEGACY_RESUME, { type: "arrayBuffer" });
  if (resume.value && resume.metadata) {
    await env.JOBS_KV.put(ns(userId, "resume"), resume.value, { metadata: resume.metadata });
  }

  await env.JOBS_KV.put(CLAIMED, userId);
  return !!profile;
}
