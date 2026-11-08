// The half that fetches: image-gen's JSON API, as seen from inside Foundry. The address, the prompt and
// the polling policy are in imagegen-model.mjs, which has Node tests.
//
// image-gen runs on this machine only (it holds an API key and needs a GPU), so everything here is a
// local call that may simply not answer - and that is the normal case, not an error: the generator is not
// running. Every entry point checks `reachable()` first and says so instead of throwing.
import {MODULE_ID} from "./project.mjs";
import {POLL_TIMEOUT_MS, apiUrl, pollDelay, pollState} from "./imagegen-model.mjs";

/** System adapters say what a creature is, in words a picture model understands. */
const traitSources = [];

/**
 * @param {(actor: Actor) => string[]} fn  short phrases: "medium undead", "challenge rating 1"
 */
export function registerActorTraits(fn) {
  traitSources.push(fn);
}

/** What the system knows about this actor, for the prompt. A broken adapter costs its phrases, not the run. */
export function actorTraits(actor) {
  return traitSources.flatMap(fn => {
    try { return fn(actor) ?? []; }
    catch ( err ) { console.error(`${MODULE_ID} | actor traits:`, err); return []; }
  });
}

/* -------------------------------------------- */

function base() {
  return game.settings.get(MODULE_ID, "imageGenUrl");
}

/**
 * Every call carries a deadline. "Not running" is not always a refused connection: a half-started Spring
 * holds the port open and answers nothing, and a fetch without a timeout then never settles - which froze
 * the whole dialog, because its first render awaits the status.
 */
async function call(path, {method = "GET", body = null, timeout = 10_000} = {}) {
  const response = await fetch(apiUrl(base(), path), {
    method,
    headers: body ? {"Content-Type": "application/json"} : {},
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeout)
  });
  if ( !response.ok ) {
    // The API answers a refusal as plain text; a stack trace helps nobody in a dialog.
    const text = await response.text().catch(() => "");
    throw new Error(`${response.status} ${response.statusText}${text ? `: ${text.slice(0, 200)}` : ""}`);
  }
  return response.json();
}

/** The picture of a staged image, to show in the dialog before anything is kept. */
export function stagedUrl(url) {
  return apiUrl(base(), url);
}

/**
 * Is image-gen there, and what can it do? Null when it cannot be reached - which is a fact about this
 * machine, not a failure to report.
 * @returns {Promise<{ok: boolean, models: object[], foundry: object}|null>}
 */
export async function status() {
  try {
    // Short: this answer only decides whether the window offers anything, and the GM is waiting for it.
    return await call("/api/status", {timeout: 3000});
  }
  catch ( err ) {
    console.debug(`${MODULE_ID} | image-gen not reachable:`, err.message);
    return null;
  }
}

/** Submit a prompt; the pictures arrive through {@link waitForJob}. */
export async function generate(body) {
  return call("/api/generate", {method: "POST", body, timeout: 30_000});
}

/**
 * Poll until the job has pictures, has failed, or the wait runs out.
 * @param {number} jobId
 * @param {(job: object) => void} [onProgress]
 * @returns {Promise<object>}  the finished job
 */
export async function waitForJob(jobId, onProgress = () => {}) {
  const until = Date.now() + POLL_TIMEOUT_MS;
  for ( let attempt = 0; Date.now() < until; attempt++ ) {
    const job = await call(`/api/jobs/${jobId}`);
    onProgress(job);
    const state = pollState(job);
    if ( state.failed ) throw new Error(state.reason);
    if ( state.done ) return job;
    await new Promise(resolve => setTimeout(resolve, pollDelay(attempt)));
  }
  throw new Error(game.i18n.localize("DEWARIM_STUDIO.ImageGen.Timeout"));
}

/** Keep the chosen picture into image-gen's gallery (only a kept picture can be exported). */
export async function pick(jobId, stagedId) {
  return call(`/api/jobs/${jobId}/pick`, {method: "POST", body: {stagedId}});
}

/**
 * Copy a kept picture into Foundry's data folder.
 * @returns {Promise<{imageId: number, file: string, foundryPath: string|null}>}
 */
export async function exportToFoundry(imageId, subfolder) {
  const result = await call("/api/export", {method: "POST", body: {imageIds: [imageId], subfolder}, timeout: 30_000});
  return result.files?.[0] ?? null;
}
