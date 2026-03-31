-- ─────────────────────────────────────────────────────────────────────────────
-- NexusConsult — PostgreSQL Initialization Script
-- Runs automatically when the postgres Docker container first starts.
-- Drizzle ORM handles table creation via db:push; this file adds extensions
-- and initial configuration only.
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enable pg_trgm for trigram fuzzy search (used by Python service)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Enable uuid-ossp as fallback
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Performance: connection limit for application user
-- ALTER ROLE nexus CONNECTION LIMIT 100;