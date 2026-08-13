"use strict";

import { Plugin, ItemView, MarkdownView, PluginSettingTab, Notice, TFile } from "obsidian";
import { DEFAULT_SETTINGS, normalizeSettings, localDay, buildVaultModel } from "./model.js";

const VIEW_TYPE = "cosmos-homepage";
const VIEW_TITLE = "Cosmos homepage";
const ICON = "sparkles";

function clear(element) {
  element.empty?.();
  while (element.firstChild) element.removeChild(element.firstChild);
}

function el(parent, tag, options = {}) {
  const node = parent.createEl(tag, { cls: options.cls, text: options.text });
  if (options.attr) for (const [key, value] of Object.entries(options.attr)) node.setAttribute(key, String(value));
  return node;
}

function button(parent, label, cls, handler) {
  const node = el(parent, "button", { cls, text: label, attr: { type: "button" } });
  node.addEventListener("click", handler);
  return node;
}

class CosmosHomepageView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.disposers = [];
    this.focusTimer = null;
    this.remaining = plugin.settings.focusMinutes * 60;
    this.running = false;
    this.selectedDay = localDay(new Date());
    this.currentBoard = "overview";
    this.refreshTimer = null;
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return VIEW_TITLE; }
  getIcon() { return ICON; }

  async onOpen() {
    this.contentEl.addClass("cosmos-homepage-view");
    this.registerVaultEvents();
    this.render();
  }

  async onClose() {
    this.stopTimer();
    if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
    for (const dispose of this.disposers.splice(0)) dispose();
    clear(this.contentEl);
  }

  registerVaultEvents() {
    const refresh = () => {
      if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
      this.refreshTimer = window.setTimeout(() => {
        this.refreshTimer = null;
        if (this.contentEl.isConnected !== false) this.render();
      }, 250);
    };
    for (const name of ["delete", "rename"]) {
      const ref = this.app.vault.on(name, refresh);
      this.disposers.push(() => this.app.vault.offref(ref));
    }
    const metadataRef = this.app.metadataCache.on("changed", refresh);
    this.disposers.push(() => this.app.metadataCache.offref(metadataRef));
  }

  async openPath(path, line = 0) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return new Notice("That note is no longer available.");
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file);
    if (line && leaf.view instanceof MarkdownView) leaf.view.editor.setCursor({ line, ch: 0 });
  }

  render() {
    const model = buildVaultModel(this.app, this.plugin.settings);
    const root = this.contentEl;
    clear(root);
    root.toggleClass("is-reduced-motion", this.plugin.settings.reduceMotion);

    const atmosphere = el(root, "div", { cls: "cosmos-atmosphere", attr: { "aria-hidden": "true" } });
    for (let index = 0; index < 3; index += 1) el(atmosphere, "i");

    const top = el(root, "header", { cls: "cosmos-topbar cosmos-rise" });
    const brand = el(top, "div", { cls: "cosmos-brand" });
    el(brand, "span", { cls: "cosmos-pulse" });
    el(brand, "strong", { text: "COSMOS" });
    const nav = el(top, "nav", { cls: "cosmos-nav", attr: { "aria-label": "Homepage sections" } });
    [["overview", "Overview"], ["focus", "Focus"], ["calendar", "Calendar"], ["atlas", "Atlas"]].forEach(([id, label], index) => {
      const item = button(nav, label, index ? "" : "is-active", () => this.switchBoard(root, id, item));
      item.dataset.board = id;
    });
    button(top, "Refresh", "cosmos-refresh", () => this.render()).setAttribute("aria-label", "Refresh homepage");

    const boards = el(root, "main", { cls: "cosmos-boards" });
    this.renderOverview(boards, model);
    this.renderFocus(boards, model);
    this.renderCalendar(boards, model);
    this.renderAtlas(boards, model);
    const currentTrigger = root.querySelector(`.cosmos-nav button[data-board="${this.currentBoard}"]`)
      || root.querySelector('.cosmos-nav button[data-board="overview"]');
    this.switchBoard(root, currentTrigger?.dataset?.board || "overview", currentTrigger);
  }

  switchBoard(root, id, trigger) {
    this.currentBoard = id;
    for (const board of root.querySelectorAll(".cosmos-board")) board.toggleClass("is-active", board.dataset.board === id);
    for (const item of root.querySelectorAll(".cosmos-nav button")) {
      const active = item === trigger;
      item.toggleClass("is-active", active);
      item.setAttribute("aria-pressed", String(active));
    }
  }

  board(parent, id, active = false) {
    const board = el(parent, "section", { cls: `cosmos-board${active ? " is-active" : ""}` });
    board.dataset.board = id;
    return board;
  }

  panel(parent, title, tag, extra = "") {
    const panel = el(parent, "section", { cls: `cosmos-panel ${extra}`.trim() });
    const head = el(panel, "header", { cls: "cosmos-panel-head" });
    el(head, "h2", { text: title });
    el(head, "span", { text: tag });
    return panel;
  }

  renderOverview(parent, model) {
    const board = this.board(parent, "overview", true);
    const hero = el(board, "section", { cls: "cosmos-hero cosmos-rise" });
    const mast = el(hero, "div", { cls: "cosmos-masthead" });
    el(mast, "small", { text: "PERSONAL KNOWLEDGE ORBIT" });
    el(mast, "h1", { text: this.plugin.settings.homepageTitle });
    el(mast, "p", { text: "Recent notes, unfinished work, and living themes—drawn only from your vault." });
    const metrics = el(hero, "div", { cls: "cosmos-metrics" });
    [[model.totalNotes, "Notes"], [model.todayCount, "Today"], [model.weekCount, "This week"], [model.openTasks, "Open tasks"]]
      .forEach(([value, label]) => {
        const metric = el(metrics, "div", { cls: "cosmos-metric" });
        el(metric, "strong", { text: String(value) });
        el(metric, "span", { text: label });
      });

    const grid = el(board, "div", { cls: "cosmos-grid" });
    const recent = this.panel(grid, "Recent signals", `${model.recent.length} NOTES`, "cosmos-span-7");
    const list = el(recent, "div", { cls: "cosmos-list" });
    if (!model.recent.length) this.empty(list, "No notes yet", "Create a Markdown note and it will appear here.");
    for (const note of model.recent) {
      const item = button(list, note.title, "cosmos-list-item", () => this.openPath(note.path));
      el(item, "span", { text: note.folder });
    }

    const tasks = this.panel(grid, "Mission control", `${model.openTasks} OPEN`, "cosmos-span-5");
    const taskList = el(tasks, "div", { cls: "cosmos-list" });
    if (!model.tasks.length) this.empty(taskList, "Orbit is clear", "Unfinished Markdown tasks will appear here.");
    for (const task of model.tasks) {
      const item = button(taskList, task.path.split("/").pop().replace(/\.md$/i, ""), "cosmos-task", () => this.openPath(task.path, task.line));
      el(item, "span", { text: `Line ${task.line + 1}` });
    }
  }

  renderFocus(parent, model) {
    const board = this.board(parent, "focus");
    const intro = el(board, "header", { cls: "cosmos-section-intro" });
    el(intro, "small", { text: "ORBIT WINDOW · FOCUS" });
    el(intro, "h1", { text: "Lock one signal. Keep the orbit." });
    const panel = this.panel(board, "Focus timer", "LOCAL · NO TRACKING", "cosmos-focus-panel");
    const ring = el(panel, "div", { cls: "cosmos-focus-ring" });
    el(ring, "span", { cls: "cosmos-planet" });
    this.timerText = el(ring, "strong", { text: this.formatTime() });
    this.timerState = el(ring, "small", { text: "STANDBY" });
    const actions = el(panel, "div", { cls: "cosmos-actions" });
    this.timerButton = button(actions, "Start focus", "mod-cta", () => this.toggleTimer());
    button(actions, "Reset", "", () => this.resetTimer());
    const recent = el(panel, "div", { cls: "cosmos-focus-notes" });
    el(recent, "h3", { text: "Choose a note to work on" });
    for (const note of model.recent.slice(0, 5)) button(recent, note.title, "cosmos-chip", () => this.openPath(note.path));
  }

  formatTime() {
    const minutes = String(Math.floor(this.remaining / 60)).padStart(2, "0");
    const seconds = String(this.remaining % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  }

  updateTimer() {
    this.timerText?.setText(this.formatTime());
    this.timerState?.setText(this.running ? "TRACKING" : "STANDBY");
    this.timerButton?.setText(this.running ? "Pause focus" : "Start focus");
  }

  toggleTimer() {
    if (this.running) return this.stopTimer();
    this.running = true;
    this.focusTimer = window.setInterval(() => {
      this.remaining = Math.max(0, this.remaining - 1);
      if (!this.remaining) {
        this.stopTimer();
        new Notice("Focus orbit complete.");
      }
      this.updateTimer();
    }, 1000);
    this.updateTimer();
  }

  stopTimer() {
    if (this.focusTimer) window.clearInterval(this.focusTimer);
    this.focusTimer = null;
    this.running = false;
    this.updateTimer();
  }

  resetTimer() {
    this.stopTimer();
    this.remaining = this.plugin.settings.focusMinutes * 60;
    this.updateTimer();
  }

  renderCalendar(parent, model) {
    const board = this.board(parent, "calendar");
    const intro = el(board, "header", { cls: "cosmos-section-intro" });
    el(intro, "small", { text: "ALMANAC · VAULT ACTIVITY" });
    el(intro, "h1", { text: "See when your vault came alive." });
    const layout = el(board, "div", { cls: "cosmos-calendar-layout" });
    const calendar = this.panel(layout, "Activity calendar", "CREATION METADATA");
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const grid = el(calendar, "div", { cls: "cosmos-calendar" });
    ["S", "M", "T", "W", "T", "F", "S"].forEach((day) => el(grid, "span", { cls: "cosmos-weekday", text: day }));
    for (let index = 0; index < first.getDay(); index += 1) el(grid, "span", { cls: "is-blank" });
    for (let day = 1; day <= last.getDate(); day += 1) {
      const date = new Date(now.getFullYear(), now.getMonth(), day);
      const iso = localDay(date);
      const count = model.activities.get(iso)?.length || 0;
      const item = button(grid, String(day), `cosmos-day${count ? " has-activity" : ""}${this.selectedDay === iso ? " is-selected" : ""}`, () => {
        this.selectedDay = iso;
        this.render();
        const navItem = this.contentEl.querySelector('[data-board="calendar"]');
        this.switchBoard(this.contentEl, "calendar", navItem);
      });
      item.setAttribute("aria-label", `${iso}: ${count} created notes`);
      if (count) el(item, "b", { text: String(count) });
    }
    const detail = this.panel(layout, "Daily log", this.selectedDay, "cosmos-day-log");
    const entries = model.activities.get(this.selectedDay) || [];
    if (!entries.length) this.empty(detail, "No creation activity", "Choose a glowing date to inspect its notes.");
    for (const note of entries) button(detail, note.title, "cosmos-log-item", () => this.openPath(note.path));
  }

  renderAtlas(parent, model) {
    const board = this.board(parent, "atlas");
    const intro = el(board, "header", { cls: "cosmos-section-intro" });
    el(intro, "small", { text: "DEEP FIELD · KNOWLEDGE ATLAS" });
    el(intro, "h1", { text: "Themes become constellations." });
    const atlas = this.panel(board, "Tag systems", `${model.tags.length} SYSTEMS`, "cosmos-atlas");
    const field = el(atlas, "div", { cls: "cosmos-starfield" });
    if (!model.tags.length) this.empty(field, "No constellations yet", "Add tags to notes to form your first star systems.");
    const max = Math.max(1, ...model.tags.map((tag) => tag.count));
    model.tags.forEach((tag, index) => {
      const size = Math.min(4, Math.max(1, Math.ceil((tag.count / max) * 4)));
      const star = button(field, "", `cosmos-star is-pos-${(index % 12) + 1} is-size-${size}`, () => this.openPath(tag.path));
      el(star, "i");
      el(star, "strong", { text: tag.name });
      el(star, "span", { text: `${tag.count} notes` });
    });
  }

  empty(parent, title, detail) {
    const state = el(parent, "div", { cls: "cosmos-empty" });
    el(state, "span", { text: "✦" });
    el(state, "strong", { text: title });
    el(state, "small", { text: detail });
  }
}

class CosmosSettingTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }

  getSettingDefinitions() {
    return [
      { name: "Homepage headline", desc: "The large sentence shown on the overview.", control: { type: "text", key: "homepageTitle" } },
      { name: "Open on startup", desc: "Open the homepage after Obsidian finishes restoring the workspace.", control: { type: "toggle", key: "openOnStartup" } },
      { name: "Focus duration", desc: "Minutes in a focus orbit (5–120).", control: { type: "number", key: "focusMinutes", min: 5, max: 120 } },
      { name: "Excluded folders", desc: "Comma-separated folder paths that the homepage must not index.", control: { type: "textarea", key: "excludedFolders", rows: 3 } },
      { name: "Reduce motion", desc: "Disable decorative movement while keeping all information available.", control: { type: "toggle", key: "reduceMotion" } },
    ];
  }

  getControlValue(key) {
    if (key === "excludedFolders") return this.plugin.settings.excludedFolders.join(", ");
    return this.plugin.settings[key];
  }

  async setControlValue(key, value) {
    const next = key === "excludedFolders" ? String(value).split(",") : value;
    await this.plugin.updateSettings({ [key]: next });
  }
}

export default class CosmosHomepagePlugin extends Plugin {
  async onload() {
    this.settings = normalizeSettings({ ...DEFAULT_SETTINGS, ...(await this.loadData()) });
    this.registerView(VIEW_TYPE, (leaf) => new CosmosHomepageView(leaf, this));
    this.addRibbonIcon(ICON, "Open cosmos homepage", () => this.activateView());
    this.addCommand({ id: "open-homepage", name: "Open homepage", callback: () => this.activateView() });
    this.addSettingTab(new CosmosSettingTab(this.app, this));
    this.app.workspace.onLayoutReady(() => {
      if (this.settings.openOnStartup && !this.app.workspace.getLeavesOfType(VIEW_TYPE).length) this.activateView();
    });
  }

  async activateView() {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    this.app.workspace.revealLeaf(leaf);
  }

  async updateSettings(patch) {
    this.settings = normalizeSettings({ ...this.settings, ...patch });
    await this.saveData(this.settings);
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      const view = leaf.view;
      if (view && !view.running) view.remaining = this.settings.focusMinutes * 60;
      view?.render?.();
    }
  }
};
