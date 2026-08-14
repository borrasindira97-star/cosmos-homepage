import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { localDay, buildVaultModel } from "../src/model.js";
import { bootPlugin, openCosmosView, makeApp, fakeFile, sleep } from "./harness.mjs";

function daysAgo(base, days, hour = 9) {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() - days, hour, 0, 0).getTime();
}

function scenario() {
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  const files = [
    fakeFile("Notes/Alpha.md", { ctime: daysAgo(now, 0, 9), mtime: daysAgo(now, 0, 10) }),
    fakeFile("Notes/Beta.md", { ctime: daysAgo(now, 0, 11), mtime: daysAgo(now, 1, 10) }),
    fakeFile("Notes/Gamma.md", { ctime: daysAgo(now, 1, 9), mtime: daysAgo(now, 2, 10) }),
    fakeFile("Notes/Delta.md", { ctime: daysAgo(now, 3, 9), mtime: daysAgo(now, 0, 8) }),
  ];
  const caches = new Map([
    ["Notes/Alpha.md", {
      frontmatter: { title: "Alpha", tags: ["ai", "research"] },
      listItems: [{ task: " ", text: "Validate the launch plan", position: { start: { line: 4 } } }],
    }],
    ["Notes/Beta.md", { tags: [{ tag: "#ai" }] }],
    ["Notes/Gamma.md", { frontmatter: { tags: ["research"] } }],
  ]);
  return { files, caches, now };
}

async function bootView(persisted) {
  const { files, caches, now } = scenario();
  const app = makeApp(files, caches);
  const { plugin, CosmosHomepageView, stubs } = await bootPlugin(app, persisted);
  const { view, leaf } = await openCosmosView(plugin, CosmosHomepageView);
  return { app, plugin, view, leaf, now, stubs };
}

test("1. settings tab exposes all five controls through the declarative API", async () => {
  const app = makeApp();
  const { plugin } = await bootPlugin(app);
  const tab = plugin.settingTab;
  assert.equal(typeof tab.getSettingDefinitions, "function");
  assert.equal(tab.settingItems.length, 5);
  tab.display();
  const registry = tab.containerEl.settingsRegistry;
  assert.equal(registry.length, 5);
  assert.deepEqual(registry.map((setting) => setting.nameEl.textContent), [
    "Homepage headline", "Open on startup", "Focus duration", "Excluded folders", "Reduce motion",
  ]);
  assert.deepEqual(registry.map((setting) => setting.components[0].type), ["text", "toggle", "number", "textarea", "toggle"]);
  assert.equal(registry[0].components[0].value, "Your ideas have an orbit.");
  assert.equal(registry[1].components[0].value, false);
  assert.equal(registry[2].components[0].value, 25);
  assert.equal(registry[3].components[0].value, ".trash, Templates");
  assert.equal(registry[4].components[0].value, false);
});

test("2. declarative settings persist and excluded folders convert between text and arrays", async () => {
  const app = makeApp();
  const { plugin } = await bootPlugin(app);
  const tab = plugin.settingTab;
  tab.display();
  const controls = tab.containerEl.settingsRegistry.map((setting) => setting.components[0]);
  await controls[0].change("Ideas in orbit");
  await controls[1].change(true);
  await controls[2].change(45);
  await controls[3].change("Private, Archive");
  await controls[4].change(true);
  assert.deepEqual(JSON.parse(JSON.stringify(plugin._persisted)), {
    homepageTitle: "Ideas in orbit",
    openOnStartup: true,
    focusMinutes: 45,
    recentLimit: 8,
    activityLimit: 240,
    excludedFolders: ["Private", "Archive"],
    reduceMotion: true,
  });

  const restored = await bootPlugin(makeApp(), plugin._persisted);
  restored.plugin.settingTab.display();
  const restoredControls = restored.plugin.settingTab.containerEl.settingsRegistry.map((setting) => setting.components[0]);
  assert.equal(restoredControls[0].value, "Ideas in orbit");
  assert.equal(restoredControls[1].value, true);
  assert.equal(restoredControls[2].value, 45);
  assert.equal(restoredControls[3].value, "Private, Archive");
  assert.equal(restoredControls[4].value, true);
});

