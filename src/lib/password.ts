import { pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";

const ITERATIONS = 120_000;
const KEYLEN = 32;
const DIGEST = "sha256";

export function hashPassword(password: string): string {
    const salt = randomBytes(16).toString("hex");
    const hash = pbkdf2Sync(password, salt, ITERATIONS, KEYLEN, DIGEST).toString("hex");
    return `${ITERATIONS}:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 3) return false;

  const [itStr, salt, originalHash] = parts;
  const iterations = Number(itStr);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;

  const hash = pbkdf2Sync(password, salt, iterations, KEYLEN, DIGEST).toString("hex");
  return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(originalHash, "hex"));
}

