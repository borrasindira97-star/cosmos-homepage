import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { build } from "esbuild";

class Plugin {
  constructor(app) { this.app = app; }
  async loadData() { return {}; }
  registerView(type, factory) { this.registeredView = { type, factory }; }
  addRibbonIcon(icon, name, callback) { this.ribbon = { icon, name, callback }; }
  addCommand(command) { this.command = command; }
  addSettingTab(tab) { this.settingTab = tab; }
}

class ItemView { constructor(leaf) { this.leaf = leaf; this.app = leaf?.app; } }
class PluginSettingTab { constructor(app, plugin) { this.app = app; this.plugin = plugin; } }
class MarkdownView {}
class TFile {}
class Notice {}

test("release bundle loads through the Obsidian lifecycle without opening on first install", async () => {
  const result = await build({
    entryPoints: ["src/main.js"], bundle: true, external: ["obsidian"], format: "cjs",
    platform: "node", target: "es2018", minify: true, write: false,
  });
  const module = { exports: {} };
  vm.runInNewContext(result.outputFiles[0].text, {
    module, exports: module.exports,
    require: (name) => {
      assert.equal(name, "obsidian");
      return { Plugin, ItemView, MarkdownView, PluginSettingTab, Notice, TFile };
    },
  });
  const PluginClass = module.exports.default;
  let startupCallback;
  let opened = 0;
  const app = {
    workspace: {
      onLayoutReady: (callback) => { startupCallback = callback; },
      getLeavesOfType: () => [],
      getLeaf: () => { opened += 1; return {}; },
    },
  };
  const plugin = new PluginClass(app);
  await plugin.onload();
  assert.equal(plugin.registeredView.type, "cosmos-homepage");
  assert.equal(plugin.command.id, "open-homepage");
  assert.equal(plugin.settingTab.getSettingDefinitions().length, 5);
  startupCallback();
  assert.equal(opened, 0);
});