test("3. a running focus timer is never reset by a settings refresh", async (t) => {
  const { plugin, view } = await bootView();
  t.after(() => view.onClose());
  view.selectFocusTarget({ path: "Notes/Alpha.md", title: "Alpha" });
  view.toggleTimer();
  view.remaining = 1000;
  await plugin.updateSettings({ focusMinutes: 30 });
  assert.equal(view.running, true);
  assert.equal(view.remaining, 1000);
  assert.notEqual(view.focusTimer, null);
  await view.onClose();
});

test("4. opening a document keeps the Cosmos leaf intact", async (t) => {
  const { view, leaf } = await bootView();
  t.after(() => view.onClose());
  await view.openPath("Notes/Alpha.md");
  assert.equal(view.contentEl.isConnected, true);
  assert.equal(leaf.view, view);
  assert.notEqual(view.sourceLeaf, leaf);
  assert.equal(view.sourceLeaf.file.path, "Notes/Alpha.md");
  await view.onClose();
});

test("5. consecutive opens reuse one source leaf; closing it spawns exactly one new leaf", async (t) => {
  const { app, view } = await bootView();
  t.after(() => view.onClose());
  view.selectFocusTarget({ path: "Notes/Alpha.md", title: "Alpha" });
  view.toggleTimer();
  const timerBefore = view.focusTimer;
  const listenersBefore = view.disposers.length;
  await view.openPath("Notes/Alpha.md");
  await view.openPath("Notes/Beta.md");
  assert.equal(app.workspace.getLeafCalls.length, 1);
  assert.deepEqual(view.sourceLeaf.openedPaths, ["Notes/Alpha.md", "Notes/Beta.md"]);
  assert.equal(view.focusTimer, timerBefore);
  assert.equal(view.running, true);
  assert.equal(view.disposers.length, listenersBefore);

  view.sourceLeaf.detach();
  await view.openPath("Notes/Gamma.md");
  assert.equal(app.workspace.getLeafCalls.length, 2);
  assert.equal(view.sourceLeaf.file.path, "Notes/Gamma.md");
  assert.equal(view.contentEl.isConnected, true);
  await view.onClose();
});

test("6. opening a Markdown task lands the cursor on the exact source line", async (t) => {
  const { view } = await bootView();
  t.after(() => view.onClose());
  view.contentEl.querySelector(".cosmos-edition-card .cosmos-edition-primary").click();
  await sleep(0);
  assert.equal(view.sourceLeaf.file.path, "Notes/Alpha.md");
  assert.equal(view.sourceLeaf.view.editor.cursor.line, 4);
  assert.equal(view.sourceLeaf.view.editor.cursor.ch, 0);
  await view.onClose();
});

test("6b. an explicit task line zero positions the cursor while ordinary opens do not", async (t) => {
  const { view } = await bootView();
  t.after(() => view.onClose());
  await view.openPath("Notes/Alpha.md", 0);
  assert.equal(view.sourceLeaf.view.editor.cursor.line, 0);
  assert.equal(view.sourceLeaf.view.editor.cursor.ch, 0);
  await view.openPath("Notes/Beta.md");
  assert.equal(view.sourceLeaf.view.editor.cursor, null);
});

test("7. the atlas carries no random maturity status anywhere", async (t) => {
  const source = `${await readFile("src/main.js", "utf8")}\n${await readFile("src/model.js", "utf8")}`;
  assert.doesNotMatch(source, /provisional|concluded|Established|Growing/);
  assert.doesNotMatch(source, /index % 3 === 0/);
  const { files, caches, now } = scenario();
  const model = buildVaultModel(makeApp(files, caches), {}, now);
  assert.ok(model.systems.length > 0);
  for (const system of model.systems) {
    assert.ok(!("status" in system));
    assert.ok(Number.isFinite(system.lastModified));
  }
});

