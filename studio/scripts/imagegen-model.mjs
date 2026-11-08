// The pure half of talking to image-gen (~/code/image-gen, a local Spring application): the address, the
// prompt built from an actor, the request bodies, and when to stop polling. No Foundry globals, so
// `node --test` covers it (test/imagegen-model.test.mjs). The half that fetches is imagegen.mjs.
//
// Foundry drives and image-gen answers. The other direction cannot work: a world's actors live in a
// LevelDB the running world holds a lock on, and a write behind its back is not seen by it anyway. So the
// studio, which is already inside Foundry where the documents are live, asks for a picture and writes it
// into the actor itself.

/** The sizes image-gen accepts (JobService.MIN_SIZE/MAX_SIZE/SIZE_STEP). */
export const SIZES = {min: 512, max: 1536, step: 64};

/** A portrait is taller than wide; these are the defaults the dialog opens with. */
export const DEFAULT_SIZE = {width: 768, height: 1024};

/** What is added to the words about the actor, so a GM does not have to type it every time. */
export const PROMPT_STYLE = "fantasy RPG character portrait, head and shoulders, painterly, plain background";

/**
 * Join a base address and a path without doubling or losing the slash between them.
 * @param {string} base  e.g. "http://127.0.0.1:8090" or with a trailing slash
 * @param {string} path  e.g. "/api/status"
 * @returns {string}
 */
export function apiUrl(base, path) {
  return `${String(base ?? "").replace(/\/+$/, "")}/${String(path ?? "").replace(/^\/+/, "")}`;
}

/**
 * The words for one actor: its name, what the system knows about it, and the style. The traits come from
 * the system adapter, because a creature type and a challenge rating are not things a generic module
 * knows - and an actor with no adapter still gets a usable prompt from its name alone.
 * @param {object} actor            `name`, and `traits`: short phrases from the adapter
 * @param {object} [options]
 * @param {string} [options.style]  replaces PROMPT_STYLE
 * @returns {string}
 */
export function npcPrompt({name, traits = []} = {}, {style = PROMPT_STYLE} = {}) {
  const words = [name, ...traits].map(w => String(w ?? "").trim()).filter(Boolean);
  return [...words, style].filter(Boolean).join(", ");
}

/** Sizes are clamped and snapped the way image-gen would clamp them, so the dialog cannot ask for a refusal. */
export function clampSize(value, {min, max, step} = SIZES) {
  const number = Number(value);
  if ( !Number.isFinite(number) ) return min;
  return Math.min(max, Math.max(min, Math.round(number / step) * step));
}

/**
 * The body of POST /api/generate.
 * @returns {{prompt: string, width: number, height: number, count: number, modelId?: string}}
 */
export function generateBody({prompt, width, height, count = 1, modelId = null} = {}) {
  const body = {
    prompt: String(prompt ?? "").trim(),
    width: clampSize(width ?? DEFAULT_SIZE.width),
    height: clampSize(height ?? DEFAULT_SIZE.height),
    count: Math.min(4, Math.max(1, Math.round(Number(count) || 1)))
  };
  if ( modelId ) body.modelId = modelId;
  return body;
}

/**
 * What to do with a job's answer while waiting. A job that is done but has no pictures is not finished
 * arriving - ComfyUI reports the job before the files are staged - so that is waiting, not an empty result.
 * @param {{status: string, error: string|null, images: object[]}} job
 * @returns {{done: boolean, failed: boolean, reason: string|null}}
 */
export function pollState(job) {
  const status = String(job?.status ?? "").toUpperCase();
  const images = job?.images ?? [];
  if ( (status === "FAILED") || (status === "LOST") ) {
    return {done: true, failed: true, reason: job?.error || status};
  }
  if ( (status === "DONE") && images.length ) return {done: true, failed: false, reason: null};
  return {done: false, failed: false, reason: null};
}

/**
 * How long to wait before asking again: quickly at first, then every two seconds, and a cap on the whole
 * wait so a generator that never answers does not leave the dialog spinning forever.
 * @param {number} attempt  0 for the first wait
 * @returns {number}  milliseconds
 */
export function pollDelay(attempt) {
  return (attempt < 3) ? 600 : 2000;
}

/** Give up after this long; a FLUX picture takes seconds, a queue behind it maybe a minute. */
export const POLL_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Where the picture should be written. `foundryPath` is what the API answers for a file inside a Foundry
 * data directory; without it the file exists but Foundry cannot address it, and saying so is better than
 * writing a path that would show a broken image.
 * @param {{foundryPath: string|null, file: string}} exported
 * @returns {{path: string|null, problem: string|null}}
 */
export function picturePath(exported) {
  if ( exported?.foundryPath ) return {path: exported.foundryPath, problem: null};
  return {path: null, problem: exported?.file ?? null};
}
