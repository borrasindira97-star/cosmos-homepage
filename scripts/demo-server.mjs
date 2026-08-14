import { build } from "esbuild";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

const output = "/private/tmp/cosmos-homepage-public-demo";
await mkdir(output, { recursive: true });

await build({
  entryPoints: ["src/main.js"],
  bundle: true,
  format: "iife",
  globalName: "CosmosPublic",
  platform: "browser",
  target: "es2018",
  outfile: join(output, "runtime.js"),
  plugins: [{
    name: "obsidian-demo-stub",
    setup(builder) {
      builder.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "demo" }));
      builder.onLoad({ filter: /.*/, namespace: "demo" }, () => ({ contents: `
        export class TFile {
          static [Symbol.hasInstance](value) { return Boolean(value && typeof value.path === "string" && value.path.endsWith(".md")); }
          constructor(path, ctime, mtime = ctime) {
            this.path = path;
            this.name = path.split("/").pop();
            this.basename = this.name.replace(/\\.md$/i, "");
            this.parent = { path: path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "" };
            this.stat = { ctime, mtime };
          }
        }
        window.__CosmosDemoTFile = TFile;
        export class ItemView {
          constructor(leaf) { this.leaf = leaf; this.app = leaf.app; this.contentEl = leaf.contentEl; }
        }
        export class Plugin {}
        export class PluginSettingTab {
          constructor(app, plugin) { this.app = app; this.plugin = plugin; }
          update() { this.settingItems = this.getSettingDefinitions(); }
        }
        export class MarkdownView {}
        export class Notice { constructor(message) { window.__cosmosNotice = message; } }
      ` }));
    },
  }],
});

await writeFile(join(output, "styles.css"), await readFile("styles.css", "utf8"));
await writeFile(join(output, "index.html"), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cosmos Homepage — production renderer demo</title><link rel="stylesheet" href="/styles.css">
<style>html,body,#app{min-height:100%;margin:0}body{background:#090b14;color:#f4f1fb;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}button{font:inherit}</style>
</head><body><div id="app"></div><script src="/runtime.js"></script><script>
(() => {
  const proto = HTMLElement.prototype;
  proto.createEl = function(tag, options = {}) { const node = document.createElement(tag); if (options.cls) node.className = options.cls; if (options.text != null) node.textContent = options.text; this.appendChild(node); return node; };
  proto.empty = function() { this.replaceChildren(); };
  proto.addClass = function(name) { this.classList.add(name); };
  proto.toggleClass = function(name, state) { this.classList.toggle(name, state); };
  proto.setText = function(value) { this.textContent = String(value ?? ""); };

  const day = new Date(); const at = (offset, hour) => new Date(day.getFullYear(), day.getMonth(), day.getDate() - offset, hour, 0).getTime();
  const rows = [
    ["Research/Local-first AI.md",0,9,"Local-first AI systems",["ai","research","local-first"],["Compare two local inference runtimes","Validate the hardware budget"]],
    ["Research/Agent reliability.md",0,8,"Agent reliability",["ai","agents","reliability"],["Review the execution trace"]],
    ["Research/Knowledge constellations.md",1,16,"Knowledge constellations",["knowledge","research","design"],[]],
    ["Projects/Personal observatory.md",2,12,"Personal observatory",["design","knowledge","dashboard"],["Ship the first public release"]],
    ["Projects/Reading orbit.md",3,18,"Reading orbit",["reading","knowledge","research"],[]],
    ["Projects/Creative coding.md",4,19,"Creative coding",["design","coding","experiments"],[]],
    ["Journal/2026-08-09.md",5,21,"Nightly review",["journal","reflection"],[]],
    ["Journal/2026-08-08.md",6,21,"Learning log",["journal","learning"],[]],
    ["Architecture notes.md",7,14,"Architecture notes",["architecture","agents","coding"],[]],
    ["Source verification.md",8,10,"Source verification",["research","reliability","evidence"],[]]
  ];
  const files = rows.map(([path,offset,hour]) => new window.__CosmosDemoTFile(path, at(offset,hour), at(Math.max(0,offset-1),hour)));
  const caches = new Map(rows.map(([path,, ,title,tags,tasks]) => [path,{frontmatter:{title,tags},listItems:tasks.map((text,index)=>({task:" ",text,position:{start:{line:index+6}}}))}]));
  const app = {
    vault: { getMarkdownFiles: () => files, on: () => ({}), offref: () => {}, getAbstractFileByPath: path => files.find(file => file.path === path) },
    metadataCache: { getFileCache: file => caches.get(file.path) || {}, on: () => ({}), offref: () => {} },
    workspace: { getLeaf: () => ({ openFile: async file => { document.documentElement.dataset.openedPath = file.path; }, view: null }) }
  };
  const plugin = { settings: { homepageTitle:"Ideas become constellations.",openOnStartup:false,focusMinutes:25,recentLimit:8,activityLimit:240,excludedFolders:[".trash","Templates"],reduceMotion:false } };
  const view = new CosmosPublic.CosmosHomepageView({ app, contentEl: document.querySelector("#app") }, plugin);
  view.onOpen(); window.__cosmosDemo = { view, app, files, caches };
})();
</script></body></html>`);

const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };
const server = createServer(async (request, response) => {
  const path = request.url === "/" ? "/index.html" : request.url.split("?")[0];
  try {
    response.setHeader("Content-Type", mime[extname(path)] || "application/octet-stream");
    response.end(await readFile(join(output, path)));
  } catch {
    response.statusCode = 404; response.end("Not found");
  }
});
server.listen(4176, "127.0.0.1", () => console.log("http://127.0.0.1:4176/"));
