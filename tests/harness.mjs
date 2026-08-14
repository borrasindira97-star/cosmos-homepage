// Shared offline harness: a minimal DOM stub plus Obsidian API stubs, so the
// production bundle can be instantiated and driven inside plain Node tests.

import { build } from "esbuild";
import vm from "node:vm";

class FakeClassList {
  constructor() { this.set = new Set(); }
  add(...names) { for (const name of names) if (name) this.set.add(name); }
  remove(...names) { for (const name of names) this.set.delete(name); }
  toggle(name, force) {
    const target = force === undefined ? !this.set.has(name) : Boolean(force);
    if (target) this.set.add(name); else this.set.delete(name);
    return target;
  }
  contains(name) { return this.set.has(name); }
}

function parseCompound(part) {
  const tag = part.match(/^[a-zA-Z][\w-]*/)?.[0]?.toUpperCase() || null;
  const classes = [...part.matchAll(/\.([\w-]+)/g)].map((match) => match[1]);
  const attrs = [...part.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)].map((match) => [match[1], match[2]]);
  return { tag, classes, attrs };
}

export class FakeElement {
  constructor(tagName = "div") {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.classList = new FakeClassList();
    this.dataset = {};
    this.attributes = {};
    this.listeners = new Map();
    this.disabled = false;
    this._text = "";
    this.styleProps = new Map();
    this.style = {
      setProperty: (key, value) => this.styleProps.set(key, value),
      removeProperty: (key) => this.styleProps.delete(key),
    };
  }

  createEl(tag, options = {}) {
    const node = new FakeElement(tag);
    if (options.cls) node.classList.add(...String(options.cls).split(/\s+/).filter(Boolean));
    if (options.text != null) node.setText(options.text);
    this.appendChild(node);
    return node;
  }

