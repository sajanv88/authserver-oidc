// Starts one app's dev server for the suite (Playwright's webServer runs this), and copies
// everything it prints to <E2E_OUTPUT_DIR>/<app>.log (the config passes OUTPUT_DIR from
// support/env.ts). With EMAIL_PROVIDER=console the auth server prints each email there as a
// JSON line, and the steps read the links from it.
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { join } from "node:path";

const APPS = ["auth-server", "example-client"] as const;
type App = (typeof APPS)[number];

const app = process.argv[2];
if (!APPS.includes(app as App)) {
  process.stderr.write(`Usage: node scripts/serve.ts <${APPS.join("|")}>\n`);
  process.exit(2);
}

const outputDir = process.env.E2E_OUTPUT_DIR;
if (!outputDir) {
  process.stderr.write("E2E_OUTPUT_DIR is not set: run the suite through Playwright.\n");
  process.exit(2);
}
mkdirSync(outputDir, { recursive: true });
const log = createWriteStream(join(outputDir, `${app}.log`), { flags: "w" });

// One command string: `app` is one of the names above, never input from elsewhere.
const child = spawn(`pnpm --filter ${app} dev`, {
  cwd: join(import.meta.dirname, "..", "..", ".."),
  shell: true,
  stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.pipe(log, { end: false });
child.stderr.on("data", (chunk: Buffer) => {
  log.write(chunk);
  process.stderr.write(chunk);
});
child.on("exit", (code) => {
  log.end();
  process.exit(code ?? 1);
});
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => child.kill(signal));
}
