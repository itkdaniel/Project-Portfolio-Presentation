/**
 * Test runner module — executes vitest programmatically and returns structured results.
 * Results are cached for 60 seconds to avoid hammering the test suite on repeated requests.
 */
import { execSync, spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { log } from "./logger";

export interface TestCase {
  id: string;
  name: string;
  fullName: string;
  status: "pass" | "fail" | "skip" | "pending";
  duration: number;
  errorMessage?: string;
  errorStack?: string;
  file: string;
  suite: string;
}

export interface TestSuite {
  name: string;
  file: string;
  status: "pass" | "fail";
  duration: number;
  tests: TestCase[];
  passCount: number;
  failCount: number;
  skipCount: number;
}

export interface TestRunResult {
  runAt: string;
  duration: number;
  status: "pass" | "fail" | "running" | "error";
  suites: TestSuite[];
  summary: {
    total: number;
    pass: number;
    fail: number;
    skip: number;
    passRate: number;
  };
  coverage?: CoverageResult;
  error?: string;
}

export interface CoverageResult {
  lines: number;
  functions: number;
  branches: number;
  statements: number;
}

const RESULTS_PATH = path.join(process.cwd(), "test-results/unit-results.json");
const COVERAGE_PATH = path.join(process.cwd(), "test-results/coverage/coverage-summary.json");

let _cache: TestRunResult | null = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 30_000;

export function parseVitestJson(raw: any): TestRunResult {
  const suites: TestSuite[] = [];
  let totalPass = 0, totalFail = 0, totalSkip = 0;

  for (const testFile of raw.testResults || []) {
    const filePath = testFile.name || "";
    const relPath   = filePath.replace(process.cwd() + "/", "");
    const suiteName = path.basename(relPath, ".ts");

    const tests: TestCase[] = [];
    let suiteDuration = 0;

    // Flatten assertionResults from the JSON reporter format
    const assertions = testFile.assertionResults || [];
    for (const t of assertions) {
      const duration = t.duration || 0;
      suiteDuration += duration;
      const status: TestCase["status"] =
        t.status === "passed" ? "pass"
        : t.status === "failed" ? "fail"
        : t.status === "skipped" || t.status === "todo" ? "skip"
        : "pending";

      if (status === "pass") totalPass++;
      else if (status === "fail") totalFail++;
      else totalSkip++;

      // Parse error from failureMessages
      const errorMsg = t.failureMessages?.[0] || undefined;
      let errorMessage: string | undefined;
      let errorStack: string | undefined;

      if (errorMsg) {
        const lines = errorMsg.split("\n");
        errorMessage = lines[0]?.replace(/\x1b\[[0-9;]*m/g, "").trim();
        errorStack   = lines.slice(1)
          .map((l: string) => l.replace(/\x1b\[[0-9;]*m/g, ""))
          .filter((l: string) => l.trim())
          .join("\n");
      }

      tests.push({
        id: `${relPath}:${t.fullName || t.title}`,
        name: t.title || t.fullName,
        fullName: t.fullName || t.title,
        status,
        duration,
        errorMessage,
        errorStack,
        file: relPath,
        suite: suiteName,
      });
    }

    const suiteFail = tests.some(t => t.status === "fail");
    suites.push({
      name: suiteName,
      file: relPath,
      status: suiteFail ? "fail" : "pass",
      duration: suiteDuration,
      tests,
      passCount: tests.filter(t => t.status === "pass").length,
      failCount: tests.filter(t => t.status === "fail").length,
      skipCount: tests.filter(t => t.status === "skip").length,
    });
  }

  const total = totalPass + totalFail + totalSkip;
  return {
    runAt: new Date(raw.startTime || Date.now()).toISOString(),
    duration: raw.testResults?.reduce((a: number, t: any) => a + (t.endTime - t.startTime), 0) || 0,
    status: totalFail > 0 ? "fail" : "pass",
    suites,
    summary: {
      total,
      pass: totalPass,
      fail: totalFail,
      skip: totalSkip,
      passRate: total > 0 ? Math.round((totalPass / total) * 100) : 0,
    },
  };
}

export function loadCachedResults(): TestRunResult | null {
  // Check memory cache
  if (_cache && Date.now() - _cacheTime < CACHE_TTL_MS) return _cache;

  // Load from disk
  if (!fs.existsSync(RESULTS_PATH)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf-8"));
    const result = parseVitestJson(raw);

    // Attach coverage if available
    if (fs.existsSync(COVERAGE_PATH)) {
      try {
        const cov = JSON.parse(fs.readFileSync(COVERAGE_PATH, "utf-8"));
        const total = cov.total || {};
        result.coverage = {
          lines:      Math.round(total.lines?.pct || 0),
          functions:  Math.round(total.functions?.pct || 0),
          branches:   Math.round(total.branches?.pct || 0),
          statements: Math.round(total.statements?.pct || 0),
        };
      } catch {}
    }

    _cache     = result;
    _cacheTime = Date.now();
    return result;
  } catch (e: any) {
    log(`Could not parse test results: ${e.message}`, "tests");
    return null;
  }
}

let _running = false;

export async function runTests(): Promise<TestRunResult> {
  if (_running) {
    const cached = loadCachedResults();
    if (cached) return { ...cached, status: "running" };
    return {
      runAt: new Date().toISOString(), duration: 0,
      status: "running", suites: [],
      summary: { total: 0, pass: 0, fail: 0, skip: 0, passRate: 0 },
    };
  }

  _running = true;
  _cache   = null;

  return new Promise((resolve) => {
    const proc = spawn(
      "npx",
      ["vitest", "run", "--reporter=json", "--outputFile=test-results/unit-results.json"],
      { cwd: process.cwd(), env: process.env, stdio: "pipe" }
    );

    proc.on("close", () => {
      _running = false;
      const result = loadCachedResults();
      if (result) {
        resolve(result);
      } else {
        resolve({
          runAt: new Date().toISOString(), duration: 0,
          status: "error", suites: [],
          summary: { total: 0, pass: 0, fail: 0, skip: 0, passRate: 0 },
          error: "Test run produced no results",
        });
      }
    });

    proc.on("error", (err) => {
      _running = false;
      resolve({
        runAt: new Date().toISOString(), duration: 0,
        status: "error", suites: [],
        summary: { total: 0, pass: 0, fail: 0, skip: 0, passRate: 0 },
        error: err.message,
      });
    });
  });
}