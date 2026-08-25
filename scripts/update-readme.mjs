#!/usr/bin/env node
/**
 * Régénère les sections dynamiques du README à partir de l'API GitHub.
 * Sections délimitées par des marqueurs HTML :
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
  if (!res.ok) throw new Error(`GitHub API ${res.status} sur ${path}`);
  return res.json();
}

function escapeMd(text) {
  return String(text).replace(/([|<>])/g, "\\$1");
}

function relativeDate(iso) {
  const days = Math.floor((Date.now() - new Date(iso)) / 86_400_000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "hier";
  if (days < 30) return `il y a ${days} j`;
  const months = Math.floor(days / 30);
  if (months < 12) return `il y a ${months} mois`;
  const years = Math.floor(months / 12);
  return `il y a ${years} an${years > 1 ? "s" : ""}`;
}

function replaceSection(content, name, body) {
  const re = new RegExp(
    `(<!-- ${name}:START -->)[\\s\\S]*?(<!-- ${name}:END -->)`,
  );
  if (!re.test(content)) {
    throw new Error(`Marqueurs ${name} introuvables dans le README.`);
  }
  return content.replace(re, `$1${body}$2`);
}

const repos = await api(
  `/users/${USER}/repos?type=owner&sort=pushed&per_page=100`,
);

const recent = repos
  .filter((r) => !r.fork && !r.archived && !r.private)
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
      "| Projet | Description | Langage | ★ | Dernier push |",
      "| --- | --- | --- | --- | --- |",
      rows,
      "",
    ].join("\n")
  : "\n_Aucun dépôt public récent._\n";

const stamp = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "long",
  timeZone: "Europe/Paris",
}).format(new Date());

let content = await readFile(README, "utf8");
content = replaceSection(content, "RECENT_PROJECTS", table);
content = replaceSection(content, "LAST_UPDATE", stamp);
await writeFile(README, content);

console.log(`README mis à jour · ${recent.length} dépôts · ${stamp}`);
