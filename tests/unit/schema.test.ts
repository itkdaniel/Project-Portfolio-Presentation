import { describe, it, expect } from "vitest";
import { insertProjectSchema, insertBookingSchema, insertInquirySchema, loginSchema } from "../../shared/schema";

describe("Zod Schemas — validation", () => {

  describe("insertProjectSchema", () => {
    it("accepts a valid project payload", () => {
      const result = insertProjectSchema.safeParse({
        name: "Auth Service",
        description: "JWT-based auth microservice",
        type: "API",
        tags: ["Node.js", "JWT"],
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing required fields", () => {
      const result = insertProjectSchema.safeParse({ name: "Only name" });
      expect(result.success).toBe(false);
    });
  });

  describe("insertBookingSchema", () => {
    it("accepts a valid booking", () => {
      const result = insertBookingSchema.safeParse({
        name: "Jane Doe",
        email: "jane@example.com",
        details: "I need microservices consulting",
        date: "2026-05-01",
        time: "10:00",
        meetingType: "discovery",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid email", () => {
      const result = insertBookingSchema.safeParse({
        name: "Jane",
        email: "not-an-email",
        details: "some details",
        date: "2026-05-01",
        time: "10:00",
        meetingType: "discovery",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("loginSchema", () => {
    it("accepts valid credentials", () => {
      expect(loginSchema.safeParse({ email: "a@b.com", password: "123456" }).success).toBe(true);
    });

    it("rejects password shorter than 6 chars", () => {
      expect(loginSchema.safeParse({ email: "a@b.com", password: "12345" }).success).toBe(false);
    });

    it("rejects invalid email", () => {
      expect(loginSchema.safeParse({ email: "bad", password: "123456" }).success).toBe(false);
    });
  });

  describe("insertInquirySchema", () => {
    it("accepts valid inquiry", () => {
      expect(insertInquirySchema.safeParse({ message: "How do I get started?" }).success).toBe(true);
    });

    it("rejects empty message", () => {
      expect(insertInquirySchema.safeParse({ message: "" }).success).toBe(false);
    });
  });
});