// Use the real DATABASE_URL from the environment — same DB as dev.
// The admin user is seeded here by seedAdminUser() which runs in beforeAll of api.test.ts.
// Do not override DATABASE_URL or JWT_SECRET — they must match the seeded values.
process.env.NODE_ENV = "test";