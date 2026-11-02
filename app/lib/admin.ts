/**
 * Default fallback admin email if ADMIN_EMAILS environment variable is unset.
 */
export const DEFAULT_ADMIN_EMAIL = "mayureshsharma542@gmail.com";

/**
 * Get all authorized admin emails from the ADMIN_EMAILS environment variable
 * or the default fallback. Case-insensitive list.
 */
export function getAdminEmails(): string[] {
  const envVal = process.env.ADMIN_EMAILS || "";
  const emails = envVal
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (emails.length === 0) {
    emails.push(DEFAULT_ADMIN_EMAIL.toLowerCase());
  }

  return Array.from(new Set(emails));
}

/**
 * Strict case-insensitive check whether an email belongs to an authorized admin.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  const allowlist = getAdminEmails();
  return allowlist.includes(normalized);
}