test("8. clicking a star opens the native theme panel and Escape closes it", async (t) => {
  const { view } = await bootView();
  t.after(() => view.onClose());
  const star = view.contentEl.querySelector(".cosmos-star");
  assert.equal(star.tagName, "BUTTON");
  star.click();
  const drawer = view.contentEl.querySelector(".cosmos-theme-drawer");
  assert.ok(drawer);
  assert.equal(drawer.getAttribute("role"), "dialog");
  assert.equal(drawer.getAttribute("aria-modal"), "true");
  assert.equal(drawer.querySelector(".cosmos-theme-close"), view.contentEl.constructor.activeElement);
  assert.match(drawer.querySelector("h2").textContent, /#ai/);
  assert.equal(drawer.querySelectorAll(".cosmos-theme-item").length, 2);

  drawer.querySelector(".cosmos-theme-item").keydown("Escape");
  assert.equal(view.contentEl.querySelector(".cosmos-theme-drawer"), null);

  view.contentEl.querySelector(".cosmos-edition-system").click();
  const editionTriggerTheme = view.activeTheme;
  assert.ok(view.contentEl.querySelector(".cosmos-theme-drawer"));
  view.render();
  assert.equal(view.contentEl.querySelector(".cosmos-theme-close"), view.contentEl.constructor.activeElement);
  view.contentEl.querySelector(".cosmos-theme-close").click();
  assert.equal(view.contentEl.querySelector(".cosmos-theme-drawer"), null);
  assert.equal(view.contentEl.constructor.activeElement.dataset.theme, editionTriggerTheme);

  const atlasTrigger = view.contentEl.querySelector(".cosmos-star");
  atlasTrigger.click();
  view.render();
  view.contentEl.querySelector(".cosmos-theme-close").click();
  assert.equal(view.contentEl.constructor.activeElement.dataset.themeSurface, "atlas");
  assert.ok(view.contentEl.constructor.activeElement.classList.contains("cosmos-star"));
  await view.onClose();
});

test("9. the theme panel lists real notes sorted by last modification, newest first", async (t) => {
  const { view } = await bootView();
  t.after(() => view.onClose());
  view.contentEl.querySelector(".cosmos-star").click();
  const items = view.contentEl.querySelectorAll(".cosmos-theme-drawer .cosmos-theme-item");
  assert.deepEqual([...items].map((item) => item.querySelector("strong").textContent), ["Alpha", "Beta"]);
  items[1].click();
  await sleep(0);
  assert.equal(view.sourceLeaf.file.path, "Notes/Beta.md");
  await view.onClose();
});

test("10. open tasks are named honestly, with no decision or go/no-go framing", async (t) => {
  const { view } = await bootView();
  t.after(() => view.onClose());
  const panel = view.contentEl.querySelector(".cosmos-edition-decisions");
  assert.equal(panel.querySelector("h2").textContent, "Open tasks");
  assert.match(panel.textContent, /OPEN MARKDOWN TASK/);
  const source = await readFile("src/main.js", "utf8");
  assert.doesNotMatch(source, /Awaiting decision/i);
  assert.doesNotMatch(source, /NO-GO/i);
  assert.doesNotMatch(source, /\bGO\b/);
  await view.onClose();
});

test("11. launch control starts a session-local timer after picking a target", async (t) => {
  const { view } = await bootView();
  t.after(() => view.onClose());
  const chip = view.contentEl.querySelector(".cosmos-edition-targets .cosmos-chip");
  chip.click();
  assert.equal(view.focusTarget.path, "Notes/Alpha.md");
  view.contentEl.querySelector(".cosmos-edition-launch").click();
  assert.equal(view.running, true);
  assert.ok(view.missionRocket.classList.contains("is-launched"));
  assert.equal(view.contentEl.querySelector(".cosmos-edition-launch").textContent, "Pause");
  await view.onClose();
});

test("12. the timer shows the full configured duration before launch", async (t) => {
  const { view } = await bootView();
  t.after(() => view.onClose());
  assert.equal(view.contentEl.querySelector(".cosmos-edition-time b").textContent, "25:00");
  view.contentEl.querySelector(".cosmos-edition-targets .cosmos-chip").click();
  assert.equal(view.contentEl.querySelector(".cosmos-edition-time b").textContent, "25:00");
  assert.ok(view.missionRocket.classList.contains("is-armed"));
  await view.onClose();
});

test("12b. focus cannot start without a target and a completed session restarts once at full duration", async (t) => {
  const { view, stubs } = await bootView();
  t.after(() => view.onClose());
  assert.equal(view.timerButton.disabled, true);
  assert.equal(view.editionTimerButton.disabled, true);
  view.toggleTimer();
  assert.equal(view.running, false);
  view.selectFocusTarget({ path: "Notes/Alpha.md", title: "Alpha" });
  const notices = stubs.Notice.messages.length;
  view.remaining = 1;
  view.toggleTimer();
  await sleep(1100);
  assert.equal(view.running, false);
  assert.equal(view.remaining, 0);
  assert.equal(stubs.Notice.messages.length, notices + 1);
  view.toggleTimer();
  assert.equal(view.running, true);
  assert.equal(view.remaining, 25 * 60);
  assert.equal(stubs.Notice.messages.length, notices + 1);
});

test("13. the creation calendar moves between previous, next, and current month", async (t) => {
  const { view } = await bootView();
  t.after(() => view.onClose());
  const label = () => view.contentEl.querySelector(".cosmos-calendar-nav strong").textContent;
  const format = (offset) => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + offset, 1)
      .toLocaleDateString("en-US", { month: "long", year: "numeric" });
  };
  assert.equal(label(), format(0));
  view.contentEl.querySelector('.cosmos-calendar-nav button[aria-label="Next month"]').click();
  assert.equal(label(), format(1));
  view.contentEl.querySelector('.cosmos-calendar-nav button[aria-label="Previous month"]').click();
  view.contentEl.querySelector('.cosmos-calendar-nav button[aria-label="Previous month"]').click();
  assert.equal(label(), format(-1));
  const buttons = view.contentEl.querySelectorAll(".cosmos-calendar-nav button");
  buttons[buttons.length - 1].click();
  assert.equal(label(), format(0));
  assert.equal(view.selectedDay, localDay(new Date()));
  await view.onClose();
});

