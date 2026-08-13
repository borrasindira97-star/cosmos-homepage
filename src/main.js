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

export class CosmosHomepageView extends ItemView {
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
    this.clockTimer = null;
    this.pointerHandler = null;
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return VIEW_TITLE; }
  getIcon() { return ICON; }

  async onOpen() {
    this.contentEl.addClass("cosmos-homepage-view");
    this.startPointerGlow();
    this.registerVaultEvents();
    this.render();
  }

  async onClose() {
    this.stopTimer();
    if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
    if (this.clockTimer) window.clearInterval(this.clockTimer);
    this.refreshTimer = null;
    this.clockTimer = null;
    if (this.pointerHandler) this.contentEl.removeEventListener("pointermove", this.pointerHandler);
    this.pointerHandler = null;
    this.contentEl.style.removeProperty("--cosmos-pointer-x");
    this.contentEl.style.removeProperty("--cosmos-pointer-y");
    for (const dispose of this.disposers.splice(0)) dispose();
    clear(this.contentEl);
  }

  startPointerGlow() {
    if (this.pointerHandler) return;
    this.pointerHandler = (event) => {
      const bounds = this.contentEl.getBoundingClientRect();
      this.contentEl.style.setProperty("--cosmos-pointer-x", `${event.clientX - bounds.left}px`);
      this.contentEl.style.setProperty("--cosmos-pointer-y", `${event.clientY - bounds.top}px`);
    };
    this.contentEl.addEventListener("pointermove", this.pointerHandler, { passive: true });
  }

  updateClock() {
    const now = new Date();
    this.clockTime?.setText(now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }));
    this.clockDate?.setText(now.toLocaleDateString("en-US", { month: "short", day: "2-digit", weekday: "short" }).toUpperCase());
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
    if (!(file instanceof TFile) && !(file?.path?.endsWith?.(".md"))) return new Notice("That note is no longer available.");
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
    const clock = el(top, "div", { cls: "cosmos-live-clock", attr: { "aria-label": "Local time" } });
    this.clockTime = el(clock, "b");
    this.clockDate = el(clock, "span");
    this.updateClock();
    if (!this.clockTimer) this.clockTimer = window.setInterval(() => this.updateClock(), 1000);
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
    const hero = el(board, "section", { cls: "cosmos-edition-hero cosmos-rise" });
    const mast = el(hero, "div", { cls: "cosmos-edition-mast" });
    const eyebrow = el(mast, "small", { text: "COSMOS EDITION · PERSONAL VAULT" });
    el(eyebrow, "i");
    el(mast, "h1", { text: this.plugin.settings.homepageTitle });
    const orbit = el(mast, "div", { cls: "cosmos-edition-orbit" });
    el(orbit, "span", { text: "TONIGHT" });
    const lines = el(orbit, "div");
    el(lines, "p", { text: model.openTasks ? `${model.openTasks} unfinished signals are waiting for a decision.` : "Your orbit is clear. Start with a recent signal." });
    el(lines, "p", { text: `${model.todayCount} notes entered orbit today · ${model.weekCount} this week.` });

    const archive = el(hero, "div", { cls: "cosmos-edition-archive" });
    el(archive, "small", { text: "DEEP FIELD · ANNOTATED" });
    [["galaxy", model.totalNotes, "NOTES · GALAXY"], ["planet", model.tags.length, "THEMES · PLANET"], ["cluster", model.todayCount, "TODAY · CLUSTER"], ["comet", model.openTasks, "OPEN · COMET"]]
      .forEach(([kind, value, label]) => {
        const object = el(archive, "div", { cls: `cosmos-edition-object is-${kind}` });
        el(object, "i");
        el(object, "b", { text: String(value) });
        el(object, "span", { text: label });
      });

    const grid = el(board, "div", { cls: "cosmos-edition-grid" });
    this.renderEditionAtlas(grid, model);
    this.renderEditionDecisions(grid, model);
    this.renderEditionMission(grid, model);
    this.renderEditionBelt(grid, model);
  }

  renderEditionAtlas(parent, model) {
    const panel = this.panel(parent, "Knowledge constellation", `${model.totalNotes} STARS · ${model.systems.length} SYSTEMS`, "cosmos-edition-atlas");
    const field = el(panel, "div", { cls: "cosmos-edition-constellation" });
    if (!model.systems.length) return this.empty(field, "No constellations yet", "Add tags to notes to form your first star systems.");
    model.systems.forEach((system, index) => {
      const star = button(field, "", `cosmos-edition-system is-pos-${index + 1} is-${system.status}`, () => this.openPath(system.path));
      el(star, "i", { cls: "cosmos-edition-sun" });
      for (let count = 0; count < Math.min(7, system.count); count += 1) el(star, "i", { cls: `cosmos-edition-satellite is-s${count + 1}` });
      el(star, "strong", { text: system.name });
      el(star, "span", { text: `${system.count} notes` });
    });
    const legend = el(panel, "footer", { cls: "cosmos-edition-legend" });
    [["provisional", "Growing"], ["concluded", "Established"], ["open", "Open"]].forEach(([status, label]) => el(legend, "span", { cls: `is-${status}`, text: label }));
  }

  renderEditionDecisions(parent, model) {
    const panel = this.panel(parent, "Awaiting decision", `${model.tasks.length} PENDING`, "cosmos-edition-decisions");
    for (let index = 0; index < 5; index += 1) el(panel, "i", { cls: `cosmos-edition-meteor is-m${index + 1}` });
    const deck = el(panel, "div", { cls: "cosmos-edition-deck" });
    if (!model.tasks.length) return this.empty(deck, "Nothing is waiting", "ALL CLEAR");
    model.tasks.slice(0, 3).forEach((task, index) => {
      const card = el(deck, "article", { cls: `cosmos-edition-card is-depth-${index}` });
      el(card, "i", { cls: "cosmos-edition-moon" });
      el(card, "small", { text: "OPEN MARKDOWN TASK" });
      el(card, "h3", { text: task.text || task.path.split("/").pop().replace(/\.md$/i, "") });
      el(card, "p", { text: `${task.path} · line ${task.line + 1}` });
      button(card, "Open source →", "cosmos-edition-primary", () => this.openPath(task.path, task.line));
    });
  }

  renderEditionMission(parent, model) {
    const panel = this.panel(parent, "Launch control", "MISSION CONTROL · GO/NO-GO", "cosmos-edition-mission-panel");
    const stage = el(panel, "div", { cls: "cosmos-edition-mission" });
    const pad = el(stage, "div", { cls: "cosmos-edition-pad" });
    el(pad, "i", { cls: "rail" }); el(pad, "i", { cls: "tower" });
    const rocket = el(pad, "div", { cls: "cosmos-edition-rocket" });
    for (const cls of ["nose", "body", "window", "fin-left", "fin-right", "flame"]) el(rocket, "i", { cls });
    const body = el(stage, "div", { cls: "cosmos-edition-mission-body" });
    const time = el(body, "div", { cls: "cosmos-edition-time" });
    this.editionTimerText = el(time, "b", { text: this.formatTime() }); el(time, "span", { text: "T-MINUS · FOCUS ORBIT" });
    el(body, "h3", { text: model.recent[0]?.title || "Choose tonight's launch window" });
    const checklist = el(body, "div", { cls: "cosmos-edition-checklist" });
    const candidates = model.tasks.slice(0, 3);
    const rows = [];
    const syncLaunchState = () => rocket.classList.toggle("is-ready", rows.length > 0 && rows.every(({ row }) => row.classList.contains("is-go")));
    if (!candidates.length) el(checklist, "p", { text: "All systems clear" });
    candidates.forEach((task) => {
      let status;
      const row = button(checklist, "", "cosmos-edition-check", () => {
        const ready = !row.classList.contains("is-go");
        row.classList.toggle("is-go", ready);
        status.setText(ready ? "GO" : "NO-GO");
        syncLaunchState();
      });
      el(row, "i");
      el(row, "span", { text: task.text || task.path.split("/").pop().replace(/\.md$/i, "") });
      status = el(row, "b", { text: "NO-GO" });
      rows.push({ row, status });
    });
    this.editionTimerButton = button(body, this.running ? "Pause focus" : "Start focus", "cosmos-edition-launch", () => this.toggleTimer());
  }

  renderEditionBelt(parent, model) {
    const panel = this.panel(parent, "Signal belt", `DEBRIS BELT · ${model.recent.length} ROCKS`, "cosmos-edition-belt-panel");
    const viewport = el(panel, "div", { cls: "cosmos-edition-belt-viewport" });
    const belt = el(viewport, "div", { cls: "cosmos-edition-belt" });
    if (!model.recent.length) return this.empty(viewport, "No new signals", "New and recently changed notes will enter this orbit.");
    for (let repeat = 0; repeat < 2; repeat += 1) model.recent.forEach((note, index) => {
      const rock = button(belt, "", `cosmos-edition-rock is-tone-${index % 5} is-size-${index % 4}`, () => this.openPath(note.path));
      el(rock, "i"); el(rock, "strong", { text: note.title }); el(rock, "span", { text: note.folder });
    });
    const foot = el(panel, "footer", { cls: "cosmos-edition-belt-foot" });
    el(foot, "span", { text: "MAIN BELT · LOCAL NOTES" }); el(foot, "span", { text: "SELECT A ROCK TO OPEN" });
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
    this.editionTimerText?.setText(this.formatTime());
    this.timerState?.setText(this.running ? "TRACKING" : "STANDBY");
    this.timerButton?.setText(this.running ? "Pause focus" : "Start focus");
    this.editionTimerButton?.setText(this.running ? "Pause focus" : "Start focus");
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
