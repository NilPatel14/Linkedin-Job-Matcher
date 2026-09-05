import { Draft, MatchedJob, Profile } from "./types";

/**
 * Builds an application email draft from a match.
 *
 * Deliberately template-based rather than LLM-generated: every claim in the
 * email comes from text you wrote in your own profile, so it can't invent
 * experience or credentials you don't have.
 */
export function buildDraft(match: MatchedJob, profile: Profile): Draft {
  const { job } = match;
  const a = profile.applicant;

  // Skills the profile claims AND the listing mentions — never invents skills.
  const text = `${job.job_title} ${job.job_description || ""}`.toLowerCase();
  const overlap = profile.skills.filter((s) => text.includes(s.toLowerCase()));

  const paragraphs: string[] = [];
  paragraphs.push(`Hi ${job.employer_name} team,`);
  paragraphs.push(
    `I came across your ${job.job_title} opening and would like to put myself forward for it.`
  );
  if (a.headline) paragraphs.push(a.headline);
  if (overlap.length) {
    paragraphs.push(
      `The role lines up closely with my background — particularly ${listToProse(overlap)}.`
    );
  }
  if (a.pitch) paragraphs.push(a.pitch);

  const links: string[] = [];
  if (a.linkedinUrl) links.push(`LinkedIn: ${a.linkedinUrl}`);
  if (a.portfolioUrl) links.push(`Portfolio: ${a.portfolioUrl}`);
  if (links.length) paragraphs.push(links.join("\n"));

  paragraphs.push("I'd be glad to share more detail or walk through my work whenever suits you.");

  const signoff = ["Thanks for your time,", a.fullName || "", a.phone || ""].filter(Boolean).join("\n");
  paragraphs.push(signoff);

  return {
    jobId: job.job_id,
    jobTitle: job.job_title,
    employer: job.employer_name,
    applyLink: job.job_apply_link || "",
    score: match.score,
    subject: `Application for ${job.job_title}${a.fullName ? ` — ${a.fullName}` : ""}`,
    body: paragraphs.join("\n\n"),
    createdAt: new Date().toISOString(),
  };
}

function listToProse(items: string[]): string {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
