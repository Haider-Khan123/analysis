// Shared input validators (client + server safe).
export const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
export const BRANCH_MAX = 20;
export const BRANCH_REGEX = /^[A-Za-z0-9]{1,20}$/;
// ITU-T E.164: no country uses more than 15 digits (incl. country code).
export const PHONE_MIN_DIGITS = 7;
export const PHONE_MAX_DIGITS = 15;
export const PHONE_ALLOWED = /^\+?[0-9\s\-()]+$/;

export function emailError(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  return EMAIL_REGEX.test(s) ? null : "Please enter a valid email address (e.g., name@example.com).";
}

export function branchError(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  if (s.length > BRANCH_MAX) return `Branch Code must not exceed ${BRANCH_MAX} characters.`;
  if (!BRANCH_REGEX.test(s)) return "Branch Code can only contain letters and numbers (no spaces or symbols).";
  return null;
}

export function phoneError(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  if (!PHONE_ALLOWED.test(s)) return "Phone number can only contain digits, spaces, +, - and brackets.";
  const digits = s.replace(/\D/g, "").length;
  if (digits < PHONE_MIN_DIGITS) return `Phone number must contain at least ${PHONE_MIN_DIGITS} digits.`;
  if (digits > PHONE_MAX_DIGITS) return `Phone number must not exceed ${PHONE_MAX_DIGITS} digits.`;
  return null;
}

/** Strip disallowed characters while typing and cap to the max digit count. */
export function sanitizePhone(v: string): string {
  let out = "";
  let digits = 0;
  for (const [i, ch] of [...v].entries()) {
    if (/[0-9]/.test(ch)) {
      if (digits >= PHONE_MAX_DIGITS) continue;
      digits++;
      out += ch;
    } else if (ch === "+" && i === 0) out += ch;
    else if (/[\s\-()]/.test(ch)) out += ch;
  }
  return out.slice(0, 25);
}

export function sanitizeBranch(v: string): string {
  return v.replace(/[^A-Za-z0-9]/g, "").slice(0, BRANCH_MAX);
}

// Date of birth: must not be in the future (or unreasonably far in the past).
export const DOB_MIN_YEAR = 1900;

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function dobError(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  if (s > todayStr()) return "Date of birth cannot be in the future.";
  if (s < `${DOB_MIN_YEAR}-01-01`) return `Date of birth cannot be before ${DOB_MIN_YEAR}.`;
  return null;
}

// CNIC / National ID: 13 digits shown as *****-*******-* (5-7-1), max 15 characters.
export const CNIC_MAX = 15;
export const CNIC_REGEX = /^[0-9]{5}-[0-9]{7}-[0-9]$/;
export const CNIC_ALLOWED = /^[0-9-]+$/;

export function cnicError(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  if (s.length > CNIC_MAX) return `CNIC / National ID must not exceed ${CNIC_MAX} characters.`;
  if (!CNIC_ALLOWED.test(s)) return "CNIC / National ID can only contain digits and dashes (-).";
  if (!CNIC_REGEX.test(s)) return "Enter a valid CNIC / National ID in the format *****-*******-* (13 digits).";
  return null;
}
