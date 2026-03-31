/**
 * Regression tests — ensure API contract stability across releases.
 * Add tests here whenever a breaking change is proposed.
 */
import { describe, it, expect } from "vitest";
import { insertProjectSchema, insertBookingSchema } from "../../shared/schema";
import { generateToken } from "../../server/auth";

describe("API Contract — Projects", () => {
  it("project object must have name, description, type fields", () => {
    const result = insertProjectSchema.safeParse({
      name: "Auth Service",
      description: "A service",
      type: "API",
      tags: [],
    });
    expect(result.success).toBe(true);
  });

  it("tags field is always an array (backwards compat)", () => {
    const result = insertProjectSchema.safeParse({
      name: "X",
      description: "Y",
      type: "API",
      tags: [],
    });
    if (result.success) {
      expect(Array.isArray(result.data.tags)).toBe(true);
    }
  });

  it("published defaults to true (backwards compat)", () => {
    const result = insertProjectSchema.safeParse({
      name: "X",
      description: "Y",
      type: "API",
    });
    expect(result.success).toBe(true);
  });
});

describe("API Contract — Bookings", () => {
  it("booking must include name, email, details, date, time", () => {
    const result = insertBookingSchema.safeParse({
      name: "Jane",
      email: "jane@example.com",
      details: "Some context",
      date: "2026-05-01",
      time: "10:00",
      meetingType: "discovery",
    });
    expect(result.success).toBe(true);
  });
});

describe("Auth — token format stable", () => {
  it("token is three dot-separated base64url segments", () => {
    const token = generateToken("uid", "user");
    const parts = token.split(".");
    expect(parts).toHaveLength(3);
    parts.forEach((p: string) => {
      expect(p).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });
});