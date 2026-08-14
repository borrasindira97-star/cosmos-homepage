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

function monthStart(value) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

export class CosmosHomepageView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.disposers = [];
    this.focusTimer = null;
    this.remaining = plugin.settings.focusMinutes * 60;
    this.running = false;
    this.sessionEnded = false;
    this.focusTarget = null;
    this.selectedDay = localDay(new Date());
    this.calendarMonth = monthStart(new Date());
    this.currentBoard = "overview";
    this.activeTheme = null;
    this.themeTrigger = null;
    this.themeDrawerEl = null;
    this.lastModel = null;
    this.sourceLeaf = null;
    this.refreshTimer = null;
    this.clockTimer = null;
    this.pointerHandler = null;
    this.keyHandler = null;
    this.closed = false;
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return VIEW_TITLE; }
  getIcon() { return ICON; }

  async onOpen() {
    this.closed = false;
    this.contentEl.addClass("cosmos-homepage-view");
    this.startPointerGlow();
    this.keyHandler = (event) => {
      if (event.key === "Escape" && this.activeTheme) this.closeTheme();
    };
    this.contentEl.addEventListener("keydown", this.keyHandler);
    this.registerVaultEvents();
    this.render();
  }

  async onClose() {
    this.closed = true;
    this.stopTimer();
    if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
    if (this.clockTimer) window.clearInterval(this.clockTimer);
    this.refreshTimer = null;
    this.clockTimer = null;
    if (this.pointerHandler) this.contentEl.removeEventListener("pointermove", this.pointerHandler);
    this.pointerHandler = null;
    if (this.keyHandler) this.contentEl.removeEventListener("keydown", this.keyHandler);
    this.keyHandler = null;
    this.contentEl.style.removeProperty("--cosmos-pointer-x");
    this.contentEl.style.removeProperty("--cosmos-pointer-y");
    for (const dispose of this.disposers.splice(0)) dispose();
    this.sourceLeaf = null;
    this.activeTheme = null;
    this.themeTrigger = null;
    this.themeDrawerEl = null;
    this.lastModel = null;
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
        if (!this.closed && this.contentEl.isConnected !== false) this.render();
      }, 250);
    };
    for (const name of ["delete", "rename"]) {
      const ref = this.app.vault.on(name, refresh);
      this.disposers.push(() => this.app.vault.offref(ref));
    }
    const metadataRef = this.app.metadataCache.on("changed", refresh);
    this.disposers.push(() => this.app.metadataCache.offref(metadataRef));
  }

  getSourceLeaf() {
    if (this.sourceLeaf?.view && this.sourceLeaf.view.containerEl?.isConnected !== false) return this.sourceLeaf;
    this.sourceLeaf = this.app.workspace.getLeaf("tab");
    return this.sourceLeaf;
  }

  async openPath(path, line = null) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) && !(file?.path?.endsWith?.(".md"))) return new Notice("That note is no longer available.");
    const leaf = this.getSourceLeaf();
    await leaf.openFile(file);
    if (Number.isInteger(line) && leaf.view instanceof MarkdownView) leaf.view.editor.setCursor({ line, ch: 0 });
  }

  render() {
    const model = buildVaultModel(this.app, this.plugin.settings);
    this.lastModel = model;
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
    [["overview", "Overview"], ["focus", "Focus"], ["calendar", "Calendar"], ["atlas", "Atlas"]].forEach(([id, label]) => {
      const item = button(nav, label, "", () => this.switchBoard(root, id, item));
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
    this.updateTimer();
    this.updateMission();
    if (this.activeTheme) this.mountThemeDrawer(model);
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
    el(lines, "p", { text: model.openTasks ? `${model.openTasks} open Markdown tasks in your vault.` : "No open Markdown tasks. Your orbit is clear." });
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

    if (!model.totalNotes) this.renderWelcome(board);
    const grid = el(board, "div", { cls: "cosmos-edition-grid" });
    this.renderEditionAtlas(grid, model);
    this.renderEditionTasks(grid, model);
    this.renderEditionMission(grid, model);
    this.renderEditionBelt(grid, model);
  }

  renderWelcome(parent) {
    const panel = this.panel(parent, "Welcome to Cosmos", "FIRST RUN · NOTHING WRITTEN", "cosmos-welcome");
    el(panel, "p", { cls: "cosmos-welcome-lead", text: "Cosmos only reads what Obsidian has already indexed. As your vault grows, each surface comes alive on its own:" });
    const list = el(panel, "ul", { cls: "cosmos-welcome-list" });
    [
      ["Add tags to notes", "and they gather into constellations on the atlas and overview."],
      ["Leave Markdown tasks unfinished", "and they appear under Open tasks with a link to the exact source line."],
      ["Create notes", "and their days light up on the creation calendar."],
      ["Edit notes", "and the most recently modified ones drift through the signal belt."],
      ["Adjust Excluded folders", "in the plugin settings whenever a folder should stay out of the homepage."],
    ].forEach(([lead, rest]) => {
      const item = el(list, "li");
      el(item, "strong", { text: lead });
      el(item, "span", { text: ` ${rest}` });
    });
  }

  renderEditionAtlas(parent, model) {
    const panel = this.panel(parent, "Knowledge constellation", `${model.totalNotes} STARS · ${model.systems.length} SYSTEMS`, "cosmos-edition-atlas");
    const field = el(panel, "div", { cls: "cosmos-edition-constellation" });
    if (!model.systems.length) return this.empty(field, "No constellations yet", "Add tags to notes to form your first star systems.");
    model.systems.forEach((system, index) => {
      const star = button(field, "", `cosmos-edition-system is-pos-${index + 1} is-tone-${index % 3}`, () => this.openTheme(system.name, star));
      star.dataset.theme = system.name;
      star.setAttribute("aria-label", `Theme ${system.name}: ${system.count} notes, last edited ${localDay(system.lastModified) || "unknown"}`);
      el(star, "i", { cls: "cosmos-edition-sun" });
      for (let count = 0; count < Math.min(7, system.count); count += 1) el(star, "i", { cls: `cosmos-edition-satellite is-s${count + 1}` });
      el(star, "strong", { text: system.name });
      el(star, "span", { text: `${system.count} notes` });
      el(star, "span", { cls: "cosmos-system-activity", text: system.lastModified ? `edited ${localDay(system.lastModified)}` : "" });
    });
  }

  renderEditionTasks(parent, model) {
    const panel = this.panel(parent, "Open tasks", `${model.openTasks} UNFINISHED MARKDOWN TASKS`, "cosmos-edition-decisions");
    for (let index = 0; index < 5; index += 1) el(panel, "i", { cls: `cosmos-edition-meteor is-m${index + 1}` });
    const deck = el(panel, "div", { cls: "cosmos-edition-deck" });
    if (!model.tasks.length) return this.empty(deck, "No open tasks", "Unfinished Markdown tasks will appear here.");
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
    const panel = this.panel(parent, "Launch control", "SESSION-LOCAL · NO WRITE-BACK", "cosmos-edition-mission-panel");
    const stage = el(panel, "div", { cls: "cosmos-edition-mission" });
    const pad = el(stage, "div", { cls: "cosmos-edition-pad" });
    el(pad, "i", { cls: "rail" }); el(pad, "i", { cls: "tower" });
    this.missionRocket = el(pad, "div", { cls: "cosmos-edition-rocket" });
    for (const cls of ["nose", "body", "window", "fin-left", "fin-right", "flame"]) el(this.missionRocket, "i", { cls });
    const body = el(stage, "div", { cls: "cosmos-edition-mission-body" });
    const time = el(body, "div", { cls: "cosmos-edition-time" });
    this.editionTimerText = el(time, "b", { text: this.formatTime() });
    el(time, "span", { text: `${this.plugin.settings.focusMinutes}-MINUTE ORBIT · SESSION-LOCAL` });
    this.missionTargetLabel = el(body, "h3", { text: this.focusTarget?.title || "Select a focus target" });
    const targets = el(body, "div", { cls: "cosmos-edition-targets" });
    const candidates = model.recent.slice(0, 4);
    if (!candidates.length) el(targets, "p", { text: "Create or edit a note and it will appear here as a focus target." });
    for (const note of candidates) {
      button(targets, note.title, `cosmos-chip${this.focusTarget?.path === note.path ? " is-selected" : ""}`, () => this.selectFocusTarget(note))
        .setAttribute("aria-pressed", String(this.focusTarget?.path === note.path));
    }
    const actions = el(body, "div", { cls: "cosmos-edition-actions" });
    this.editionTimerButton = button(actions, this.running ? "Pause" : "Start", "cosmos-edition-launch", () => this.toggleTimer());
    button(actions, "Reset", "", () => this.resetTimer());
    this.editionOpenButton = button(actions, "Open target", "", () => {
      if (this.focusTarget) this.openPath(this.focusTarget.path);
    });
  }

  renderEditionBelt(parent, model) {
    const panel = this.panel(parent, "Signal belt", `RECENTLY MODIFIED · ${model.recent.length} NOTES`, "cosmos-edition-belt-panel");
    const viewport = el(panel, "div", { cls: "cosmos-edition-belt-viewport" });
    const belt = el(viewport, "div", { cls: "cosmos-edition-belt" });
    if (!model.recent.length) return this.empty(viewport, "No new signals", "Recently modified notes will enter this orbit.");
    for (let repeat = 0; repeat < 2; repeat += 1) model.recent.forEach((note, index) => {
      const rock = button(belt, "", `cosmos-edition-rock is-tone-${index % 5} is-size-${index % 4}`, () => this.openPath(note.path));
      if (repeat) {
        rock.setAttribute("aria-hidden", "true");
        rock.setAttribute("tabindex", "-1");
      }
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
    const panel = this.panel(board, "Focus timer", "SESSION-LOCAL · NO WRITE-BACK", "cosmos-focus-panel");
    const ring = el(panel, "div", { cls: "cosmos-focus-ring" });
    el(ring, "span", { cls: "cosmos-planet" });
    this.timerText = el(ring, "strong", { text: this.formatTime() });
    this.timerState = el(ring, "small", { text: "STANDBY" });
    el(panel, "p", { cls: "cosmos-focus-duration", text: `${this.plugin.settings.focusMinutes}-minute orbit · session-local, nothing is written to your notes` });
    const actions = el(panel, "div", { cls: "cosmos-actions" });
    this.timerButton = button(actions, "Start focus", "mod-cta", () => this.toggleTimer());
    button(actions, "Reset", "", () => this.resetTimer());
    this.focusOpenButton = button(actions, "Open target", "", () => {
      if (this.focusTarget) this.openPath(this.focusTarget.path);
    });
    const recent = el(panel, "div", { cls: "cosmos-focus-notes" });
    el(recent, "h3", { text: "Choose a focus target" });
    if (!model.recent.length) return this.empty(recent, "No notes yet", "Create or edit a note and it will appear here as a focus target.");
    for (const note of model.recent.slice(0, 5)) {
      button(recent, note.title, `cosmos-chip${this.focusTarget?.path === note.path ? " is-selected" : ""}`, () => this.selectFocusTarget(note))
        .setAttribute("aria-pressed", String(this.focusTarget?.path === note.path));
    }
  }

  selectFocusTarget(note) {
    this.focusTarget = { path: note.path, title: note.title };
    this.sessionEnded = false;
    if (!this.running) this.remaining = this.plugin.settings.focusMinutes * 60;
    this.updateTimer();
    this.updateMission();
  }

  formatTime() {
    const minutes = String(Math.floor(this.remaining / 60)).padStart(2, "0");
    const seconds = String(this.remaining % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  }

  updateTimer() {
    const full = this.plugin.settings.focusMinutes * 60;
    this.timerText?.setText(this.formatTime());
    this.editionTimerText?.setText(this.formatTime());
    this.timerState?.setText(this.running ? "TRACKING" : this.remaining < full ? "PAUSED" : "STANDBY");
    this.timerButton?.setText(this.running ? "Pause focus" : "Start focus");
    this.editionTimerButton?.setText(this.running ? "Pause" : "Start");
    if (this.timerButton) this.timerButton.disabled = !this.focusTarget;
    if (this.editionTimerButton) this.editionTimerButton.disabled = !this.focusTarget;
  }

  updateMission() {
    const rocketState = this.running ? "is-launched"
      : this.sessionEnded ? "is-complete"
        : this.remaining < this.plugin.settings.focusMinutes * 60 ? "is-paused"
          : this.focusTarget ? "is-armed" : "";
    if (this.missionRocket) {
      this.missionRocket.classList.remove("is-armed", "is-launched", "is-paused", "is-complete");
      if (rocketState) this.missionRocket.classList.add(rocketState);
    }
    this.missionTargetLabel?.setText(this.focusTarget?.title || "Select a focus target");
    if (this.editionOpenButton) this.editionOpenButton.disabled = !this.focusTarget;
    if (this.focusOpenButton) this.focusOpenButton.disabled = !this.focusTarget;
  }

  toggleTimer() {
    if (this.running) return this.pauseTimer();
    if (!this.focusTarget) return;
    if (this.sessionEnded || this.remaining <= 0) this.remaining = this.plugin.settings.focusMinutes * 60;
    this.running = true;
    this.sessionEnded = false;
    this.focusTimer = window.setInterval(() => {
      this.remaining = Math.max(0, this.remaining - 1);
      if (!this.remaining) {
        this.pauseTimer();
        this.sessionEnded = true;
        new Notice("Focus orbit complete.");
      }
      this.updateTimer();
      this.updateMission();
    }, 1000);
    this.updateTimer();
    this.updateMission();
  }

  pauseTimer() {
    if (this.focusTimer) window.clearInterval(this.focusTimer);
    this.focusTimer = null;
    this.running = false;
    this.updateTimer();
    this.updateMission();
  }

  stopTimer() {
    if (this.focusTimer) window.clearInterval(this.focusTimer);
    this.focusTimer = null;
    this.running = false;
  }

  resetTimer() {
    this.stopTimer();
    this.sessionEnded = false;
    this.remaining = this.plugin.settings.focusMinutes * 60;
    this.updateTimer();
    this.updateMission();
  }

  openTheme(name, trigger) {
    this.activeTheme = name;
    this.themeTrigger = trigger;
    this.mountThemeDrawer(this.lastModel);
  }

  closeTheme() {
    const name = this.activeTheme;
    const trigger = this.themeTrigger;
    this.activeTheme = null;
    if (this.themeDrawerEl) this.themeDrawerEl.remove();
    this.themeDrawerEl = null;
    this.themeTrigger = null;
    const currentTrigger = trigger?.isConnected ? trigger
      : [...this.contentEl.querySelectorAll("button[data-theme]")].find((item) => item.dataset.theme === name);
    currentTrigger?.focus();
  }

  mountThemeDrawer(model) {
    if (this.themeDrawerEl) this.themeDrawerEl.remove();
    this.themeDrawerEl = null;
    if (!this.activeTheme) return;
    const notes = model?.tagNotes?.get(this.activeTheme) || [];
    const drawer = el(this.contentEl, "aside", {
      cls: "cosmos-theme-drawer",
      attr: { role: "dialog", "aria-modal": "true", "aria-label": `Theme ${this.activeTheme}`, tabindex: "-1" },
    });
    const head = el(drawer, "header", { cls: "cosmos-theme-head" });
    const title = el(head, "div");
    el(title, "h2", { text: `#${this.activeTheme}` });
    el(title, "span", { text: `${notes.length} notes · sorted by last edit` });
    const closeButton = button(head, "Close", "cosmos-theme-close", () => this.closeTheme());
    closeButton.setAttribute("aria-label", "Close theme panel");
    this.themeDrawerEl = drawer;
    closeButton.focus();
    if (!notes.length) {
      return this.empty(drawer, "No indexed notes for this tag", "Once Obsidian indexes a note with this tag it will appear here.");
    }
    const list = el(drawer, "div", { cls: "cosmos-theme-list" });
    for (const note of notes) {
      const item = button(list, "", "cosmos-theme-item", () => this.openPath(note.path));
      el(item, "strong", { text: note.title });
      el(item, "span", { text: `${note.folder} · edited ${localDay(note.modified) || "unknown"}` });
    }
  }

  shiftMonth(delta) {
    this.calendarMonth = new Date(this.calendarMonth.getFullYear(), this.calendarMonth.getMonth() + delta, 1);
    this.render();
  }

  resetMonth() {
    this.calendarMonth = monthStart(new Date());
    this.selectedDay = localDay(new Date());
    this.render();
  }

  renderCalendar(parent, model) {
    const board = this.board(parent, "calendar");
    const intro = el(board, "header", { cls: "cosmos-section-intro" });
    el(intro, "small", { text: "ALMANAC · CREATED NOTES" });
    el(intro, "h1", { text: "See when your vault came alive." });
    const layout = el(board, "div", { cls: "cosmos-calendar-layout" });
    const calendar = this.panel(layout, "Creation calendar", "CREATED · FRONTMATTER OR FILE TIME");
    const nav = el(calendar, "div", { cls: "cosmos-calendar-nav" });
    button(nav, "‹", "", () => this.shiftMonth(-1)).setAttribute("aria-label", "Previous month");
    el(nav, "strong", { text: this.calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" }) });
    button(nav, "›", "", () => this.shiftMonth(1)).setAttribute("aria-label", "Next month");
    button(nav, "This month", "", () => this.resetMonth());
    const first = this.calendarMonth;
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    const today = localDay(new Date());
    const grid = el(calendar, "div", { cls: "cosmos-calendar" });
    ["S", "M", "T", "W", "T", "F", "S"].forEach((day) => el(grid, "span", { cls: "cosmos-weekday", text: day }));
    for (let index = 0; index < first.getDay(); index += 1) el(grid, "span", { cls: "is-blank" });
    for (let day = 1; day <= last.getDate(); day += 1) {
      const date = new Date(first.getFullYear(), first.getMonth(), day);
      const iso = localDay(date);
      const count = model.activities.get(iso)?.length || 0;
      const item = button(grid, String(day), `cosmos-day${count ? " has-activity" : ""}${this.selectedDay === iso ? " is-selected" : ""}${today === iso ? " is-today" : ""}`, () => {
        this.selectedDay = iso;
        this.render();
      });
      item.setAttribute("aria-label", `${iso}: ${count} created notes`);
      if (count) el(item, "b", { text: String(count) });
    }
    const detail = this.panel(layout, "Daily log", this.selectedDay, "cosmos-day-log");
    const entries = model.activities.get(this.selectedDay) || [];
    if (!entries.length) this.empty(detail, "No notes created on this day", "Days with a glow and a count hold the notes created that day.");
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
      const star = button(field, "", `cosmos-star is-pos-${(index % 12) + 1} is-size-${size}`, () => this.openTheme(tag.name, star));
      star.dataset.theme = tag.name;
      star.setAttribute("aria-label", `Theme ${tag.name}: ${tag.count} notes, last edited ${localDay(tag.lastModified) || "unknown"}`);
      el(star, "i");
      el(star, "strong", { text: tag.name });
      el(star, "span", { text: `${tag.count} notes` });
      el(star, "span", { cls: "cosmos-system-activity", text: tag.lastModified ? `edited ${localDay(tag.lastModified)}` : "" });
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
      { name: "Focus duration", desc: "Minutes in a focus orbit (5–120).", control: { type: "number", key: "focusMinutes", min: 5, max: 120, step: 1 } },
      { name: "Excluded folders", desc: "Comma-separated folder paths that the homepage must not index.", control: { type: "textarea", key: "excludedFolders", rows: 3 } },
      { name: "Reduce motion", desc: "Disable decorative movement while keeping all information available.", control: { type: "toggle", key: "reduceMotion" } },
    ];
  }

  getControlValue(key) {
    const value = this.plugin.settings[key];
    return key === "excludedFolders" ? value.join(", ") : value;
  }

  async setControlValue(key, value) {
    const converted = key === "excludedFolders" ? String(value).split(",") : value;
    await this.plugin.updateSettings({ [key]: converted });
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
