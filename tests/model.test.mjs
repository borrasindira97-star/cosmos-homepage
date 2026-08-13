import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSettings, localDay, buildVaultModel } from "../src/model.js";

function file(path, ctime, mtime = ctime) {
  const name = path.split("/").pop();
  return { path, name, basename: name.replace(/\.md$/, ""), parent: { path: path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "" }, stat: { ctime, mtime } };
}

function app(files, caches = new Map()) {
  return {
    vault: { getMarkdownFiles: () => files },
    metadataCache: { getFileCache: (item) => caches.get(item.path) || {} },
  };
}

test("settings normalize limits and excluded folders", () => {
  assert.deepEqual(normalizeSettings({ focusMinutes: 999, recentLimit: 1, excludedFolders: "Private, Templates, Private" }), {
    homepageTitle: "Your ideas have an orbit.", openOnStartup: false, focusMinutes: 120, recentLimit: 3,
    activityLimit: 240, excludedFolders: ["Private", "Templates"], reduceMotion: false,
  });
});

test("local day is stable and rejects malformed dates", () => {
  assert.equal(localDay(new Date(2026, 7, 13, 9, 4)), "2026-08-13");
  assert.equal(localDay("not-a-date"), "");
});

test("vault projection is read-only, deterministic, and excludes configured folders", () => {
  const now = new Date(2026, 7, 13, 12, 0);
  const a = file("Notes/Alpha.md", new Date(2026, 7, 13, 9, 0).getTime(), 30);
  const b = file("Notes/Beta.md", new Date(2026, 7, 8, 9, 0).getTime(), 20);
  const secret = file("Private/Secret.md", now.getTime(), 50);
  const caches = new Map([
    [a.path, { frontmatter: { title: "Alpha", tags: ["ai", "research"] }, listItems: [{ task: " ", position: { start: { line: 4 } } }] }],
    [b.path, { tags: [{ tag: "#ai" }] }],
  ]);
  const settings = { excludedFolders: ["Private"], recentLimit: 8 };
  const first = buildVaultModel(app([secret, b, a], caches), settings, now);
  const second = buildVaultModel(app([a, secret, b], caches), settings, now);
  assert.equal(first.totalNotes, 2);
  assert.equal(first.todayCount, 1);
  assert.equal(first.weekCount, 2);
  assert.equal(first.openTasks, 1);
  assert.deepEqual(first.recent.map((item) => item.path), [a.path, b.path]);
  assert.deepEqual(first.tags, [{ name: "ai", count: 2, path: a.path }, { name: "research", count: 1, path: a.path }]);
  assert.deepEqual(first.recent, second.recent);
  assert.equal(first.activities.get("2026-08-13")[0].title, "Alpha");
});

test("declared frontmatter creation time wins without reading file content", () => {
  const note = file("Notes/Imported.md", new Date(2020, 0, 1).getTime());
  const caches = new Map([[note.path, { frontmatter: { created: "2026-08-13T10:00:00+08:00" } }]]);
  const model = buildVaultModel(app([note], caches), {}, new Date(2026, 7, 13, 12));
  assert.equal(model.todayCount, 1);
});
