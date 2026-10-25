// The filter parser is a copy of the studio's (modules cannot import each other's files): the two must
// not drift apart.
import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const body = path => readFileSync(new URL(path, import.meta.url), "utf8").split("\n")
  .filter(line => !line.startsWith("//")).join("\n");

test("the filter parser is the studio's", () => {
  assert.equal(body("../scripts/filters.mjs"), body("../../dewarim-studio/scripts/filters.mjs"));
});
