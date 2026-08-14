import { readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const pkg = JSON.parse(await readFile("package.json", "utf8"));
const versions = JSON.parse(await readFile("versions.json", "utf8"));
const required = ["id", "name", "version", "minAppVersion", "description", "author", "isDesktopOnly"];
for (const key of required) if (!(key in manifest)) throw new Error(`manifest is missing ${key}`);
if (!/^[a-z0-9-]+$/.test(manifest.id) || manifest.id.includes("obsidian")) throw new Error("invalid plugin id");
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error("version must use x.y.z");
if (pkg.version !== manifest.version || versions[manifest.version] !== manifest.minAppVersion) throw new Error("version metadata drift");
for (const file of ["README.md", "LICENSE", "manifest.json", "versions.json", "styles.css", "src/main.js", "src/model.js"]) await stat(file);
const source = await readFile("src/main.js", "utf8");
const model = await readFile("src/model.js", "utf8");
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
if (lock.version !== pkg.version || lock.packages?.[""]?.version !== pkg.version) throw new Error("package-lock version drift");
const publicText = `${source}\n${model}\n${await readFile("README.md", "utf8")}`;
const forbidden = [/\/Users\//, /127\.0\.0\.1/, /localhost/i, /568[0-9]/, /567[0-9]/, /Keychain/i, /nigo-loop/i, /My Life\.md/];
for (const pattern of forbidden) if (pattern.test(publicText)) throw new Error(`private coupling detected: ${pattern}`);
if (/\bfetch\s*\(|requestUrl\s*\(/.test(publicText)) throw new Error("v1 must not access the network");
if (/innerHTML\s*=/.test(publicText)) throw new Error("unsafe innerHTML assignment detected");
const styleLines = source.split("\n").filter((line) => /\.style(?:\.|\[)/.test(line));
if (styleLines.some((line) => !/this\.contentEl\.style\.(?:setProperty|removeProperty)\("--cosmos-pointer-[xy]"/.test(line))) {
  throw new Error("JavaScript may only update the scoped pointer-light CSS variables");
}
if (/console\./.test(`${source}\n${model}`)) throw new Error("production source must not log to the console");
if (/registry\.npmmirror\.com/.test(JSON.stringify(lock))) throw new Error("lockfile must use the official npm registry");
if (/detachLeavesOfType/.test(source)) throw new Error("unload must not detach user leaves");
if (/softprops\/action-gh-release/.test(await readFile(".github/workflows/release.yml", "utf8"))) throw new Error("release workflow must not require a third-party publishing action");
if (spawnSync("git", ["check-ignore", "src/main.js"]).status === 0) throw new Error("source entry must not be ignored by Git");
console.log("public release checks passed");
