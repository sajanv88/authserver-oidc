import { defineConfig, devices } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";
import { APP_URL, AUTH_URL } from "./support/env";

const ci = Boolean(process.env.CI);

// Gherkin features in features/, step definitions in steps/; `bddgen` turns them into
// Playwright tests in .features-gen/ before every run.
const testDir = defineBddConfig({
  features: "features/*.feature",
  steps: "steps/*.ts",
});

// Both apps run as `next dev`, the way they run locally: the auth server refuses the console
// email provider and http:// URLs in production, and the suite reads the emails it prints.
const server = (app: "auth-server" | "example-client", url: string) => ({
  command: `node scripts/serve.ts ${app}`,
  url: `${url}/api/health`,
  // Always our own servers: the steps read the emails from the output they write.
  reuseExistingServer: false,
  timeout: 180_000,
  env: { EMAIL_PROVIDER: "console", NEXT_TELEMETRY_DISABLED: "1" },
});

export default defineConfig({
  testDir,
  outputDir: "test-results",
  fullyParallel: true,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  workers: ci ? 2 : 3,
  // Dev servers compile each route on first use, so allow for slow first requests.
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: ci
    ? [["github"], ["list"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  globalSetup: "./support/warm-up.ts",
  use: {
    baseURL: AUTH_URL,
    navigationTimeout: 60_000,
    actionTimeout: 20_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [server("auth-server", AUTH_URL), server("example-client", APP_URL)],
});
