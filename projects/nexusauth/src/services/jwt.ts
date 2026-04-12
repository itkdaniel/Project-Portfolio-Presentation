/**
 * JWT service — HMAC-SHA256 signed tokens
 * Access tokens expire in 15 minutes.
 * Refresh tokens are single-use, stored in Redis, expire in 7 days.
 */

import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const SECRET = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is required"); })();
const ACCESS_TTL_S  = parseInt(process.env.JWT_ACCESS_TTL  ?? "900",    10);
const REFRESH_TTL_S = parseInt(process.env.JWT_REFRESH_TTL ?? "604800", 10);

export interface TokenPayload {
  sub:   string;
  role:  string;
  type:  "access" | "refresh";
  iat:   number;
  exp:   number;
  jti:   string;
}

function base64url(buf: Buffer | string): string {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function sign(data: string): string {
  return createHmac("sha256", SECRET).update(data).digest("base64url");
}

export function createAccessToken(userId: string, role: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = {
    sub:  userId,
    role,
    type: "access",
    iat:  now,
    exp:  now + ACCESS_TTL_S,
    jti:  randomBytes(16).toString("hex"),
  };
  const header  = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body    = base64url(JSON.stringify(payload));
  const sig     = sign(`${header}.${body}`);
  return `${header}.${body}.${sig}`;
}

export function verifyToken(token: string): TokenPayload {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed token");
  const [header, body, sig] = parts;
  const expected = sign(`${header}.${body}`);
  // Timing-safe comparison
  const expectedBuf = Buffer.from(expected);
  const actualBuf   = Buffer.from(sig);
  if (expectedBuf.length !== actualBuf.length ||
      !timingSafeEqual(expectedBuf, actualBuf)) {
    throw new Error("Invalid token signature");
  }
  const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as TokenPayload;
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error("Token expired");
  return payload;
}

export function generateRefreshToken(): string {
  return randomBytes(48).toString("hex");
}

export { ACCESS_TTL_S, REFRESH_TTL_S };
