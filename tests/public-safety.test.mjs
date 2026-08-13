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
  assert.doesNotMatch(source, /\.style(?:\.|\[)/);
  assert.doesNotMatch(source, /console\./);
});

test("manifest is an installable non-desktop-only community plugin", async () => {
  const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
  assert.equal(manifest.id, "cosmos-homepage");
  assert.equal(manifest.version, "1.0.6");
  assert.equal(manifest.isDesktopOnly, false);
  assert.ok(manifest.description.length <= 250);
});

test("public styles avoid important overrides", async () => {
  const styles = await readFile("styles.css", "utf8");
  assert.doesNotMatch(styles, /!important/);
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
  ];

  for (const screenshot of screenshots) {
    assert.match(readme, new RegExp(screenshot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.ok((await stat(screenshot)).size > 20_000, `${screenshot} should be a real product screenshot`);
  }
  assert.match(readme, /synthetic demo notes/i);
  assert.match(readme, /obsidian:\/\/show-plugin\?id=cosmos-homepage/);
});
