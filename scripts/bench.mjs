// Offline performance benchmark for the vault projection used by the homepage.
// Runs buildVaultModel against 1,000 and 10,000 synthetic Markdown metadata
// records and reports wall time per pass. No I/O, no network, no vault access.

import { performance } from "node:perf_hooks";
import { buildVaultModel } from "../src/model.js";

function lcg(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function makeVault(size) {
  const random = lcg(20260814);
  const day = 86_400_000;
  const base = new Date(2026, 7, 14, 12, 0, 0).getTime();
  const tagPool = Array.from({ length: 40 }, (_, index) => `topic-${index}`);
  const files = [];
  const caches = new Map();
  for (let index = 0; index < size; index += 1) {
    const path = `Bench/Folder-${index % 25}/Note-${String(index).padStart(5, "0")}.md`;
    const ctime = base - Math.floor(random() * 400) * day;
    const mtime = ctime + Math.floor(random() * 10) * day;
    const name = path.split("/").pop();
    files.push({
      path,
      name,
      basename: name.replace(/\.md$/i, ""),
      parent: { path: path.slice(0, path.lastIndexOf("/")) },
      stat: { ctime, mtime },
    });
    const cache = {};
    if (random() < 0.7) {
      const tagCount = 1 + Math.floor(random() * 3);
      const tags = new Set();
      while (tags.size < tagCount) tags.add(tagPool[Math.floor(random() * tagPool.length)]);
      cache.frontmatter = { title: `Note ${index}`, tags: [...tags] };
    }
    if (random() < 0.3) {
      cache.listItems = [{ task: " ", text: `Synthetic task ${index}`, position: { start: { line: index % 50 } } }];
    }
    if (random() < 0.5) {
      cache.frontmatter = { ...(cache.frontmatter || {}), created: new Date(ctime).toISOString() };
    }
    caches.set(path, cache);
  }
  const app = {
    vault: { getMarkdownFiles: () => files },
    metadataCache: { getFileCache: (file) => caches.get(file.path) || {} },
  };
  return app;
}

for (const size of [1000, 10000]) {
  const app = makeVault(size);
  const runs = [];
  let model;
  for (let pass = 0; pass < 3; pass += 1) {
    const start = performance.now();
    model = buildVaultModel(app, {}, new Date(2026, 7, 14, 12, 0, 0));
    runs.push((performance.now() - start).toFixed(1));
  }
  console.log(
    `${size} files: ${runs.join(" ms / ")} ms over 3 passes `
    + `(notes=${model.totalNotes}, tags=${model.tags.length}, tasks=${model.openTasks}, activeDays=${model.activities.size})`,
  );
}
