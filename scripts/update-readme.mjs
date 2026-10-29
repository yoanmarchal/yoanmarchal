#!/usr/bin/env node
/**
 * Rebuilds the dynamic sections of the profile README.
 *
 * "Working on" is driven by commits I actually authored (GitHub commit search),
 * not by repository push dates — so Renovate/Dependabot traffic never promotes
 * a repository I haven't touched myself.
 *
 * Markers in README.md:
 *   <!-- RECENT_PROJECTS:START --> ... <!-- RECENT_PROJECTS:END -->
 *   <!-- LAST_UPDATE:START --> ... <!-- LAST_UPDATE:END -->
 */

import { readFile, writeFile } from "node:fs/promises";

const USER = process.env.GH_USER || "yoanmarchal";
const TOKEN = process.env.GITHUB_TOKEN;
const README = new URL("../README.md", import.meta.url);

/** Number of repository cards rendered (2 per row). */
const CARDS = 4;
/** Commits scanned, newest first. */
const SCAN = 100;

const CARD_THEME = {
  dark: {
    title_color: "e6edf3",
    text_color: "8b949e",
    icon_color: "6366f1",
    border_color: "30363d",
  },
  light: {
    title_color: "1f2328",
    text_color: "59636e",
    icon_color: "6366f1",
    border_color: "d1d9e0",
  },
};

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
    const res = await fetch(`https://api.github.com${path}`, {
      headers: HEADERS,
    });
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

function pinUrl(owner, repo, theme) {
  const params = new URLSearchParams({
    username: owner,
    repo,
    hide_border: "true",
    bg_color: "00000000",
    show_owner: owner.toLowerCase() === USER.toLowerCase() ? "false" : "true",
    description_lines_count: "2",
    ...CARD_THEME[theme],
  });
  return `https://github-readme-stats.vercel.app/api/pin/?${params}`;
}

function card({ owner, repo, commits, last }) {
  const href = `https://github.com/${owner}/${repo}`;
  const plural = commits === 1 ? "commit" : "commits";
  return [
    `      <a href="${href}">`,
    `        <picture>`,
    `          <source media="(prefers-color-scheme: dark)" srcset="${pinUrl(owner, repo, "dark")}">`,
    `          <source media="(prefers-color-scheme: light)" srcset="${pinUrl(owner, repo, "light")}">`,
    `          <img alt="${owner}/${repo}" src="${pinUrl(owner, repo, "dark")}">`,
    `        </picture>`,
    `      </a>`,
    `      <br>`,
    `      <sub><b>${commits}</b> ${plural} by me · last ${relativeDate(last)}</sub>`,
  ].join("\n");
}

function replaceSection(content, name, body) {
  const re = new RegExp(`(<!-- ${name}:START -->)[\\s\\S]*?(<!-- ${name}:END -->)`);
  if (!re.test(content)) throw new Error(`Markers ${name} not found in README.`);
  return content.replace(re, `$1${body}$2`);
}

// ---------------------------------------------------------------------------

const search = await api(
  `/search/commits?q=${encodeURIComponent(`author:${USER}`)}` +
    `&sort=author-date&order=desc&per_page=${SCAN}`,
);

const repos = new Map();
for (const item of search.items ?? []) {
  if (!isMine(item)) continue;
  const { full_name: fullName, fork, private: isPrivate } = item.repository;
  if (fork || isPrivate) continue;
  if (fullName.toLowerCase() === `${USER}/${USER}`.toLowerCase()) continue;

  const date = item.commit.author.date;
  const entry = repos.get(fullName) ?? {
    owner: item.repository.owner.login,
    repo: item.repository.name,
    commits: 0,
    last: date,
  };
  entry.commits += 1;
  if (date > entry.last) entry.last = date;
  repos.set(fullName, entry);
}

const featured = [...repos.values()]
  .sort((a, b) => b.last.localeCompare(a.last))
  .slice(0, CARDS);

let body;
if (featured.length === 0) {
  body = "\n_No public commit found in the last scan._\n";
} else {
  const rows = [];
  for (let i = 0; i < featured.length; i += 2) {
    const cells = featured
      .slice(i, i + 2)
      .map((r) => `    <td width="50%" valign="top" align="center">\n${card(r)}\n    </td>`)
      .join("\n");
    rows.push(`  <tr>\n${cells}\n  </tr>`);
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
  `README updated · ${featured.length} repositories · ` +
    `${search.items?.length ?? 0} commits scanned · ${stamp}`,
);
