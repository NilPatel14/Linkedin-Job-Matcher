import { JobListing, MatchedJob, Profile } from "./types";

function includesCi(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/**
 * Scores a job 0-100 against the profile. Any exclude-keyword hit disqualifies
 * the job outright (score forced to 0) rather than just being penalized.
 */
export function scoreJob(job: JobListing, profile: Profile): MatchedJob {
  const text = `${job.job_title} ${job.job_description || ""}`;
  const reasons: string[] = [];

  for (const bad of profile.excludeKeywords) {
    if (bad && includesCi(text, bad)) {
      return { job, score: 0, reasons: [`excluded: matched "${bad}"`] };
    }
  }

  let points = 0;
  let maxPoints = 0;

  // Title match — heaviest weight.
  maxPoints += 40;
  const titleHit = profile.titles.some((t) => includesCi(job.job_title, t));
  if (titleHit) {
    points += 40;
    reasons.push("title matches a desired role");
  }

  // Skill matches.
  if (profile.skills.length) {
    maxPoints += 40;
    const matchedSkills = profile.skills.filter((s) => includesCi(text, s));
    if (matchedSkills.length) {
      points += Math.min(40, (matchedSkills.length / profile.skills.length) * 40);
      reasons.push(`skills matched: ${matchedSkills.join(", ")}`);
    }
  }

  // Location / remote.
  maxPoints += 20;
  if (profile.remoteOnly) {
    if (job.job_is_remote) {
      points += 20;
      reasons.push("remote");
    }
  } else if (profile.locations.length) {
    const locText = `${job.job_city || ""} ${job.job_country || ""}`;
    const locHit = profile.locations.some((l) => includesCi(locText, l)) || job.job_is_remote;
    if (locHit) {
      points += 20;
      reasons.push("location matches");
    }
  } else {
    points += 20; // no location preference set
  }

  const score = maxPoints === 0 ? 0 : Math.round((points / maxPoints) * 100);
  return { job, score, reasons };
}

export function matchJobs(jobs: JobListing[], profile: Profile): MatchedJob[] {
  return jobs
    .map((job) => scoreJob(job, profile))
    .filter((m) => m.score >= profile.minScore)
    .sort((a, b) => b.score - a.score);
}
