/**
 * Seed corporate roles and data ratings into the database.
 * Run with: npx tsx scripts/seed-roles.ts
 */
import { db } from "../server/db";
import { corpRoles, dataRatings } from "../shared/schema";
import { sql } from "drizzle-orm";

const ROLES = [
  { name: "user",      displayName: "User",               level: 1, dataRating: "G",       description: "Entry-level. Read-only public data access only." },
  { name: "worker",    displayName: "Worker / Developer",  level: 2, dataRating: "PG",      description: "Developers with access to news, academic, and public social data." },
  { name: "lead",      displayName: "Team Lead",           level: 3, dataRating: "PG-13",   description: "Leads with access to business data, industry reports, and semi-private APIs." },
  { name: "manager",   displayName: "Manager",             level: 4, dataRating: "R",       description: "Managers with broad crawling rights and competitive intelligence access." },
  { name: "director",  displayName: "Director",            level: 5, dataRating: "NC-17",   description: "Directors with unrestricted web access and passive dark-web indexing." },
  { name: "executive", displayName: "Executive",           level: 6, dataRating: "Unrated", description: "Executives with full OSINT and restricted government data access." },
  { name: "owner",     displayName: "Owner",               level: 7, dataRating: "Unrated", description: "Owners — equivalent to executive; grooms next creator." },
  { name: "creator",   displayName: "Creator",             level: 8, dataRating: "None",    description: "Creator — zero restrictions, full system sovereignty." },
];

const RATINGS = [
  {
    code: "G", name: "General Audiences",
    description: "Public domain, open-access datasets only.",
    allowedSources: ["Wikipedia","Project Gutenberg","data.gov","Common Crawl","arXiv open-access","UCI ML Repository"],
    dockerAiHint: "Use only openly licensed, non-sensitive, publicly available corpora.",
  },
  {
    code: "PG", name: "Parental Guidance",
    description: "News, academic papers, public social media.",
    allowedSources: ["All G sources","News APIs","arXiv full corpus","Stack Overflow dumps","GitHub public repos","Reddit public posts"],
    dockerAiHint: "Permitted to access mainstream public internet sources including news and forums.",
  },
  {
    code: "PG-13", name: "Parents Strongly Cautioned",
    description: "Business data, industry reports, private-but-public APIs.",
    allowedSources: ["All PG sources","LinkedIn public profiles","SEC EDGAR","Kaggle datasets","Patent databases"],
    dockerAiHint: "May access semi-public business-oriented sources. Consent-based private repositories allowed.",
  },
  {
    code: "R", name: "Restricted",
    description: "Competitive intelligence, broad web crawling, proprietary APIs.",
    allowedSources: ["All PG-13 sources","Full Reddit corpus","Competitive scraping","Dark web read-only directories"],
    dockerAiHint: "Broad unrestricted web crawling permitted. Passive dark-web directory indexing allowed.",
  },
  {
    code: "NC-17", name: "No Children Under 17",
    description: "Unrestricted internet, paywalled academic, leaked-but-public datasets.",
    allowedSources: ["All R sources","Paywalled journals","Full web crawling (NSFW)","Active dark-web forum indexing (read-only)"],
    dockerAiHint: "Unrestricted internet access including adult-rated. Passive dark-web indexing allowed.",
  },
  {
    code: "Unrated", name: "Unrated / Executive",
    description: "All above plus active dark-web access and restricted government data.",
    allowedSources: ["All NC-17 sources","Active dark-web markets (intelligence)","Restricted government DBs (with MOU)","Full OSINT"],
    dockerAiHint: "Full active dark-web access for intelligence purposes. Government-restricted data with proper agreements.",
  },
  {
    code: "None", name: "No Restrictions — Creator",
    description: "Absolute zero restrictions. All data sources permitted.",
    allowedSources: ["EVERYTHING — no source restrictions apply"],
    dockerAiHint: "Zero restrictions. Access any data source, format, or collection method.",
  },
];

async function seed() {
  console.log("Seeding corp_roles…");
  for (const role of ROLES) {
    await db.insert(corpRoles).values(role)
      .onConflictDoUpdate({ target: corpRoles.name, set: { displayName: role.displayName, dataRating: role.dataRating, description: role.description } });
    console.log(`  ✓ ${role.name} (level ${role.level})`);
  }

  console.log("\nSeeding data_ratings…");
  for (const rating of RATINGS) {
    await db.insert(dataRatings).values(rating)
      .onConflictDoUpdate({ target: dataRatings.code, set: { name: rating.name, description: rating.description } });
    console.log(`  ✓ ${rating.code} — ${rating.name}`);
  }

  console.log("\n✓ All role and rating data seeded.");
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
