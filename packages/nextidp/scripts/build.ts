// Builds the package twice from one source: dist/esm (ES modules) and dist/cjs (CommonJS),
// each with its own copy of the type declarations, so `import` and `require` both get types
// that describe the format they load. Every file is compiled on its own, not bundled: the
// entry points share one copy of the core, so an IdpError from one is an IdpError in another.
import { execSync } from "node:child_process";
import { cp, readdir, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { build } from "esbuild";

const root = join(import.meta.dirname, "..");
const src = join(root, "src");
const dist = join(root, "dist");

async function sources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .filter((entry) => !entry.name.endsWith(".test.ts"))
    .map((entry) => join(entry.parentPath, entry.name));
}

await rm(dist, { recursive: true, force: true });

// Declarations first, into dist/types: tsc checks the code as it goes.
execSync("tsc -p tsconfig.build.json", { cwd: root, stdio: "inherit" });

const entryPoints = await sources(src);
for (const format of ["esm", "cjs"] as const) {
  const outdir = join(dist, format);
  await build({
    entryPoints,
    outdir,
    outbase: src,
    format,
    platform: "node",
    target: "node20",
    bundle: false,
    logLevel: "warning",
  });
  // The folder's own module type: .js files under dist/cjs are CommonJS, and so are the
  // declarations beside them.
  await writeFile(
    join(outdir, "package.json"),
    `${JSON.stringify({ type: format === "esm" ? "module" : "commonjs" })}\n`,
  );
  await cp(join(dist, "types"), outdir, { recursive: true });
}
await rm(join(dist, "types"), { recursive: true, force: true });

console.warn(`nextidp: built ${entryPoints.length} modules into ${relative(root, dist)}/{esm,cjs}`);
