import {test} from "node:test";
import assert from "node:assert/strict";
import {matchHeaders, parseTSV, readPaste, toTSV} from "../scripts/tsv.mjs";

test("parseTSV: plain, CRLF, trailing newline", () => {
  assert.deepEqual(parseTSV("a\tb\r\nc\td\r\n"), [["a", "b"], ["c", "d"]]);
  assert.deepEqual(parseTSV("a\t\tc"), [["a", "", "c"]]);
});

test("parseTSV: quoted cells with tabs, newlines and quotes", () => {
  assert.deepEqual(parseTSV("\"x\ty\"\t\"line1\nline2\"\t\"say \"\"hi\"\"\"\nnext"),
    [["x\ty", "line1\nline2", "say \"hi\""], ["next"]]);
});

test("toTSV round-trips through parseTSV", () => {
  const header = ["name", "system.details.cr"];
  const rows = [["Goblin", 0.25], ["Orc\t\"Boss\"", "1/2"], ["Two\nLines", ""]];
  assert.deepEqual(parseTSV(toTSV(header, rows)), [header, ...rows.map(r => r.map(String))]);
});

test("matchHeaders by path, label, _id", () => {
  const columns = [{path: "name", label: "Name"}, {path: "system.details.cr", label: "Challenge Rating"}];
  assert.deepEqual(matchHeaders(["_id", "challenge rating", "name", "notes"], columns), ["_id", "system.details.cr", "name", null]);
});

test("readPaste: records, key, unknown headers, blank rows skipped", () => {
  const columns = [{path: "name", label: "Name"}, {path: "system.details.cr", label: "CR"}];
  const r = readPaste([["Name", "CR", "Notes"], ["Goblin", "1/4", "x"], ["", "", ""], ["Orc", "1/2", ""]], columns);
  assert.equal(r.key, "name");
  assert.deepEqual(r.records, [{name: "Goblin", "system.details.cr": "1/4"}, {name: "Orc", "system.details.cr": "1/2"}]);
  assert.deepEqual(r.unknownHeaders, ["Notes"]);
  assert.equal(readPaste([["CR"], ["1"]], columns).key, null);
});
