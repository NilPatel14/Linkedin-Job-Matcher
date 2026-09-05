import { Applicant, DEFAULT_APPLICANT, DEFAULT_PROFILE, Env, Profile } from "./types";

import { ns } from "./auth";

const profileKey = (userId: string) => ns(userId, "profile");

export async function getProfile(env: Env, userId: string): Promise<Profile> {
  const raw = await env.JOBS_KV.get(profileKey(userId));
  if (!raw) return DEFAULT_PROFILE;
  try {
    const stored = JSON.parse(raw) as Partial<Profile>;
    return {
      ...DEFAULT_PROFILE,
      ...stored,
      applicant: { ...DEFAULT_APPLICANT, ...(stored.applicant || {}) },
    };
  } catch {
    return DEFAULT_PROFILE;
  }
}

export async function saveProfile(env: Env, userId: string, profile: Profile): Promise<void> {
  await env.JOBS_KV.put(profileKey(userId), JSON.stringify(profile));
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function applicantFromFormData(form: FormData): Applicant {
  const str = (name: string) => String(form.get(name) || "").trim();
  return {
    fullName: str("fullName"),
    headline: str("headline"),
    pitch: str("pitch"),
    linkedinUrl: str("linkedinUrl"),
    portfolioUrl: str("portfolioUrl"),
    phone: str("phone"),
  };
}

/** Builds a Profile from an HTML form's FormData. */
export function profileFromFormData(form: FormData): Profile {
  const employmentTypes = form.getAll("employmentTypes").map(String) as Profile["employmentTypes"];
  return {
    applicant: applicantFromFormData(form),
    titles: splitList(String(form.get("titles") || "")),
    skills: splitList(String(form.get("skills") || "")),
    locations: splitList(String(form.get("locations") || "")),
    remoteOnly: form.get("remoteOnly") === "on",
    excludeKeywords: splitList(String(form.get("excludeKeywords") || "")),
    employmentTypes: employmentTypes.length ? employmentTypes : DEFAULT_PROFILE.employmentTypes,
    minScore: Number(form.get("minScore") || DEFAULT_PROFILE.minScore),
    datePosted: (String(form.get("datePosted") || DEFAULT_PROFILE.datePosted) as Profile["datePosted"]),
    country: String(form.get("country") || DEFAULT_PROFILE.country).trim().toLowerCase(),
  };
}
