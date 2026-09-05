import { Env, MatchedJob } from "./types";
import { ns } from "./auth";

const TTL_SECONDS = 30 * 24 * 60 * 60; // stop tracking a job id after 30 days

function key(userId: string, jobId: string): string {
  return ns(userId, `seen:${jobId}`);
}

/** Returns only the matches that have never been included in this user's digest. */
export async function filterUnseen(
  env: Env,
  userId: string,
  matches: MatchedJob[]
): Promise<MatchedJob[]> {
  const flags = await Promise.all(matches.map((m) => env.JOBS_KV.get(key(userId, m.job.job_id))));
  return matches.filter((_, i) => flags[i] === null);
}

/** Called only after a digest is successfully sent, so a failed send retries next run. */
export async function markSeen(env: Env, userId: string, matches: MatchedJob[]): Promise<void> {
  await Promise.all(
    matches.map((m) =>
      env.JOBS_KV.put(key(userId, m.job.job_id), "1", { expirationTtl: TTL_SECONDS })
    )
  );
}
