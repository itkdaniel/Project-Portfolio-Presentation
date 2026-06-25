#!/usr/bin/env node
/**
 * Reads Playwright JSON results and writes a GitHub Actions job summary that
 * distinguishes between:
 *   - Genuine failures  — failed in the first run AND in the retry
 *   - Flaky tests       — failed in the first run but passed on retry
 *
 * Usage (from CI):
 *   node scripts/e2e-summary.js
 *
 * Environment:
 *   GITHUB_STEP_SUMMARY  — path to the summary file (set by GitHub Actions)
 *   E2E_FIRST_FAILURES   — path to the file containing first-run failure titles
 *                          (default: test-results/e2e-first-failures.txt)
 *   E2E_RESULTS_JSON     — path to the Playwright JSON output
 *                          (default: test-results/e2e-results.json)
 */

import fs from "fs";

const FIRST_FAILURES_FILE =
  process.env.E2E_FIRST_FAILURES ||
  "test-results/e2e-first-failures.txt";
const RESULTS_JSON =
  process.env.E2E_RESULTS_JSON || "test-results/e2e-results.json";
const SUMMARY_FILE = process.env.GITHUB_STEP_SUMMARY;

function readFirstFailures() {
  try {
    const raw = fs.readFileSync(FIRST_FAILURES_FILE, "utf8").trim();
    return raw ? raw.split("\n").filter(Boolean) : [];
  } catch {
    return [];
  }
}

function collectFailingSpecs(suite, ancestors = []) {
  const failing = [];
  const prefix = ancestors.length ? ancestors.join(" > ") + " > " : "";

  for (const spec of suite.specs || []) {
    if (!spec.ok) {
      failing.push(prefix + spec.title);
    }
  }

  for (const child of suite.suites || []) {
    const childAncestors = suite.title
      ? [...ancestors, suite.title]
      : ancestors;
    failing.push(...collectFailingSpecs(child, childAncestors));
  }

  return failing;
}

function readRetryFailures() {
  try {
    const data = JSON.parse(fs.readFileSync(RESULTS_JSON, "utf8"));
    const failing = [];
    for (const suite of data.suites || []) {
      failing.push(...collectFailingSpecs(suite));
    }
    return failing;
  } catch {
    return [];
  }
}

function buildSummary(firstFailed, retryFailed) {
  const retryFailedSet = new Set(retryFailed);
  const firstFailedSet = new Set(firstFailed);

  const genuine = firstFailed.filter((t) => retryFailedSet.has(t));
  const flaky = firstFailed.filter((t) => !retryFailedSet.has(t));
  const newInRetry = retryFailed.filter((t) => !firstFailedSet.has(t));

  const lines = ["## E2E Test Results\n"];

  if (firstFailed.length === 0 && retryFailed.length === 0) {
    lines.push("All E2E tests passed. No failures detected.\n");
    return lines.join("\n");
  }

  if (genuine.length > 0) {
    lines.push(
      `### Genuine Failures — failed both runs (${genuine.length})\n`
    );
    lines.push(
      "> These tests failed on the initial run **and** on the retry. They need to be fixed.\n"
    );
    for (const t of genuine) {
      lines.push(`- ${t}`);
    }
    lines.push("");
  }

  if (flaky.length > 0) {
    lines.push(
      `### Flaky Tests — passed on retry (${flaky.length})\n`
    );
    lines.push(
      "> These tests failed initially but passed when re-run. They may indicate timing issues or environment flakiness.\n"
    );
    for (const t of flaky) {
      lines.push(`- ${t}`);
    }
    lines.push("");
  }

  if (newInRetry.length > 0) {
    lines.push(
      `### Unexpected Retry Failures — only failed on retry (${newInRetry.length})\n`
    );
    lines.push(
      "> These tests passed initially but failed when re-run. This is unusual and may indicate state pollution.\n"
    );
    for (const t of newInRetry) {
      lines.push(`- ${t}`);
    }
    lines.push("");
  }

  const totalFirst = firstFailed.length;
  const totalGenuine = genuine.length;
  lines.push(
    `---\n**Summary:** ${totalFirst} spec(s) failed on the first run. ` +
      `${totalGenuine} remained failing after retry. ` +
      `${flaky.length} resolved as flaky.\n`
  );

  return lines.join("\n");
}

function writeOutput(summary) {
  if (SUMMARY_FILE) {
    fs.appendFileSync(SUMMARY_FILE, summary);
    console.log("E2E summary written to GitHub Actions step summary.");
  } else {
    console.log("--- E2E Summary (no GITHUB_STEP_SUMMARY set) ---");
    console.log(summary);
  }
}

const firstFailed = readFirstFailures();
const retryFailed = readRetryFailures();
const summary = buildSummary(firstFailed, retryFailed);
writeOutput(summary);
