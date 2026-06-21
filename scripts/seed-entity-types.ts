/**
 * Seed the 10 standard entity types used by NexusScraper for NLP classification.
 * Run with: npx tsx scripts/seed-entity-types.ts
 *
 * Re-running is idempotent — existing rows are upserted by name.
 */
import { db } from "../server/db";
import { entityTypes } from "../shared/schema";
import { sql } from "drizzle-orm";

const ENTITY_TYPES = [
  { name: "Person",       color: "#3b82f6", description: "An individual human — researcher, developer, author, executive, etc." },
  { name: "Organization", color: "#8b5cf6", description: "A company, institution, open-source project, or other organizational entity." },
  { name: "Technology",   color: "#06b6d4", description: "A programming language, framework, tool, protocol, or technical standard." },
  { name: "Concept",      color: "#f59e0b", description: "An abstract idea, methodology, pattern, or theoretical construct." },
  { name: "Event",        color: "#ef4444", description: "A conference, release, incident, announcement, or time-bound occurrence." },
  { name: "Location",     color: "#22c55e", description: "A physical or virtual place — country, city, data-center region, etc." },
  { name: "Product",      color: "#f97316", description: "A software product, SaaS platform, hardware device, or commercial offering." },
  { name: "Article",      color: "#a1a1aa", description: "A blog post, research paper, news article, or documentation page." },
  { name: "Repository",   color: "#ec4899", description: "A source-code repository (GitHub, GitLab, etc.) or code project." },
  { name: "Dataset",      color: "#14b8a6", description: "A structured dataset, benchmark, corpus, or data collection." },
];

async function seed() {
  console.log("🌱 Seeding entity types...");

  for (const et of ENTITY_TYPES) {
    await db
      .insert(entityTypes)
      .values(et)
      .onConflictDoUpdate({
        target: entityTypes.name,
        set: { color: et.color, description: et.description },
      });
    console.log(`  ✓ ${et.name}`);
  }

  console.log(`\n✅ Seeded ${ENTITY_TYPES.length} entity types.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
