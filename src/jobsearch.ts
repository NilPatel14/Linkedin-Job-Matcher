import { Env, JobListing, Profile } from "./types";

const API_HOST = "jsearch.p.rapidapi.com";
// The old /search endpoint was retired and now 404s; /search-v2 replaces it.
// Same job fields, but the listings moved from `data` to `data.jobs`.
const API_PATH = "/search-v2";

/**
 * Queries the JSearch API (RapidAPI) once per desired title and merges/dedupes
 * results. JSearch aggregates postings from LinkedIn, Indeed, Glassdoor, etc.
 */
export async function fetchCandidateJobs(env: Env, profile: Profile): Promise<JobListing[]> {
  const titles = profile.titles.length ? profile.titles : ["Software Engineer"];
  const seen = new Map<string, JobListing>();
  let failures = 0;
  let lastError = "";

  for (const title of titles) {
    const location = profile.remoteOnly ? "" : profile.locations[0] || "";
    const query = [title, location].filter(Boolean).join(" in ");

    const url = new URL(`https://${API_HOST}${API_PATH}`);
    url.searchParams.set("query", query);
    url.searchParams.set("page", "1");
    url.searchParams.set("num_pages", "1");
    url.searchParams.set("date_posted", profile.datePosted);
    if (profile.country) url.searchParams.set("country", profile.country);
    if (profile.remoteOnly) url.searchParams.set("remote_jobs_only", "true");
    if (profile.employmentTypes.length) {
      url.searchParams.set("employment_types", profile.employmentTypes.join(","));
    }

    const res = await fetch(url.toString(), {
      headers: {
        "X-RapidAPI-Key": env.RAPIDAPI_KEY,
        "X-RapidAPI-Host": API_HOST,
      },
    });

    if (!res.ok) {
      lastError = `${res.status} ${await res.text()}`;
      console.error(`JSearch request failed for "${query}": ${lastError}`);
      failures++;
      continue;
    }

    const body = (await res.json()) as { data?: { jobs?: JobListing[] } };
    for (const job of body.data?.jobs || []) {
      if (job.job_id) seen.set(job.job_id, job);
    }
  }

  // Every query failing looks identical to "nothing matched" downstream, which
  // hides a broken key or endpoint behind a cheerful {"found":0}. Say so instead.
  if (failures === titles.length) {
    throw new Error(`All ${failures} JSearch request(s) failed. Last error: ${lastError}`);
  }

  return [...seen.values()];
}
