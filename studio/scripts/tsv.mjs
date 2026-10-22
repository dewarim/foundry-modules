// Tab-separated text, the format spreadsheets put on the clipboard. LibreOffice and Excel quote a cell
// that contains a tab, a line break or a quote ("a ""b"""), so splitting on tabs and newlines is not
// enough. Pure, covered by test/tsv.test.mjs.

/**
 * @param {string} text
 * @returns {string[][]}  rows of cells; a trailing empty line is dropped
 */
export function parseTSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  let i = 0;
  const s = String(text).replace(/\r\n?/g, "\n");
  while ( i < s.length ) {
    const c = s[i];
    if ( quoted ) {
      if ( c === "\"" ) {
        if ( s[i + 1] === "\"" ) { cell += "\""; i += 2; continue; }
        quoted = false;
      }
      else cell += c;
      i++;
      continue;
    }
    if ( (c === "\"") && (cell === "") ) quoted = true;
    else if ( c === "\t" ) { row.push(cell); cell = ""; }
    else if ( c === "\n" ) { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
    i++;
  }
  if ( (cell !== "") || row.length ) { row.push(cell); rows.push(row); }
  return rows;
}

/** One cell, quoted when it has to be. */
function quote(value) {
  const s = String(value ?? "");
  return /[\t\n"]/.test(s) ? `"${s.replaceAll("\"", "\"\"")}"` : s;
}

/**
 * @param {string[]} header
 * @param {Array<Array<string|number|boolean>>} rows
 */
export function toTSV(header, rows) {
  return [header, ...rows].map(r => r.map(quote).join("\t")).join("\n");
}

/**
 * Which column each pasted header means: a data path, or a column's label (case-insensitive).
 * `_id` is kept as the identifying column. Unknown headers map to null.
 * @param {string[]} header
 * @param {{path: string, label: string}[]} columns
 * @returns {(string|null)[]}  data path (or "_id") per pasted column
 */
export function matchHeaders(header, columns) {
  return header.map(h => {
    const key = h.trim();
    if ( key === "_id" ) return "_id";
    const byPath = columns.find(c => c.path === key);
    if ( byPath ) return byPath.path;
    const byLabel = columns.find(c => c.label.toLowerCase() === key.toLowerCase());
    return byLabel?.path ?? null;
  });
}

/**
 * Turn pasted rows into records keyed by data path, and say how each finds its document:
 * by `_id` when that column exists, otherwise by `name`.
 * @param {string[][]} rows   parsed TSV including the header row
 * @param {{path: string, label: string}[]} columns
 * @returns {{paths: (string|null)[], key: "_id"|"name"|null, records: Record<string, string>[], unknownHeaders: string[]}}
 */
export function readPaste(rows, columns) {
  const [header = [], ...body] = rows;
  const paths = matchHeaders(header, columns);
  const key = paths.includes("_id") ? "_id" : (paths.includes("name") ? "name" : null);
  const records = body
    .filter(r => r.some(c => c.trim() !== ""))
    .map(r => Object.fromEntries(paths.map((p, i) => [p, r[i] ?? ""]).filter(([p]) => p)));
  return {paths, key, records, unknownHeaders: header.filter((h, i) => !paths[i])};
}
