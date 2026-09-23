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
