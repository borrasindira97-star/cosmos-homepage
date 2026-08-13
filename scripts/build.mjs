import { build } from "esbuild";

await build({
  entryPoints: ["src/main.js"],
  outfile: "main.js",
  bundle: true,
  external: ["obsidian"],
  format: "cjs",
  platform: "node",
  target: "es2018",
  minify: true,
  sourcemap: false,
  logLevel: "info",
});
