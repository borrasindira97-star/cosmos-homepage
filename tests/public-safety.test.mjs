import assert from "node:assert/strict";
import test from "node:test";
import { readFile, stat } from "node:fs/promises";

test("public source has no network, private path, or local service coupling", async () => {
  const source = `${await readFile("src/main.js", "utf8")}\n${await readFile("src/model.js", "utf8")}`;
  for (const pattern of [/\/Users\//, /127\.0\.0\.1/, /localhost/i, /568[0-9]/, /567[0-9]/, /Keychain/i, /nigo-loop/i]) {
    assert.doesNotMatch(source, pattern);
  }
  assert.doesNotMatch(source, /\bfetch\s*\(|requestUrl\s*\(/);
  assert.doesNotMatch(source, /innerHTML\s*=/);
  assert.doesNotMatch(source, /internalPlugins|eState/);
  const styleLines = source.split("\n").filter((line) => /\.style(?:\.|\[)/.test(line));
  assert.ok(styleLines.length >= 4);
  assert.ok(styleLines.every((line) => /this\.contentEl\.style\.(?:setProperty|removeProperty)\("--cosmos-pointer-[xy]"/.test(line)));
  assert.doesNotMatch(source, /console\./);
});

test("manifest is an installable non-desktop-only community plugin", async () => {
  const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
  assert.equal(manifest.id, "cosmos-homepage");
  assert.equal(manifest.version, "1.2.0");
  assert.equal(manifest.isDesktopOnly, false);
  assert.ok(manifest.description.length <= 250);
});

test("package and lockfile release versions stay aligned", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[""].version, pkg.version);
});

test("public styles avoid important overrides", async () => {
  const styles = await readFile("styles.css", "utf8");
  assert.doesNotMatch(styles, /!important/);
});

test("full Cosmos edition keeps the signature boards and motion fallback", async () => {
  const source = await readFile("src/main.js", "utf8");
  const styles = await readFile("styles.css", "utf8");
  for (const token of ["cosmos-edition-archive", "cosmos-edition-constellation", "cosmos-edition-decisions", "cosmos-edition-mission", "cosmos-edition-belt"]) {
    assert.match(source, new RegExp(token));
    assert.match(styles, new RegExp(token));
  }
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.match(source, /pointermove/);
});

test("visual gallery harness imports the production view instead of duplicating its layout", async () => {
  const demo = await readFile("scripts/demo-server.mjs", "utf8");
  assert.match(demo, /entryPoints: \["src\/main\.js"\]/);
  assert.match(demo, /CosmosPublic\.CosmosHomepageView/);
  assert.doesNotMatch(demo, /cosmos-edition-(?:archive|constellation|decisions|mission|belt)/);
});

test("source navigation remains bound to Markdown files", async () => {
  const source = await readFile("src/main.js", "utf8");
  assert.match(source, /file\?\.path\?\.endsWith\?\.\("\.md"\)/);
  assert.match(source, /leaf\.openFile\(file\)/);
});

test("release automation uses GitHub's bundled CLI without a third-party publisher", async () => {
  const workflow = await readFile(".github/workflows/release.yml", "utf8");
  assert.match(workflow, /gh release create/);
  assert.match(workflow, /gh release upload/);
  assert.match(workflow, /--clobber/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /attestations: write/);
  assert.equal((workflow.match(/uses: actions\/attest@v4/g) ?? []).length, 3);
  assert.doesNotMatch(workflow, /softprops\/action-gh-release/);
});

test("gitignore excludes only the root bundle, not the source entry", async () => {
  const ignore = await readFile(".gitignore", "utf8");
  assert.match(ignore, /^\/main\.js$/m);
  assert.doesNotMatch(ignore, /^main\.js$/m);
});

test("README product gallery is complete and all linked screenshots exist", async () => {
  const readme = await readFile("README.md", "utf8");
  const screenshots = [
    "assets/cosmos-homepage.png",
    "assets/focus-orbit.png",
    "assets/activity-calendar.png",
    "assets/knowledge-atlas.png",
    "assets/cosmos-homepage-mobile.png",
  ];

  for (const screenshot of screenshots) {
    assert.match(readme, new RegExp(screenshot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.ok((await stat(screenshot)).size > 20_000, `${screenshot} should be a real product screenshot`);
  }
  assert.match(readme, /synthetic demo notes/i);
  assert.match(readme, /obsidian:\/\/show-plugin\?id=cosmos-homepage/);
});

test("public wording stays honest about metadata, tasks, and the calendar", async () => {
  const readme = await readFile("README.md", "utf8");
  const source = `${await readFile("src/main.js", "utf8")}\n${await readFile("src/model.js", "utf8")}`;
  assert.doesNotMatch(readme, /Awaiting decision/i);
  assert.doesNotMatch(readme, /GO\/NO-GO/i);
  assert.doesNotMatch(readme, /scan(s)? note bodies/i);
  assert.match(readme, /never opens note bodies/i);
  assert.match(readme, /metadata cache/i);
  assert.match(readme, /Open tasks/);
  assert.match(readme, /Creation calendar/i);
  assert.doesNotMatch(source, /provisional|concluded|Established|Growing/);
});
