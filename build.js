#!/usr/bin/env node
"use strict";
/* node build.js
 *   → ./songsterr-float.user.js          (коммитится: на него ссылается Tampermonkey)
 *   → ./dist/extension/                       (распакованное расширение для Chrome/Firefox)
 *   → ./dist/songsterr-float-extension-vX.Y.Z.zip   (для Web Store / AMO / Releases)
 */
const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const pkg = require("./package.json");
const repo = pkg.config.repo;
const hasRepo = !repo.includes("YOUR_");
const core = fs.readFileSync(path.join(__dirname, "src", "core.js"), "utf8");

/* ---------- userscript ---------- */
const meta = [
  ["name", "Songsterr Float"],
  ["namespace", "https://github.com/fixsongsterr"],
  ["version", pkg.version],
  ["description", "Desktop layout for Songsterr: top pill navigation, centered panels, popups under the pills"],
  ["match", "https://www.songsterr.com/*"],
  ["match", "https://songsterr.com/*"],
  ["run-at", "document-start"],
  ["grant", "GM_addStyle"],
  ["grant", "GM.addStyle"],
];

if (hasRepo) {
  const raw = `https://raw.githubusercontent.com/${repo}/main/songsterr-float.user.js`;
  meta.push(
    ["homepageURL", `https://github.com/${repo}`],
    ["supportURL", `https://github.com/${repo}/issues`],
    ["updateURL", raw],
    ["downloadURL", raw]
  );
}

const header = [
  "// ==UserScript==",
  ...meta.map(([k, v]) => `// @${k.padEnd(12)} ${v}`),
  "// ==/UserScript==",
  "",
].join("\n");

fs.writeFileSync(path.join(__dirname, "songsterr-float.user.js"), header + "\n" + core);

/* ---------- extension ---------- */
const dist = path.join(__dirname, "dist");
const ext = path.join(dist, "extension");
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(ext, { recursive: true });

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "extension", "manifest.json"), "utf8"));
manifest.version = pkg.version;
fs.writeFileSync(path.join(ext, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
fs.writeFileSync(path.join(ext, "content.js"), core);
fs.cpSync(path.join(__dirname, "extension", "icons"), path.join(ext, "icons"), { recursive: true });

const zipPath = path.join(dist, `songsterr-float-extension-v${pkg.version}.zip`);
const entries = ["manifest.json", "content.js", "icons"];

try {
  if (process.platform === "win32") cp.execFileSync("tar", ["-a", "-c", "-f", zipPath, ...entries], { cwd: ext });
  else cp.execFileSync("zip", ["-r", "-q", zipPath, ...entries], { cwd: ext });
} catch (e) {
  console.warn("Не удалось создать zip автоматически — заархивируй содержимое dist/extension вручную.");
}

console.log(`Готово: v${pkg.version}${hasRepo ? "" : " (repo не задан в package.json → @updateURL не добавлен)"}`);
