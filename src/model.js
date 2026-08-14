"use strict";

export const DEFAULT_SETTINGS = Object.freeze({
  homepageTitle: "Your ideas have an orbit.",
  openOnStartup: false,
  focusMinutes: 25,
  recentLimit: 8,
  activityLimit: 240,
  excludedFolders: [".trash", "Templates"],
  reduceMotion: false,
});

function text(value) {
  return String(value ?? "").trim();
}

function clampInt(value, fallback, min, max) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

export function normalizeSettings(raw = {}) {
  const folders = Array.isArray(raw.excludedFolders)
    ? raw.excludedFolders
    : text(raw.excludedFolders).split(",");
  return {
    homepageTitle: text(raw.homepageTitle) || DEFAULT_SETTINGS.homepageTitle,
    openOnStartup: raw.openOnStartup === true,
    focusMinutes: clampInt(raw.focusMinutes, DEFAULT_SETTINGS.focusMinutes, 5, 120),
    recentLimit: clampInt(raw.recentLimit, DEFAULT_SETTINGS.recentLimit, 3, 20),
    activityLimit: clampInt(raw.activityLimit, DEFAULT_SETTINGS.activityLimit, 30, 1000),
    excludedFolders: [...new Set(folders.map(text).filter(Boolean))],
    reduceMotion: raw.reduceMotion === true,
  };
}

function isExcluded(path, folders) {
  const cleanPath = text(path).replace(/^\/+/, "");
  return folders.some((folder) => cleanPath === folder || cleanPath.startsWith(`${folder}/`));
}

export function localDay(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function timestamp(file, frontmatter = {}) {
  const declared = frontmatter.created || frontmatter.created_at || frontmatter.date;
  const parsed = declared ? new Date(declared).getTime() : NaN;
  if (Number.isFinite(parsed)) return parsed;
  return Number(file?.stat?.ctime || file?.stat?.mtime || 0);
}

function collectTags(cache = {}) {
  const tags = new Set();
  for (const tag of cache.tags || []) {
    const value = text(tag?.tag).replace(/^#/, "");
    if (value) tags.add(value);
  }
  const fm = cache.frontmatter?.tags;
  const values = Array.isArray(fm) ? fm : text(fm).split(/[ ,]+/);
  for (const value of values) {
    const tag = text(value).replace(/^#/, "");
    if (tag) tags.add(tag);
  }
  return [...tags];
}

function collectTasks(cache = {}, path) {
  const tasks = [];
  for (const item of cache.listItems || []) {
    if (item?.task !== " ") continue;
    tasks.push({ path, line: Number(item?.position?.start?.line || 0), text: text(item?.text) });
  }
  return tasks;
}

export function buildVaultModel(app, rawSettings = {}, now = new Date()) {
  const settings = normalizeSettings(rawSettings);
  const source = app?.vault?.getMarkdownFiles?.() || [];
  const files = [];
  const tagCounts = new Map();
  const tagModified = new Map();
  const tagNotes = new Map();
  const folderCounts = new Map();
  const activities = new Map();
  const tasks = [];

  for (const file of source) {
    if (!file?.path || isExcluded(file.path, settings.excludedFolders)) continue;
    const cache = app?.metadataCache?.getFileCache?.(file) || {};
    const frontmatter = cache.frontmatter || {};
    const created = timestamp(file, frontmatter);
    const tags = collectTags(cache);
    const folder = text(file.parent?.path) || "Root";
    const item = {
      path: file.path,
      title: text(frontmatter.title) || text(file.basename) || text(file.name).replace(/\.md$/i, ""),
      created,
      modified: Number(file.stat?.mtime || created),
      tags,
      folder,
    };
    files.push(item);
    for (const tag of tags) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      tagModified.set(tag, Math.max(tagModified.get(tag) || 0, item.modified));
      if (!tagNotes.has(tag)) tagNotes.set(tag, []);
      tagNotes.get(tag).push(item);
    }
    folderCounts.set(folder, (folderCounts.get(folder) || 0) + 1);
    const day = localDay(created);
    if (day) {
      if (!activities.has(day)) activities.set(day, []);
      activities.get(day).push(item);
    }
    tasks.push(...collectTasks(cache, file.path));
  }

  files.sort((a, b) => b.modified - a.modified || a.path.localeCompare(b.path));
  for (const items of activities.values()) items.sort((a, b) => b.created - a.created || a.path.localeCompare(b.path));
  for (const items of tagNotes.values()) items.sort((a, b) => b.modified - a.modified || a.path.localeCompare(b.path));
  const rank = (map, limit) => [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count, lastModified: tagModified.get(name) || 0 }));
  const today = localDay(now);
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - 6);
  const weekCount = files.filter((file) => file.created >= weekStart.getTime()).length;

  return {
    generatedAt: now.toISOString(),
    totalNotes: files.length,
    todayCount: activities.get(today)?.length || 0,
    weekCount,
    openTasks: tasks.length,
    recent: files.slice(0, settings.recentLimit),
    tasks: tasks.slice(0, 8),
    tags: rank(tagCounts, 12),
    folders: rank(folderCounts, 8),
    activities,
    tagNotes,
    systems: rank(tagCounts, 8),
  };
}
