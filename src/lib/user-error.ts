type ValidationIssue = {
  code?: string;
  message?: string;
  path?: Array<string | number>;
  maximum?: number;
  minimum?: number;
  validation?: string;
};

const FIELD_LABELS: Record<string, string> = {
  schoolName: "Institution Name",
  name: "Name",
  branch: "Branch Name/Code",
  phone: "Institution Phone",
  logoDataUrl: "Institute Logo",
  fullName: "Full Name",
  first_name: "First Name",
  last_name: "Last Name",
  employee_id: "Employee ID",
  date_of_birth: "Date of Birth",
  joining_date: "Joining Date",
  cnic: "CNIC/National ID",
  classId: "Class",
  sectionId: "Section",
  studentId: "Student",
  recordDate: "Date",
};

function fieldLabel(path: ValidationIssue["path"]): string {
  const raw = String(path?.at(-1) ?? "This field");
  if (FIELD_LABELS[raw]) return FIELD_LABELS[raw];
  return raw
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function validationMessage(issue: ValidationIssue): string | null {
  const label = fieldLabel(issue.path);

  if (issue.code === "too_big" && typeof issue.maximum === "number") {
    return `${label} must not exceed ${issue.maximum} characters.`;
  }
  if (issue.code === "too_small" && typeof issue.minimum === "number") {
    return issue.minimum === 1
      ? `${label} is required.`
      : `${label} must contain at least ${issue.minimum} characters.`;
  }
  if (issue.code === "invalid_type") return `${label} has an invalid value.`;
  if (issue.code === "invalid_string" && issue.validation === "email") {
    return `Please enter a valid ${label.toLowerCase()}.`;
  }
  if (issue.message && !looksTechnical(issue.message)) {
    return issue.message.endsWith(".") ? issue.message : `${issue.message}.`;
  }
  return null;
}

function parseValidationIssue(message: string): ValidationIssue | null {
  const starts = [message.indexOf("["), message.indexOf("{")].filter((index) => index >= 0);
  const start = starts.length ? Math.min(...starts) : -1;
  if (start < 0) return null;

  for (let end = message.length; end > start; end -= 1) {
    try {
      const parsed = JSON.parse(message.slice(start, end)) as unknown;
      const candidate = Array.isArray(parsed) ? parsed[0] : parsed;
      if (candidate && typeof candidate === "object") return candidate as ValidationIssue;
    } catch {
      // Server wrappers can append text after the JSON payload; shorten until it parses.
    }
  }
  return null;
}

function looksTechnical(message: string): boolean {
  return /(^\s*[\[{])|ZodError|invalid_type|too_(big|small)|maximum|minimum|expected|received|path|Postgrest|PGRST|violates|constraint|row-level security|JWT|stack|at \w+\s*\(/i.test(message);
}

function knownServiceMessage(message: string): string | null {
  if (/invalid login credentials/i.test(message)) return "The email or password is incorrect.";
  if (/email not confirmed/i.test(message)) return "Please confirm your email before signing in.";
  if (/user already registered|already been registered/i.test(message)) return "An account with this email already exists.";
  if (/rate limit|too many requests/i.test(message)) return "Too many attempts. Please wait a moment and try again.";
  if (/network|failed to fetch|fetch failed/i.test(message)) return "We couldn't connect. Check your internet connection and try again.";
  if (/duplicate key|unique constraint/i.test(message)) return "This record already exists.";
  if (/foreign key|still referenced/i.test(message)) return "This record cannot be removed because it is still in use.";
  if (/permission denied|row-level security|unauthorized|forbidden/i.test(message)) {
    return "You don't have permission to perform this action.";
  }
  return null;
}

/**
 * Converts backend, authentication, database, and Zod errors into safe copy for users.
 * The original value remains available in developer logs for diagnosis.
 */
export function getUserErrorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  console.error("Application error:", error);

  const message = error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "";

  if (!message.trim()) return fallback;

  const issue = parseValidationIssue(message);
  if (issue) return validationMessage(issue) ?? "Please check the highlighted information and try again.";

  const serviceMessage = knownServiceMessage(message);
  if (serviceMessage) return serviceMessage;

  if (looksTechnical(message)) return fallback;
  return message;
}