/**
 * server/crypto.ts
 * AES-256-CBC field-level encryption for sensitive user data (mobile, location).
 * Key is read from FIELD_ENCRYPTION_KEY env var (64-char hex = 32 bytes).
 * App will REFUSE to start if the key is missing or malformed — no plaintext fallback.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-cbc";
const IV_LENGTH = 16;

function getKey(): Buffer {
  const hex = process.env.FIELD_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "FIELD_ENCRYPTION_KEY env var is missing or not a 64-char hex string. " +
      "Set it in Replit Secrets before starting the server."
    );
  }
  return Buffer.from(hex, "hex");
}

/**
 * Encrypts a plaintext string.
 * Returns "enc:<iv_hex>:<ciphertext_hex>".
 * Throws if FIELD_ENCRYPTION_KEY is absent.
 */
export function encryptField(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `enc:${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypts a value produced by encryptField.
 * Returns the original plaintext.
 * If the value was stored before encryption (no "enc:" prefix), returns it unchanged.
 * Throws if key is missing and value looks encrypted.
 */
export function decryptField(value: string): string {
  if (!value.startsWith("enc:")) {
    // Legacy plaintext value — return as-is (graceful migration)
    return value;
  }
  const key = getKey();
  const parts = value.split(":");
  if (parts.length !== 3) return value;
  const iv = Buffer.from(parts[1], "hex");
  const encrypted = Buffer.from(parts[2], "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
