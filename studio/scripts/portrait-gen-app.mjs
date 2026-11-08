// A portrait for an actor, generated on this machine: the prompt is built from the actor, the pictures
// come back from image-gen, and the one the GM picks is written into the actor. Nothing is applied before
// it has been looked at - a bulk run that silently replaces twelve portraits is the version to regret.
import {MODULE_ID} from "./project.mjs";
import {DEFAULT_SIZE, SIZES, generateBody, npcPrompt, picturePath} from "./imagegen-model.mjs";
import {actorTraits, exportToFoundry, generate, pick, stagedUrl, status, waitForJob} from "./imagegen.mjs";

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;

export class PortraitGenApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dewarim-studio-portrait-gen",
    classes: ["dewarim-studio", "dewarim-studio-portrait-gen"],
    window: {title: "DEWARIM_STUDIO.ImageGen.Title", icon: "fa-solid fa-wand-magic-sparkles", resizable: true},
    position: {width: 560, height: "auto"},
    actions: {
      run: PortraitGenApp.#onRun,
      choose: PortraitGenApp.#onChoose
    }
  };

  static PARTS = {
    main: {template: `modules/${MODULE_ID}/templates/portrait-gen.hbs`, scrollable: [""]}
  };

  /** @param {Actor} actor */
  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
    this.#prompt = npcPrompt({name: actor.name, traits: actorTraits(actor)});
  }

  #prompt = "";
  #knobs = {...DEFAULT_SIZE, count: 2};
  #service = undefined;   // undefined: not asked yet; null: not reachable
  #busy = false;
  #note = null;
  #images = [];
  #jobId = null;

  /** @override */
  async _prepareContext() {
    if ( this.#service === undefined ) this.#service = await status();
    return {
      actor: {name: this.actor.name, img: this.actor.img},
      reachable: !!this.#service,
      url: game.settings.get(MODULE_ID, "imageGenUrl"),
      models: this.#service?.models ?? [],
      noFoundryFolder: !!this.#service && !this.#service.foundry?.path,
      folder: this.#service?.foundry?.dir,
      prompt: this.#prompt,
      // What the GM set, not the defaults: a render happens after every run, and a window that forgets
      // the size and the number of pictures makes the second attempt a retyping exercise.
      sizes: {...SIZES, ...this.#knobs},
      busy: this.#busy,
      note: this.#note,
      images: this.#images.map(i => ({...i, url: stagedUrl(i.url)}))
    };
  }

  /* -------------------------------------------- */

  /**
   * An ApplicationV2 window is a div, not a form - `element.elements` does not exist here, which is the
   * kind of thing only the browser says out loud.
   */
  #field(name) {
    return this.element.querySelector(`[name="${name}"]`);
  }

  static async #onRun() {
    this.#prompt = this.#field("prompt").value;
    const body = generateBody({
      prompt: this.#prompt,
      width: this.#field("width").value,
      height: this.#field("height").value,
      count: this.#field("count").value,
      modelId: this.#field("modelId")?.value || null
    });
    this.#knobs = {width: body.width, height: body.height, count: body.count};
    if ( !body.prompt ) return ui.notifications.warn("DEWARIM_STUDIO.ImageGen.NoPrompt", {localize: true});
    this.#busy = true;
    this.#images = [];
    this.#note = game.i18n.localize("DEWARIM_STUDIO.ImageGen.Working");
    await this.render();
    try {
      const {jobId} = await generate(body);
      this.#jobId = jobId;
      const job = await waitForJob(jobId, j => {
        this.#note = game.i18n.format("DEWARIM_STUDIO.ImageGen.Status", {status: j.status});
      });
      this.#images = job.images;
      this.#note = null;
    }
    catch ( err ) {
      this.#note = err.message;
      console.error(`${MODULE_ID} | image-gen:`, err);
    }
    finally {
      this.#busy = false;
      await this.render();
    }
  }

  /** The picture the GM clicked: keep it, export it, write it into the actor. */
  static async #onChoose(event, target) {
    const stagedId = Number(target.dataset.stagedId);
    const asToken = !!this.#field("asToken")?.checked;
    this.#busy = true;
    this.#note = game.i18n.localize("DEWARIM_STUDIO.ImageGen.Saving");
    await this.render();
    try {
      const kept = await pick(this.#jobId, stagedId);
      const exported = await exportToFoundry(kept.imageId, "npcs");
      const {path, problem} = picturePath(exported);
      if ( !path ) throw new Error(game.i18n.format("DEWARIM_STUDIO.ImageGen.OutsideFoundry", {file: problem}));
      const update = {img: path};
      if ( asToken ) update["prototypeToken.texture.src"] = path;
      await this.actor.update(update);
      ui.notifications.info(game.i18n.format("DEWARIM_STUDIO.ImageGen.Applied", {name: this.actor.name}));
      return this.close();
    }
    catch ( err ) {
      this.#note = err.message;
      console.error(`${MODULE_ID} | image-gen:`, err);
      this.#busy = false;
      return this.render();
    }
  }
}