test("14. a calendar day badge matches its daily log entries exactly", async (t) => {
  const { view, now } = await bootView();
  t.after(() => view.onClose());
  view.contentEl.querySelector('.cosmos-nav button[data-board="calendar"]').click();
  const today = localDay(now);
  const day = [...view.contentEl.querySelectorAll(".cosmos-day")]
    .find((item) => item.getAttribute("aria-label") === `${today}: 2 created notes`);
  assert.ok(day);
  assert.equal(day.querySelector("b").textContent, "2");
  day.click();
  const entries = view.contentEl.querySelectorAll(".cosmos-log-item");
  assert.equal(entries.length, 2);
  entries[0].click();
  await sleep(0);
  assert.ok(["Notes/Alpha.md", "Notes/Beta.md"].includes(view.sourceLeaf.file.path));
  await view.onClose();
});

test("15. an empty vault explains every surface and writes nothing", async (t) => {
  const app = makeApp([], new Map());
  const { plugin, CosmosHomepageView } = await bootPlugin(app);
  const { view } = await openCosmosView(plugin, CosmosHomepageView);
  t.after(() => view.onClose());
  const welcome = view.contentEl.querySelector(".cosmos-welcome");
  assert.ok(welcome);
  for (const hint of [/tags/i, /Open tasks/, /creation calendar/i, /signal belt/i, /Excluded folders/]) {
    assert.match(welcome.textContent, hint);
  }
  assert.equal(app.writes.length, 0);
  await view.onClose();
  assert.equal(app.writes.length, 0);
});

