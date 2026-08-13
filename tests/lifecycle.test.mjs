import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("refresh is debounced and does not reset the selected board", async () => {
  const source = await readFile("src/main.js", "utf8");
  assert.match(source, /this\.currentBoard = "overview"/);
  assert.match(source, /this\.currentBoard = id/);
  assert.match(source, /setTimeout\(\(\) => \{/);
  assert.doesNotMatch(source, /this\.app\.vault\.on\("create"/);
});

test("all timers and pointer light have explicit release paths", async () => {
  const source = await readFile("src/main.js", "utf8");
  assert.match(source, /clearInterval\(this\.focusTimer\)/);
  assert.match(source, /clearInterval\(this\.clockTimer\)/);
  assert.match(source, /clearTimeout\(this\.refreshTimer\)/);
  assert.match(source, /addEventListener\("pointermove", this\.pointerHandler/);
  assert.match(source, /removeEventListener\("pointermove", this\.pointerHandler/);
  assert.match(source, /removeProperty\("--cosmos-pointer-x"\)/);
  assert.match(source, /removeProperty\("--cosmos-pointer-y"\)/);
});

test("focus setting updates idle views without changing a running timer", async () => {
  const source = await readFile("src/main.js", "utf8");
  assert.match(source, /if \(view && !view\.running\) view\.remaining = this\.settings\.focusMinutes \* 60/);
});

test("unload does not detach user leaves", async () => {
  const source = await readFile("src/main.js", "utf8");
  assert.doesNotMatch(source, /detachLeavesOfType/);
});
