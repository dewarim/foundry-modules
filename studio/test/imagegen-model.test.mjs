import {test} from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SIZE, POLL_TIMEOUT_MS, PROMPT_STYLE, SIZES, apiUrl, clampSize, generateBody, npcPrompt,
  picturePath, pollDelay, pollState
} from "../scripts/imagegen-model.mjs";

test("apiUrl: one slash, whatever the setting looks like", () => {
  assert.equal(apiUrl("http://127.0.0.1:8090", "/api/status"), "http://127.0.0.1:8090/api/status");
  assert.equal(apiUrl("http://127.0.0.1:8090/", "api/status"), "http://127.0.0.1:8090/api/status");
  assert.equal(apiUrl("http://127.0.0.1:8090///", "///api/status"), "http://127.0.0.1:8090/api/status");
});

test("the prompt: the name, what the system knows, then the style", () => {
  assert.equal(npcPrompt({name: "Marvin", traits: ["medium humanoid", "challenge rating 1"]}),
    `Marvin, medium humanoid, challenge rating 1, ${PROMPT_STYLE}`);
});

test("an actor without a system adapter still gets a usable prompt", () => {
  assert.equal(npcPrompt({name: "Marvin"}), `Marvin, ${PROMPT_STYLE}`);
  assert.equal(npcPrompt({name: "Marvin", traits: ["", null, "  "]}), `Marvin, ${PROMPT_STYLE}`);
});

test("a style of its own replaces the default, and an empty one leaves only the words", () => {
  assert.equal(npcPrompt({name: "Marvin"}, {style: "woodcut"}), "Marvin, woodcut");
  assert.equal(npcPrompt({name: "Marvin"}, {style: ""}), "Marvin");
});

test("sizes are snapped to what image-gen accepts, so it cannot refuse the request", () => {
  assert.equal(clampSize(1000), 1024);
  assert.equal(clampSize(10), SIZES.min);
  assert.equal(clampSize(99999), SIZES.max);
  assert.equal(clampSize("nonsense"), SIZES.min);
  assert.equal(clampSize(768), 768);
});

test("the generate body: trimmed, clamped, counted, and no modelId unless one was chosen", () => {
  assert.deepEqual(generateBody({prompt: "  a goblin  "}),
    {prompt: "a goblin", width: DEFAULT_SIZE.width, height: DEFAULT_SIZE.height, count: 1});
  assert.deepEqual(generateBody({prompt: "x", width: 1000, height: 10, count: 99, modelId: "flux"}),
    {prompt: "x", width: 1024, height: SIZES.min, count: 4, modelId: "flux"});
  assert.equal(generateBody({prompt: "x", count: 0}).count, 1);
});

test("polling: done means done *and* pictures, because the job is reported before they are staged", () => {
  assert.deepEqual(pollState({status: "QUEUED", images: []}), {done: false, failed: false, reason: null});
  assert.deepEqual(pollState({status: "RUNNING", images: []}), {done: false, failed: false, reason: null});
  assert.deepEqual(pollState({status: "DONE", images: []}), {done: false, failed: false, reason: null});
  assert.deepEqual(pollState({status: "DONE", images: [{stagedId: 1}]}), {done: true, failed: false, reason: null});
});

test("polling: a failure says why, and a lost job is a failure too", () => {
  assert.deepEqual(pollState({status: "FAILED", error: "out of memory", images: []}),
    {done: true, failed: true, reason: "out of memory"});
  assert.deepEqual(pollState({status: "LOST", error: null, images: []}),
    {done: true, failed: true, reason: "LOST"});
  // Nothing at all is not a result: keep waiting rather than report a success nobody reported
  assert.deepEqual(pollState(undefined), {done: false, failed: false, reason: null});
});

test("the wait grows, and the whole wait is capped", () => {
  assert.equal(pollDelay(0), 600);
  assert.equal(pollDelay(2), 600);
  assert.equal(pollDelay(3), 2000);
  assert.ok(POLL_TIMEOUT_MS >= 60_000);
});

test("a file outside a Foundry data folder is named, not written into the actor", () => {
  assert.deepEqual(picturePath({foundryPath: "assets/image-gen/a.png", file: "/x/a.png"}),
    {path: "assets/image-gen/a.png", problem: null});
  assert.deepEqual(picturePath({foundryPath: null, file: "/tmp/a.png"}), {path: null, problem: "/tmp/a.png"});
});
