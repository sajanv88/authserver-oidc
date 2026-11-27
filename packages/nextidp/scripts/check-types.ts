// Packs the package as it would be published and checks, with Are the Types Wrong, that each
// entry point resolves to the right types under every module resolution: node10, node16 as
// CommonJS and as an ES module, and bundler. Run after `build`. Commands are fixed strings.
import { execSync } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const out = await mkdtemp(join(tmpdir(), "nextidp-pack-"));
try {
  execSync(`pnpm pack --pack-destination "${out}"`, { cwd: root, stdio: "ignore" });
  const [tarball] = (await readdir(out)).filter((name) => name.endsWith(".tgz"));
  if (!tarball) throw new Error("pnpm pack made no tarball.");
  const packed = `"${join(out, tarball)}"`;
  execSync(`attw ${packed} --entrypoints . ./express ./node ./hono ./nestjs`, {
    cwd: root,
    stdio: "inherit",
  });
  // `nextidp/next` imports next/server, and `next` has no exports map, so node16 can't
  // resolve that from it. Next.js apps resolve through their bundler, where it does.
  // node10 (no exports map at all) can't resolve `next` itself, so that profile is skipped.
  execSync(
    `attw ${packed} --entrypoints ./next --profile node16 --ignore-rules internal-resolution-error`,
    {
      cwd: root,
      stdio: "inherit",
    },
  );
} finally {
  await rm(out, { recursive: true, force: true });
}
