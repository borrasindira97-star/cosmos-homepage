import assert from "node:assert/strict";
import test from "node:test";
import { bootPlugin, makeApp } from "./harness.mjs";

test("release bundle loads through the Obsidian lifecycle without opening on first install", async () => {
  const app = makeApp();
  const { plugin } = await bootPlugin(app);
  assert.equal(plugin.registeredView.type, "cosmos-homepage");
  assert.equal(plugin.command.id, "open-homepage");
  assert.equal(typeof plugin.settingTab.display, "function");
  plugin.settingTab.display();
  assert.equal(plugin.settingTab.containerEl.settingsRegistry.length, 5);
  app.workspace.layoutReadyCallback();
  assert.equal(app.workspace.getLeafCalls.length, 0);
});
