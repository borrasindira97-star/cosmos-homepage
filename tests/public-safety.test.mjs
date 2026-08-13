import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

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
  assert.equal(manifest.version, "1.0.0");
  assert.equal(manifest.isDesktopOnly, false);
  assert.ok(manifest.description.length <= 250);
});

test("release automation uses GitHub's bundled CLI without a third-party publisher", async () => {
  const workflow = await readFile(".github/workflows/release.yml", "utf8");
  assert.match(workflow, /gh release create/);
  assert.doesNotMatch(workflow, /softprops\/action-gh-release/);
});
