/**
 * Renders a repository card as a self-contained SVG, so the README never
 * depends on a third-party card service.
 *
 * The gutter around the card is part of the canvas and stays transparent:
 * that way the cards can be laid out as plain inline images, with no HTML
 * table (GitHub's stylesheet forces borders and padding on table cells) and
 * no CSS (GitHub strips style attributes).
 */

/** Visible card. */
const CARD_W = 400;
const CARD_H = 140;
/** Transparent gutter baked into the canvas, on every side. */
const PAD = 10;

const WIDTH = CARD_W + PAD * 2;
const HEIGHT = CARD_H + PAD * 2;

const THEME = {
  dark: {
    bg: "#0d1117",
    bgTo: "#11161d",
    border: "#30363d",
    title: "#a5b4fc",
    text: "#8b949e",
    meta: "#6e7681",
    accent: "#818cf8",
    star: "#e3b341",
    shadow: "#000000",
    shadowOpacity: "0.45",
  },
  light: {
    bg: "#ffffff",
    bgTo: "#f6f8fa",
    border: "#d1d9e0",
    title: "#4f46e5",
    text: "#59636e",
    meta: "#6a737d",
    accent: "#4f46e5",
    star: "#bf8700",
    shadow: "#1f2328",
    shadowOpacity: "0.10",
  },
};

const LANG_COLOR = {
  Rust: "#dea584",
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  PHP: "#4F5D95",
  Vue: "#41b883",
  CSS: "#563d7c",
  SCSS: "#c6538c",
  Less: "#1d365d",
  HTML: "#e34c26",
  Python: "#3572A5",
  Go: "#00ADD8",
  Shell: "#89e051",
  Java: "#b07219",
  "C#": "#178600",
  "C++": "#f34b7d",
  C: "#555555",
  Ruby: "#701516",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  Dart: "#00B4AB",
  Astro: "#ff5a03",
  Svelte: "#ff3e00",
  Dockerfile: "#384d54",
};

const escapeXml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/** Greedy wrap tuned for 13px text across the card's 352px text column. */
function wrap(text, maxChars = 47, maxLines = 2) {
  if (!text) return [];
  const words = String(text).replace(/\s+/g, " ").trim().split(" ");
  const lines = [];
  let line = "";
  let overflow = false;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxChars) {
      line = candidate;
      continue;
    }
    if (lines.length === maxLines - 1 && line) {
      overflow = true;
      break;
    }
    if (line) lines.push(line);
    line = word;
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (overflow) {
    const last = lines[lines.length - 1].slice(0, maxChars - 1).replace(/[\s.,;:]+$/, "");
    lines[lines.length - 1] = `${last}…`;
  }
  return lines;
}

/** Truncate a repository name that would overflow the card. */
function fitName(name, max = 30) {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

export function repoCard(repo, mode) {
  const c = THEME[mode];
  const langColor = LANG_COLOR[repo.language] ?? "#8b949e";
  const descLines = wrap(repo.description || "No description.");
  const uid = `${repo.name}-${mode}`.replace(/[^a-zA-Z0-9-]/g, "_");

  const desc = descLines
    .map(
      (line, i) =>
        `      <text x="46" y="${74 + i * 19}" font-size="13" fill="${c.text}">${escapeXml(line)}</text>`,
    )
    .join("\n");

  // Footer: language dot, stars, then my own commit activity.
  let x = 46;
  const footer = [];
  if (repo.language) {
    footer.push(
      `      <circle cx="${x + 5}" cy="117" r="5" fill="${langColor}"/>`,
      `      <text x="${x + 16}" y="121" font-size="12" fill="${c.meta}">${escapeXml(repo.language)}</text>`,
    );
    x += 16 + repo.language.length * 6.5 + 16;
  }
  footer.push(
    `      <path transform="translate(${x} 111) scale(0.7)" fill="${c.star}" d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"/>`,
    `      <text x="${x + 17}" y="121" font-size="12" fill="${c.meta}">${repo.stars}</text>`,
  );
  x += 17 + String(repo.stars).length * 7 + 16;
  footer.push(
    `      <text x="${x}" y="121" font-size="12" fill="${c.accent}">${repo.commits} commit${repo.commits === 1 ? "" : "s"}</text>`,
    `      <text x="${CARD_W - 18}" y="121" font-size="12" text-anchor="end" fill="${c.meta}">${escapeXml(repo.relative)}</text>`,
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${escapeXml(`${repo.name} — ${repo.description || "no description"}`)}">
  <defs>
    <linearGradient id="bg-${uid}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c.bg}"/>
      <stop offset="100%" stop-color="${c.bgTo}"/>
    </linearGradient>
    <linearGradient id="edge-${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#6366f1"/>
      <stop offset="100%" stop-color="#06b6d4"/>
    </linearGradient>
    <filter id="shadow-${uid}" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="${c.shadow}" flood-opacity="${c.shadowOpacity}"/>
    </filter>
  </defs>
  <g transform="translate(${PAD} ${PAD})">
    <g filter="url(#shadow-${uid})">
      <rect x="0.5" y="0.5" width="${CARD_W - 1}" height="${CARD_H - 1}" rx="12" fill="url(#bg-${uid})" stroke="${c.border}"/>
    </g>
    <rect x="1" y="12" width="3" height="${CARD_H - 24}" rx="1.5" fill="url(#edge-${uid})"/>
    <g font-family="Inter, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif">
      <path transform="translate(20 30)" fill="${c.title}" d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.25.25 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z"/>
      <text x="46" y="36" font-size="16.5" font-weight="600" fill="${c.title}">${escapeXml(fitName(repo.name))}</text>
${desc}
${footer.join("\n")}
    </g>
  </g>
</svg>
`;
}

export const CARD_CANVAS_WIDTH = WIDTH;
