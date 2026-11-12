/**
 * Field rules for the email forms. Messages are written for inline display under the field.
 */

/** Shortest password Famara accepts. */
export const MIN_PASSWORD_LENGTH = 8;
/** Supabase hashes with bcrypt, which ignores everything past 72 bytes. */
export const MAX_PASSWORD_LENGTH = 72;

// Deliberately permissive: one @, something before it, a dot somewhere in the domain, no spaces.
// The confirmation email is the real check; this only catches obvious typos.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Trims and lower-cases an email so the same address always signs in to the same account. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Returns an error message, or null when the email looks usable. */
export function validateEmail(raw: string): string | null {
  const email = normalizeEmail(raw);
  if (!email) return 'Enter your email address.';
  if (email.length > 254 || !EMAIL_SHAPE.test(email)) {
    return 'That email address doesn’t look right.';
  }
  if (/\.\./.test(email) || email.startsWith('.') || email.includes('.@')) {
    return 'That email address doesn’t look right.';
  }
  return null;
}

/** Byte length in UTF-8, which is what the server's limit counts. */
function utf8Length(value: string): number {
  let bytes = 0;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/**
 * Rules for a new password. Sign-in only checks that something was typed, so people with older or
 * unusual passwords are never locked out by client rules.
 */
export function validateNewPassword(password: string): string | null {
  if (!password) return 'Choose a password.';
  if ([...password].length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (utf8Length(password) > MAX_PASSWORD_LENGTH) {
    return 'That password is too long. Try a shorter one.';
  }
  if (password.trim().length === 0) return 'A password can’t be only spaces.';
  return null;
}

export function validateSignInPassword(password: string): string | null {
  return password ? null : 'Enter your password.';
}

export function validatePasswordConfirmation(
  password: string,
  confirmation: string,
): string | null {
  if (!confirmation) return 'Type the password again.';
  return password === confirmation ? null : 'The passwords don’t match.';
}
