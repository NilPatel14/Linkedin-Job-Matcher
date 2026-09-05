export interface Env {
  JOBS_KV: KVNamespace;
  /** Shared across all users — see the quota note in the README. */
  RAPIDAPI_KEY: string;
  /** Required to register. Rotate it to cut off new signups. */
  INVITE_CODE: string;
  /** Master secret that encrypts every user's SMTP password at rest. */
  ENCRYPTION_KEY: string;
  /** Optional: public URL of this Worker, so digest emails can link to the drafts page. */
  PUBLIC_URL?: string;
}

export interface User {
  id: string;
  email: string;
  /** PBKDF2-SHA256 derivation of the account password, base64. */
  passwordHash: string;
  salt: string;
  createdAt: string;
}

/**
 * A user's own outgoing mail account, so applications are sent from their
 * address rather than the instance owner's.
 */
export interface SmtpSettings {
  host: string;
  port: number;
  /** true = implicit TLS (465). false = STARTTLS (587). */
  secure: boolean;
  user: string;
  /** AES-GCM ciphertext. The app password is never stored in the clear. */
  passEncrypted: string;
  mailFrom: string;
  notifyEmail: string;
}

/** Your details, used to fill in application email drafts. */
export interface Applicant {
  fullName: string;
  /** One-line self description, e.g. "Frappe/ERPNext developer, 3 years experience" */
  headline: string;
  /** A short paragraph in your own words. Used verbatim — nothing is invented for you. */
  pitch: string;
  linkedinUrl: string;
  portfolioUrl: string;
  phone: string;
}

export const DEFAULT_APPLICANT: Applicant = {
  fullName: "",
  headline: "",
  pitch: "",
  linkedinUrl: "",
  portfolioUrl: "",
  phone: "",
};

export interface Profile {
  /** Desired job titles / role keywords, e.g. ["Frontend Developer", "React Engineer"] */
  titles: string[];
  /** Skills/keywords to look for in the job description, e.g. ["React", "TypeScript"] */
  skills: string[];
  /** Preferred locations, e.g. ["Ahmedabad", "Bengaluru"]. Ignored if remoteOnly is true. */
  locations: string[];
  /** Only match remote jobs */
  remoteOnly: boolean;
  /** Keywords that immediately disqualify a job if found in title/description */
  excludeKeywords: string[];
  /** Employment types to include */
  employmentTypes: ("FULLTIME" | "CONTRACTOR" | "PARTTIME" | "INTERN")[];
  /** Minimum match score (0-100) required to be included in the digest */
  minScore: number;
  /** How many days back to search */
  datePosted: "today" | "3days" | "week" | "month";
  /** Two-letter country code for the search, e.g. "in", "us". JSearch defaults to "us". */
  country: string;
  /** Your details for application drafts */
  applicant: Applicant;
}

export const DEFAULT_PROFILE: Profile = {
  titles: ["Software Engineer"],
  skills: [],
  locations: [],
  remoteOnly: false,
  excludeKeywords: [],
  employmentTypes: ["FULLTIME"],
  minScore: 50,
  datePosted: "week",
  country: "in",
  applicant: DEFAULT_APPLICANT,
};

export interface JobListing {
  job_id: string;
  job_title: string;
  employer_name: string;
  job_city?: string;
  job_country?: string;
  job_is_remote?: boolean;
  job_description?: string;
  job_apply_link?: string;
  job_posted_at_datetime_utc?: string;
  job_min_salary?: number;
  job_max_salary?: number;
  job_salary_currency?: string;
  job_employment_type?: string;
}

export interface MatchedJob {
  job: JobListing;
  score: number;
  reasons: string[];
}

/** A prepared application email, held for you to review, edit and send by hand. */
export interface Draft {
  jobId: string;
  jobTitle: string;
  employer: string;
  applyLink: string;
  /** Match score (0-100) recorded when the draft was created, shown in the UI. */
  score?: number;
  subject: string;
  body: string;
  createdAt: string;
  sentTo?: string;
  sentAt?: string;
}

/**
 * Describes the stored resume. Kept as KV metadata so the drafts page can show
 * the filename and size without pulling the whole file out of KV.
 */
export interface ResumeMeta {
  filename: string;
  contentType: string;
  size: number;
  uploadedAt: string;
}
