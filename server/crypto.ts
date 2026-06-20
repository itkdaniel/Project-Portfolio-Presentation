/**
 * server/crypto.ts
 * AES-256-CBC field-level encryption for sensitive user data (mobile, location).
 * Key is read from FIELD_ENCRYPTION_KEY env var (64-char hex = 32 bytes).
 * Falls back to plaintext storage with a console warning when key is absent.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { log } from "./logger";

const ALGORITHM = "aes-256-cbc";
const IV_LENGTH = 16;

function getKey(): Buffer | null {
  const hex = process.env.FIELD_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    return null;
  }
  return Buffer.from(hex, "hex");
}

/**
 * Encrypts a plaintext string.
 * Returns "enc:<iv_hex>:<ciphertext_hex>" or the plaintext unchanged if no key.
 */
export function encryptField(plaintext: string): string {
  const key = getKey();
  if (!key) {
    log("[crypto] FIELD_ENCRYPTION_KEY not set — storing field as plaintext");
    return plaintext;
  }
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `enc:${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypts a value produced by encryptField.
 * Returns the original plaintext, or the raw string if it wasn't encrypted.
 */
export function decryptField(value: string): string {
  if (!value.startsWith("enc:")) {
    return value;
  }
  const key = getKey();
  if (!key) {
    log("[crypto] FIELD_ENCRYPTION_KEY not set — cannot decrypt field");
    return "";
  }
  const parts = value.split(":");
  if (parts.length !== 3) return value;
  const iv = Buffer.from(parts[1], "hex");
  const encrypted = Buffer.from(parts[2], "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
