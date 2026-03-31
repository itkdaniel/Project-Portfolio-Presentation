import { describe, it, expect } from "vitest";
import { hashPassword, generateToken } from "../../server/auth";

describe("Auth utilities", () => {
  describe("hashPassword", () => {
    it("returns a 64-character hex string", () => {
      const hash = hashPassword("MySecurePass!");
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });

    it("same input produces same hash (deterministic)", () => {
      expect(hashPassword("hello")).toBe(hashPassword("hello"));
    });

    it("different passwords produce different hashes", () => {
      expect(hashPassword("password1")).not.toBe(hashPassword("password2"));
    });
  });

  describe("generateToken", () => {
    it("returns a three-part JWT-like token", () => {
      const token = generateToken("user-123", "admin");
      const parts = token.split(".");
      expect(parts).toHaveLength(3);
    });

    it("encodes user id and role in payload", () => {
      const token = generateToken("user-abc", "user");
      const [, body] = token.split(".");
      const payload = JSON.parse(Buffer.from(body, "base64url").toString());
      expect(payload.sub).toBe("user-abc");
      expect(payload.role).toBe("user");
    });

    it("admin token encodes admin role", () => {
      const token = generateToken("admin-1", "admin");
      const [, body] = token.split(".");
      const payload = JSON.parse(Buffer.from(body, "base64url").toString());
      expect(payload.role).toBe("admin");
    });
  });
});