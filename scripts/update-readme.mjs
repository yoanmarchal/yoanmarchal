#!/usr/bin/env node
/**
 * Rebuilds the dynamic sections of the profile README.
 *
 * "Working on" is driven by commits I actually authored (GitHub commit search),
 * not by repository push dates — so Renovate/Dependabot traffic never promotes
 * a repository I haven't touched myself.
 *
 * The project cards are rendered here into assets/cards/ as plain SVG and
 * committed with the README, so the profile never depends on a third-party
 * card service being up.
 *
 * Markers in README.md:
 *   <!-- RECENT_PROJECTS:START --> ... <!-- RECENT_PROJECTS:END -->
 *   <!-- LAST_UPDATE:START --> ... <!-- LAST_UPDATE:END -->
 */

import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { repoCard } from "./cards.mjs";

const USER = process.env.GH_USER || "yoanmarchal";
const TOKEN = process.env.GITHUB_TOKEN;
const README = new URL("../README.md", import.meta.url);
const CARDS_DIR = new URL("../assets/cards/", import.meta.url);
const CARDS_PATH = "assets/cards";
const RAW = `https://raw.githubusercontent.com/${USER}/${USER}/main`;

/** Number of repository cards rendered (2 per row). */
const CARDS = 4;
/** Commits scanned, newest first. */
const SCAN = 100;

/** Commits that exist because of a bot, not because of me. */
const BOT_LOGIN = /\[bot\]$/i;
const AUTOMATED_COMMIT = [
  /^Merge pull request #\d+ from \S*\/(renovate|dependabot)/i,
  /^Merge branch /i,
  /^(chore|build|fix|ci)\((deps|deps-dev)\)/i,
  /^Update dependency /i,
  /^Bump \S+ from \S+ to \S+/i,
  /^chore: automatic README update$/i,
  /^Lock file maintenance/i,
];

const HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": `${USER}-profile-readme`,
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, { attempts = 3 } = {}) {
  let lastError;
  for (let i = 1; i <= attempts; i++) {
    const res = await fetch(`https://api.github.com${path}`, { headers: HEADERS });
    if (res.ok) return res.json();
    lastError = new Error(`GitHub API ${res.status} on ${path}`);
    // Secondary rate limit on the search API: wait and retry.
    if ((res.status === 403 || res.status === 429) && i < attempts) {
      await sleep(i * 8000);
      continue;
    }
    if (res.status >= 500 && i < attempts) {
      await sleep(i * 2000);
      continue;
    }
    throw lastError;
  }
  throw lastError;
}

function isMine(item) {
  const subject = item.commit.message.split("\n")[0];
  const login = item.author?.login ?? "";
  const name = item.commit.author?.name ?? "";
  if (BOT_LOGIN.test(login) || BOT_LOGIN.test(name)) return false;
  return !AUTOMATED_COMMIT.some((re) => re.test(subject));
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
  const re = new RegExp(`(<!-- ${name}:START -->)[\\s\\S]*?(<!-- ${name}:END -->)`);
  if (!re.test(content)) throw new Error(`Markers ${name} not found in README.`);
  return content.replace(re, `$1${body}$2`);
}

/** Cards are regenerated in place, so the camo cache needs a changing URL. */
function cacheTag() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

// --- collect the repositories I actually committed to -----------------------

const search = await api(
  `/search/commits?q=${encodeURIComponent(`author:${USER}`)}` +
    `&sort=author-date&order=desc&per_page=${SCAN}`,
);

const seen = new Map();
for (const item of search.items ?? []) {
  if (!isMine(item)) continue;
  const { full_name: fullName, fork, private: isPrivate } = item.repository;
  if (fork || isPrivate) continue;
  if (fullName.toLowerCase() === `${USER}/${USER}`.toLowerCase()) continue;

  const date = item.commit.author.date;
  const entry = seen.get(fullName) ?? {
    fullName,
    owner: item.repository.owner.login,
    name: item.repository.name,
    commits: 0,
    last: date,
  };
  entry.commits += 1;
  if (date > entry.last) entry.last = date;
  seen.set(fullName, entry);
}

const featured = [...seen.values()]
  .sort((a, b) => b.last.localeCompare(a.last))
  .slice(0, CARDS);

// --- render one SVG card per repository, per colour scheme ------------------

await mkdir(CARDS_DIR, { recursive: true });
const expected = new Set();
const tag = cacheTag();

for (const repo of featured) {
  const meta = await api(`/repos/${repo.fullName}`);
  const model = {
    name: repo.name,
    description: meta.description,
    language: meta.language,
    stars: meta.stargazers_count,
    commits: repo.commits,
    relative: relativeDate(repo.last),
  };
  const slug = repo.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  for (const mode of ["dark", "light"]) {
    const file = `${slug}-${mode}.svg`;
    expected.add(file);
    await writeFile(new URL(file, CARDS_DIR), repoCard(model, mode), "utf8");
  }
  repo.slug = slug;
}

// Drop cards for repositories that dropped out of the list.
for (const file of await readdir(CARDS_DIR)) {
  if (file.endsWith(".svg") && !expected.has(file)) {
    await unlink(new URL(file, CARDS_DIR));
  }
}

// --- rebuild the README section --------------------------------------------

function cell(repo) {
  const href = `https://github.com/${repo.fullName}`;
  const src = (mode) => `${RAW}/${CARDS_PATH}/${repo.slug}-${mode}.svg?v=${tag}`;
  return [
    `    <td width="50%" valign="top">`,
    `      <a href="${href}">`,
    `        <picture>`,
    `          <source media="(prefers-color-scheme: dark)" srcset="${src("dark")}">`,
    `          <source media="(prefers-color-scheme: light)" srcset="${src("light")}">`,
    `          <img alt="${repo.fullName}" src="${src("dark")}" width="100%">`,
    `        </picture>`,
    `      </a>`,
    `    </td>`,
  ].join("\n");
}

let body;
if (featured.length === 0) {
  body = "\n_No public commit found in the last scan._\n";
} else {
  const rows = [];
  for (let i = 0; i < featured.length; i += 2) {
    rows.push(`  <tr>\n${featured.slice(i, i + 2).map(cell).join("\n")}\n  </tr>`);
  }
  body = `\n<table>\n${rows.join("\n")}\n</table>\n`;
}

const stamp = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "long",
  timeZone: "Europe/Paris",
}).format(new Date());

let content = await readFile(README, "utf8");
content = replaceSection(content, "RECENT_PROJECTS", body);
content = replaceSection(content, "LAST_UPDATE", stamp);
await writeFile(README, content);

console.log(
  `README updated · ${featured.length} cards · ` +
    `${search.items?.length ?? 0} commits scanned · ${stamp}`,
);