test("16. a metadata burst collapses into at most one refresh", async (t) => {
  const { app, view } = await bootView();
  t.after(() => view.onClose());
  let renders = 0;
  const original = view.render.bind(view);
  view.render = () => { renders += 1; original(); };
  for (let index = 0; index < 50; index += 1) app.triggerMetadata("changed");
  await sleep(400);
  assert.equal(renders, 1);
  await view.onClose();
});

test("17. closing the view releases timers, listeners, the drawer, and the source leaf", async (t) => {
  const { app, view } = await bootView();
  t.after(() => view.onClose());
  view.toggleTimer();
  view.contentEl.querySelector(".cosmos-star").click();
  await view.openPath("Notes/Alpha.md");
  assert.notEqual(view.sourceLeaf, null);
  await view.onClose();
  assert.equal(view.focusTimer, null);
  assert.equal(view.clockTimer, null);
  assert.equal(view.refreshTimer, null);
  assert.equal(view.pointerHandler, null);
  assert.equal(view.keyHandler, null);
  assert.equal(view.disposers.length, 0);
  assert.equal(view.sourceLeaf, null);
  assert.equal(view.themeDrawerEl, null);
  assert.equal(view.activeTheme, null);
  assert.equal(app.metadataListenerCount(), 0);
  assert.equal(app.vaultListenerCount(), 0);

  let renders = 0;
  view.render = () => { renders += 1; };
  app.triggerMetadata("changed");
  await sleep(400);
  assert.equal(renders, 0);
});

test("18. reduced motion and keyboard operation stay intact", async (t) => {
  const { view } = await bootView({ reduceMotion: true });
  t.after(() => view.onClose());
  assert.equal(view.contentEl.classList.contains("is-reduced-motion"), true);
  const star = view.contentEl.querySelector(".cosmos-star");
  assert.equal(star.tagName, "BUTTON");
  assert.match(star.getAttribute("aria-label"), /Theme ai: 2 notes/);
  star.click();
  const items = view.contentEl.querySelectorAll(".cosmos-theme-item");
  assert.ok(items.length > 0);
  for (const item of items) assert.equal(item.tagName, "BUTTON");
  items[0].keydown("Escape");
  assert.equal(view.contentEl.querySelector(".cosmos-theme-drawer"), null);
  await view.onClose();
});

test("19. the duplicated signal belt is hidden from assistive tech and keyboard navigation", async (t) => {
  const { view } = await bootView();
  t.after(() => view.onClose());
  const rocks = view.contentEl.querySelectorAll(".cosmos-edition-rock");
  assert.equal(rocks.length, 8);
  for (const rock of rocks.slice(rocks.length / 2)) {
    assert.equal(rock.getAttribute("aria-hidden"), "true");
    assert.equal(rock.getAttribute("tabindex"), "-1");
  }
});

test("20. mobile buttons meet the 44px touch-target minimum after card scaling", async () => {
  const styles = await readFile("styles.css", "utf8");
  assert.match(styles, /@media \(max-width: 620px\)[\s\S]*\.cosmos-homepage-view button \{ min-height: 44px; \}/);
  const scaleStep = Number(styles.match(/scale\(calc\(1 - var\(--depth\) \* (\.[0-9]+)\)\)/)?.[1]);
  const maxDepth = Math.max(...[...styles.matchAll(/\.cosmos-edition-card\.is-depth-(\d+)/g)].map((match) => Number(match[1])));
  const stackedButtonHeight = Number(styles.match(/@media \(max-width: 620px\)[\s\S]*\.cosmos-edition-card \.cosmos-edition-primary \{ min-height: (\d+)px; \}/)?.[1]);
  assert.ok(stackedButtonHeight * (1 - maxDepth * scaleStep) >= 44);
});
