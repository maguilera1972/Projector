import { scryptSync, randomBytes, timingSafeEqual } from "crypto";

const KEY_LEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LEN);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (stored.startsWith("scrypt:")) {
    const [, saltHex, hashHex] = stored.split(":");
    if (!saltHex || !hashHex) return false;
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const actual = scryptSync(password, salt, KEY_LEN);
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(actual, expected);
  }

  // Compatibilité anciens comptes bcrypt (si bcryptjs est installé)
  if (stored.startsWith("$2")) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const bcrypt = require("bcryptjs") as {
        compare: (a: string, b: string) => boolean;
      };
      return bcrypt.compare(password, stored);
    } catch {
      return false;
    }
  }

  return false;
}

export function getInitialAdminPassword(): string {
  return process.env.PROJECTOR_ADMIN_PASSWORD ?? "NeMesis@17017";
}
