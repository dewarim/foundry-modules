// The pure half of the changelog notice: reading a module's CHANGELOG.md, choosing what is new for a
// user, and a small markdown subset as HTML. No Foundry globals - covered by scripts/test/changelog.test.mjs.
//
// SHARED FILE: the original is shared/changelog/ in the repository; every module carries a copy in
// scripts/shared/ (modules cannot import each other's files). Edit the original and run
// `node scripts/sync-shared.mjs` - a test fails while a copy differs.

/** "1.2.10" vs "1.10.0": -1, 0, 1 (numeric per part, missing parts count as 0). */
export function compareVersions(a, b) {
  const pa = String(a).split(".").map(n => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map(n => parseInt(n, 10) || 0);
  for ( let i = 0; i < Math.max(pa.length, pb.length); i++ ) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if ( d ) return Math.sign(d);
  }
  return 0;
}

const HEADING = /^##\s+(?:\[?)(Unreleased|v?\d+(?:\.\d+)*)(?:\]?)\s*(?:[-–(]\s*([^)]*?)\)?)?\s*$/i;

/**
 * The sections of a CHANGELOG.md, newest first as written: "## 0.3.1 (2026-10-18)" or "## Unreleased",
 * each with the markdown below it up to the next "## ". Anything above the first section (a title, an
 * introduction) is not part of any version.
 * @returns {{version: string, date: string|null, body: string}[]}
 */
export function parseChangelog(text) {
  const sections = [];
  let current = null;
  for ( const line of String(text ?? "").split(/\r?\n/) ) {
    const match = line.match(HEADING);
    if ( match ) {
      current = {version: match[1].replace(/^v/i, ""), date: match[2]?.trim() || null, lines: []};
      sections.push(current);
    }
    else if ( current ) current.lines.push(line);
  }
  return sections.map(({version, date, lines}) => ({version, date, body: lines.join("\n").trim()}));
}

/**
 * What a user has not seen yet: the released sections newer than the version they last saw, up to the
 * installed one. Never seen (a first install): only the installed version's section - a welcome, not the
 * whole history. "Unreleased" is never shown.
 * @param {object[]} sections   from parseChangelog
 * @param {string} installed    the module's version now
 * @param {string|null} seen    the version the user last saw, or null
 */
export function unseen(sections, installed, seen) {
  const released = sections.filter(s => s.version.toLowerCase() !== "unreleased"
    && compareVersions(s.version, installed) <= 0);
  if ( !seen ) return released.filter(s => compareVersions(s.version, installed) === 0).slice(0, 1);
  return released.filter(s => compareVersions(s.version, seen) > 0);
}

const escapeHtml = text => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

/** Inline markdown: `code`, **bold**, *italic*, [text](https://...). Everything else is escaped. */
function inline(text) {
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return html;
}

/**
 * A changelog section's markdown as HTML: paragraphs, "- " lists (indented items nest one level),
 * "### " subheadings, inline code/bold/italic/links. Enough for a changelog, nothing more.
 */
export function markdownToHtml(markdown) {
  const out = [];
  let paragraph = [];
  let list = null;                 // {items: [{text, children: []}]}
  const flushParagraph = () => {
    if ( paragraph.length ) out.push(`<p>${inline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if ( !list ) return;
    const item = i => `<li>${inline(i.text)}${i.children.length ? `<ul>${i.children.map(c => `<li>${inline(c)}</li>`).join("")}</ul>` : ""}</li>`;
    out.push(`<ul>${list.items.map(item).join("")}</ul>`);
    list = null;
  };
  for ( const raw of String(markdown ?? "").split(/\r?\n/) ) {
    const bullet = raw.match(/^(\s*)[-*]\s+(.*)$/);
    if ( bullet ) {
      flushParagraph();
      list ??= {items: []};
      const nested = bullet[1].length >= 2 && list.items.length;
      if ( nested ) list.items.at(-1).children.push(bullet[2]);
      else list.items.push({text: bullet[2], children: []});
      continue;
    }
    if ( list && /^\s{2,}\S/.test(raw) ) {      // a wrapped list line
      const last = list.items.at(-1);
      if ( last.children.length ) last.children[last.children.length - 1] += ` ${raw.trim()}`;
      else last.text += ` ${raw.trim()}`;
      continue;
    }
    const heading = raw.match(/^###\s+(.*)$/);
    if ( heading ) {
      flushParagraph();
      flushList();
      out.push(`<h4>${inline(heading[1])}</h4>`);
      continue;
    }
    if ( !raw.trim() ) {
      flushParagraph();
      flushList();
      continue;
    }
    flushList();
    paragraph.push(raw.trim());
  }
  flushParagraph();
  flushList();
  return out.join("\n");
}
