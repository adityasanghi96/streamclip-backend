import bcrypt from "bcryptjs";

const USERNAME_RE = /^[a-z0-9_]{3,32}$/;
const BCRYPT_ROUNDS = 12;
const DUMMY_PASSWORD_HASH = "$2b$12$Cgc6aeiR7gfbjEpAr5BtLuW7jCagmI2CNmxugd7fBdHQPxvrSz1by";

export function normalizeUsername(value: unknown): string | null {
  const username = String(value ?? "").trim().toLowerCase();
  if (!USERNAME_RE.test(username)) return null;
  return username;
}

export function validatePassword(value: unknown): string | null {
  const password = String(value ?? "");
  if (password.length < 8 || password.length > 72) return null;
  return password;
}

export function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function verifyPassword(password: string, passwordHash?: string | null) {
  return bcrypt.compare(password, passwordHash || DUMMY_PASSWORD_HASH);
}
