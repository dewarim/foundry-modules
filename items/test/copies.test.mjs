// rng.mjs and tsv.mjs are copies of the merchants' and the studio's (modules cannot import each other's
// files): they must not drift apart.
import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const body = path => readFileSync(new URL(path, import.meta.url), "utf8").split("\n")
  .filter(line => !line.startsWith("//")).join("\n");

test("the random numbers are the merchants'", () => {
  assert.equal(body("../scripts/rng.mjs"), body("../../dewarim-merchants/scripts/rng.mjs"));
});

test("the spreadsheet text is the studio's", () => {
  assert.equal(body("../scripts/tsv.mjs"), body("../../dewarim-studio/scripts/tsv.mjs"));
});