  appendChild(node) { node.parentElement = this; this.children.push(node); return node; }
  removeChild(node) {
    const index = this.children.indexOf(node);
    if (index >= 0) this.children.splice(index, 1);
    node.parentElement = null;
    return node;
  }
  remove() { this.parentElement?.removeChild(this); }
  get firstChild() { return this.children[0] || null; }
  empty() { for (const child of [...this.children]) this.removeChild(child); this._text = ""; }
  addClass(...names) { this.classList.add(...names); }
  toggleClass(name, state) { this.classList.toggle(name, state); }
  setText(value) { this.empty(); this._text = String(value ?? ""); }
  set textContent(value) { this.setText(value); }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(""); }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === "disabled") this.disabled = true;
  }
  getAttribute(name) { return this.attributes[name] ?? null; }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }
  removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); }
  dispatchEvent(event) {
    event.target ??= this;
    for (const handler of [...(this.listeners.get(event.type) || [])]) handler(event);
    if (event.bubbles !== false && this.parentElement) this.parentElement.dispatchEvent(event);
    return true;
  }
  click() { if (!this.disabled) this.dispatchEvent({ type: "click", bubbles: false }); }
  keydown(key) {
    this.dispatchEvent({ type: "keydown", key, bubbles: true, preventDefault() { this.defaultPrevented = true; } });
  }
  focus() { FakeElement.activeElement = this; }

  getBoundingClientRect() { return { left: 0, top: 0, width: 1200, height: 800 }; }

  get isConnected() {
    let node = this;
    while (node.parentElement) node = node.parentElement;
    return node._isDocumentRoot === true;
  }

  matchesCompound(part) {
    const { tag, classes, attrs } = parseCompound(part);
    if (tag && this.tagName !== tag) return false;
    if (!classes.every((name) => this.classList.contains(name))) return false;
    return attrs.every(([name, value]) => {
      const actual = name.startsWith("data-")
        ? this.dataset[name.slice(5).replace(/-(\w)/g, (_, chr) => chr.toUpperCase())] ?? this.attributes[name]
        : this.attributes[name];
      return value === undefined ? actual !== undefined && actual !== null : String(actual) === value;
    });
  }

  matchesChain(parts) {
    if (!this.matchesCompound(parts[parts.length - 1])) return false;
    let ancestor = this.parentElement;
    for (let index = parts.length - 2; index >= 0; index -= 1) {
      while (ancestor && !ancestor.matchesCompound(parts[index])) ancestor = ancestor.parentElement;
      if (!ancestor) return false;
      ancestor = ancestor.parentElement;
    }
    return true;
  }

  querySelectorAll(selector) {
    const parts = [];
    let current = "";
    let depth = 0;
    for (const chr of selector.trim()) {
      if (chr === "[") depth += 1;
      if (chr === "]") depth -= 1;
      if (/\s/.test(chr) && depth === 0) {
        if (current) { parts.push(current); current = ""; }
        continue;
      }
      current += chr;
    }
    if (current) parts.push(current);
    const found = [];
    const walk = (node) => {
      for (const child of node.children) {
        if (child.matchesChain(parts)) found.push(child);
        walk(child);
      }
    };
    walk(this);
    return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

function makeEmitter() {
  const refs = new Set();
  return {
    on(name, callback) { const ref = { name, callback }; refs.add(ref); return ref; },
    offref(ref) { refs.delete(ref); },
    trigger(name, ...args) { for (const ref of [...refs]) if (ref.name === name) ref.callback(...args); },
    listenerCount() { return refs.size; },
  };
}

export function fakeFile(path, { ctime = 0, mtime = 0 } = {}) {
  const name = path.split("/").pop();
  return {
    path,
    name,
    basename: name.replace(/\.md$/i, ""),
    parent: { path: path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "" },
    stat: { ctime, mtime },
  };
}

export function makeApp(files = [], caches = new Map()) {
  const writes = [];
  const vaultEmitter = makeEmitter();
  const metadataEmitter = makeEmitter();
  const app = {
    vault: {
      getMarkdownFiles: () => files,
      getAbstractFileByPath: (path) => files.find((file) => file.path === path),
      on: vaultEmitter.on,
      offref: vaultEmitter.offref,
      create: async () => writes.push("create"),
      modify: async () => writes.push("modify"),
      rename: async () => writes.push("rename"),
      delete: async () => writes.push("delete"),
      process: async () => writes.push("process"),
    },
    metadataCache: {
      getFileCache: (file) => caches.get(file.path) || {},
      on: metadataEmitter.on,
      offref: metadataEmitter.offref,
    },
    writes,
    triggerVault: vaultEmitter.trigger,
    triggerMetadata: metadataEmitter.trigger,
    vaultListenerCount: vaultEmitter.listenerCount,
    metadataListenerCount: metadataEmitter.listenerCount,
  };
  const rootEl = new FakeElement("div");
  rootEl._isDocumentRoot = true;
  app.workspace = {
    app,
    rootEl,
    leaves: [],
    getLeafCalls: [],
    layoutReadyCallback: null,
    onLayoutReady(callback) { this.layoutReadyCallback = callback; },
    getLeavesOfType(type) { return this.leaves.filter((leaf) => leaf.viewType === type); },
    getLeaf(mode) {
      this.getLeafCalls.push(mode);
      const leaf = {
        app,
        viewType: null,
        view: null,
        file: null,
        openedPaths: [],
        async openFile(file) {
          this.file = file;
          this.openedPaths.push(file.path);
          const view = new app.obsidianStubs.MarkdownView();
          view.containerEl = new FakeElement("div");
          rootEl.appendChild(view.containerEl);
          this.view = view;
        },
        async setViewState(state) { this.viewState = state; this.viewType = state.type; },
        detach() {
          if (this.view?.containerEl) this.view.containerEl.remove();
          this.view = null;
        },
      };
      this.leaves.push(leaf);
      return leaf;
    },
    revealLeaf(leaf) { this.revealedLeaf = leaf; },
  };
  return app;
}

export function makeObsidianStubs() {
  class Plugin {
    constructor(app) { this.app = app; }
    async loadData() { return this._persisted || {}; }
    async saveData(data) { this._persisted = data; }
    registerView(type, factory) { this.registeredView = { type, factory }; }
    addRibbonIcon(icon, title, callback) { this.ribbon = { icon, title, callback }; }
    addCommand(command) { this.command = command; }
    addSettingTab(tab) { this.settingTab = tab; tab.update(); }
  }
  class ItemView {
    constructor(leaf) {
      this.leaf = leaf;
      this.app = leaf.app;
      this.contentEl = leaf.contentEl || new FakeElement("div");
    }
  }
  class MarkdownView {
    constructor() {
      this.editor = { cursor: null, setCursor(position) { this.cursor = position; } };
    }
  }
  class PluginSettingTab {
    constructor(app, plugin) {
      this.app = app;
      this.plugin = plugin;
      this.containerEl = new FakeElement("div");
    }
    update() { this.settingItems = this.getSettingDefinitions(); }
    display() {
      this.containerEl.empty();
      this.containerEl.settingsRegistry = [];
      for (const definition of this.getSettingDefinitions()) {
        const setting = new Setting(this.containerEl).setName(definition.name).setDesc(definition.desc);
        const { control } = definition;
        const method = { text: "addText", textarea: "addTextArea", toggle: "addToggle", number: "addNumber" }[control.type];
        setting[method]((component) => component
          .setValue(this.getControlValue(control.key))
          .onChange((value) => this.setControlValue(control.key, value)));
      }
    }
  }
  class ControlComponent {
    constructor(setting, tag, type) {
      this.setting = setting;
      this.type = type;
      this.inputEl = setting.controlEl.createEl(tag, { cls: `cosmos-stub-${type}` });
      this.value = undefined;
      this.onChangeCallback = null;
    }
    setValue(value) { this.value = value; return this; }
    onChange(callback) { this.onChangeCallback = callback; return this; }
    setPlaceholder() { return this; }
    async change(value) { this.value = value; await this.onChangeCallback?.(value); }
  }
  class Setting {
    constructor(containerEl) {
      this.settingEl = containerEl.createEl("div", { cls: "setting-item" });
      const info = this.settingEl.createEl("div", { cls: "setting-item-info" });
      this.nameEl = info.createEl("div", { cls: "setting-item-name" });
      this.descEl = info.createEl("div", { cls: "setting-item-description" });
      this.controlEl = this.settingEl.createEl("div", { cls: "setting-item-control" });
      this.components = [];
      if (!containerEl.settingsRegistry) containerEl.settingsRegistry = [];
      containerEl.settingsRegistry.push(this);
    }
    setName(name) { this.nameEl.setText(name); return this; }
    setDesc(desc) { this.descEl.setText(desc); return this; }
    addText(callback) { return this.addControl("input", "text", callback); }
    addTextArea(callback) { return this.addControl("textarea", "textarea", callback); }
    addToggle(callback) { return this.addControl("div", "toggle", callback); }
    addNumber(callback) { return this.addControl("input", "number", callback); }
    addControl(tag, type, callback) {
      const component = new ControlComponent(this, tag, type);
      this.components.push(component);
      callback(component);
      return this;
    }
  }
  class Notice {
    static messages = [];
    constructor(message) { Notice.messages.push(String(message ?? "")); }
  }
  class TFile {}
  return { Plugin, ItemView, MarkdownView, PluginSettingTab, Setting, Notice, TFile };
}

export async function loadCosmos() {
  const result = await build({
    entryPoints: ["src/main.js"], bundle: true, external: ["obsidian"], format: "cjs",
    platform: "node", target: "es2018", minify: false, write: false, logLevel: "silent",
  });
  const stubs = makeObsidianStubs();
  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    window: { setTimeout, clearTimeout, setInterval, clearInterval },
    require: (name) => {
      if (name !== "obsidian") throw new Error(`unexpected require: ${name}`);
      return stubs;
    },
  };
  vm.runInNewContext(result.outputFiles[0].text, sandbox);
  return { CosmosPlugin: module.exports.default, CosmosHomepageView: module.exports.CosmosHomepageView, stubs };
}

export async function bootPlugin(app, persisted) {
  const { CosmosPlugin, CosmosHomepageView, stubs } = await loadCosmos();
  app.obsidianStubs = stubs;
  const plugin = new CosmosPlugin(app);
  plugin._persisted = persisted;
  await plugin.onload();
  return { plugin, CosmosHomepageView, stubs };
}

export async function openCosmosView(plugin, CosmosHomepageView) {
  const leaf = { app: plugin.app, viewType: "cosmos-homepage", contentEl: new FakeElement("div") };
  plugin.app.workspace.rootEl.appendChild(leaf.contentEl);
  const view = new CosmosHomepageView(leaf, plugin);
  leaf.view = view;
  plugin.app.workspace.leaves.push(leaf);
  await view.onOpen();
  return { view, leaf };
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
