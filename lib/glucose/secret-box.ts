// AES-256-GCM encryption for third-party tokens stored in Neon (CareLink
// access/refresh tokens). The key is derived from NEXTAUTH_SECRET, so a
// database dump alone can't be used to read the owner's Medtronic data.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "v1";

function key(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is required to encrypt CareLink tokens");
  return createHash("sha256").update(`carelink-token:${secret}`).digest();
}

export function sealSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(":");
}

/** Returns null when the value is missing or can't be decrypted (e.g. rotated secret). */
export function openSecret(sealed: string | null | undefined): string | null {
  if (!sealed) return null;
  const [prefix, iv, tag, data] = sealed.split(":");
  if (prefix !== PREFIX || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
