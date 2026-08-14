import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { build } from "esbuild";

test("two consecutive release builds are byte-identical", async () => {
  const options = {
    entryPoints: ["src/main.js"], bundle: true, external: ["obsidian"], format: "cjs",
    platform: "node", target: "es2018", minify: true, sourcemap: false, write: false, logLevel: "silent",
  };
  const first = await build(options);
  const second = await build(options);
  const hash = (result) => createHash("sha256").update(result.outputFiles[0].contents).digest("hex");
  assert.equal(hash(first), hash(second));
});
