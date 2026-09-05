import { MatchedJob } from "./types";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function formatSalary(m: MatchedJob): string {
  const { job_min_salary, job_max_salary, job_salary_currency } = m.job;
  if (!job_min_salary && !job_max_salary) return "";
  const cur = job_salary_currency ? `${job_salary_currency} ` : "";
  if (job_min_salary && job_max_salary) {
    return `${cur}${job_min_salary.toLocaleString()} - ${job_max_salary.toLocaleString()}`;
  }
  return `${cur}${(job_min_salary || job_max_salary)!.toLocaleString()}`;
}

export function buildDigestHtml(matches: MatchedJob[], publicUrl?: string): string {
  const rows = matches
    .map((m) => {
      const location = m.job.job_is_remote
        ? "Remote"
        : [m.job.job_city, m.job.job_country].filter(Boolean).join(", ") || "—";
      const salary = formatSalary(m);
      return `
        <tr>
          <td style="padding:10px;border-bottom:1px solid #e5e5e5;">
            <a href="${escapeHtml(m.job.job_apply_link || "#")}" style="font-weight:600;color:#0a66c2;text-decoration:none;">
              ${escapeHtml(m.job.job_title)}
            </a>
            <div style="color:#555;font-size:13px;">${escapeHtml(m.job.employer_name)} &middot; ${escapeHtml(location)}</div>
            ${salary ? `<div style="color:#555;font-size:13px;">${escapeHtml(salary)}</div>` : ""}
            <div style="color:#888;font-size:12px;margin-top:4px;">Match ${m.score}% &mdash; ${escapeHtml(m.reasons.join("; "))}</div>
          </td>
        </tr>`;
    })
    .join("");

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;">
      <h2 style="color:#111;">${matches.length} new job match${matches.length === 1 ? "" : "es"}</h2>
      <table style="width:100%;border-collapse:collapse;">${rows}</table>
      ${
        publicUrl
          ? `<p style="margin-top:20px;">
               <a href="${escapeHtml(publicUrl.replace(/\/$/, ""))}/drafts" style="color:#0a66c2;">
                 Review application drafts
               </a>
             </p>`
          : ""
      }
      <p style="color:#999;font-size:12px;margin-top:20px;">Sent by your LinkedIn Job Matcher.</p>
    </div>`;
}
