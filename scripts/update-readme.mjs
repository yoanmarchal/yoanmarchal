#!/usr/bin/env node
/**
 * Regenerates the dynamic sections of the README from the GitHub API.
 * Sections delimited by HTML markers:
 *   <!-- RECENT_PROJECTS:START --> ... <!-- RECENT_PROJECTS:END -->
 *   <!-- LAST_UPDATE:START --> ... <!-- LAST_UPDATE:END -->
 */

import { readFile, writeFile } from "node:fs/promises";

const USER = process.env.GH_USER || "yoanmarchal";
const TOKEN = process.env.GITHUB_TOKEN;
const README = new URL("../README.md", import.meta.url);
const COUNT = 5;

const HEADERS = {
  Accept: "application/vnd.github+json",
  "User-Agent": `${USER}-profile-readme`,
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

async function api(path) {
  const res = await fetch(`https://api.github.com${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`GitHub API ${res.status} on ${path}`);
  return res.json();
}

function escapeMd(text) {
  return String(text).replace(/([|<>])/g, "\\$1");
}

function relativeDate(iso) {
  const days = Math.floor((Date.now() - new Date(iso)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

function replaceSection(content, name, body) {
  const re = new RegExp(
    `(<!-- ${name}:START -->)[\\s\\S]*?(<!-- ${name}:END -->)`,
  );
  if (!re.test(content)) {
    throw new Error(`${name} markers not found in README.`);
  }
  return content.replace(re, `$1${body}$2`);
}

const repos = await api(
  `/users/${USER}/repos?type=owner&sort=pushed&per_page=100`,
);

const recent = repos
  .filter(
    (r) =>
      !r.fork &&
      !r.archived &&
      !r.private &&
      r.name.toLowerCase() !== USER.toLowerCase(),
  )
  .slice(0, COUNT);

const rows = recent
  .map((r) => {
    const desc = r.description ? escapeMd(r.description) : "—";
    const lang = r.language ? `\`${r.language}\`` : "—";
    return `| [${escapeMd(r.name)}](${r.html_url}) | ${desc} | ${lang} | ${r.stargazers_count} | ${relativeDate(r.pushed_at)} |`;
  })
  .join("\n");

const table = recent.length
  ? [
      "",
      "| Project | Description | Language | ★ | Last push |",
      "| --- | --- | --- | --- | --- |",
      rows,
      "",
    ].join("\n")
  : "\n_No recent public repos._\n";

const stamp = new Intl.DateTimeFormat("en-US", {
  dateStyle: "long",
  timeZone: "Europe/Paris",
}).format(new Date());

let content = await readFile(README, "utf8");
content = replaceSection(content, "RECENT_PROJECTS", table);
content = replaceSection(content, "LAST_UPDATE", stamp);
await writeFile(README, content);

console.log(`README updated · ${recent.length} repos · ${stamp}`);
