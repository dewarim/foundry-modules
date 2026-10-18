// The palette: images from a few root folders (props, textures, Foundry's environment icons), browsable
// and filterable, the recently used ones on top. Picking one arms the current tool - the stamp (props as
// tiles) or the brush (textures painted into grid cells); their settings live here too.
import {isBlocking, setBlocking} from "./blocking.mjs";
import {PaintTool} from "./paint-tool.mjs";
import {StampTool} from "./stamp-tool.mjs";
import {isImage, remember} from "./stamp-model.mjs";

export const MODULE_ID = "dewarim-map-painter";
const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;
const FilePicker = () => foundry.applications.apps.FilePicker.implementation;

/** Shown when the roots setting is empty: user data for one's own images, Foundry's own icons to start with. */
export const DEFAULT_ROOTS = [
  {source: "data", path: "assets/props"},
  {source: "data", path: "assets/textures"},
  {source: "public", path: "icons/environment"}
];

/** Palette folders declared by active modules in their manifest (flags["dewarim-map-painter"].roots). */
function moduleRoots() {
  const roots = [];
  for ( const module of game.modules ) {
    if ( !module.active ) continue;
    for ( const r of module.flags?.[MODULE_ID]?.roots ?? [] ) {
      if ( r?.path ) roots.push({source: "data", path: r.path, label: r.label ?? module.title, module: module.id});
    }
  }
  return roots;
}

function decode(s) {
  try { return decodeURIComponent(s); }
  catch { return s; }
}

export class PaletteApp extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options) {
    super(options);
    const onChange = () => this.rendered && this.render();
    this.tools = {stamp: new StampTool({onChange}), paint: new PaintTool({onChange}),
      carve: new PaintTool({onChange, kind: "carve"})};
    const last = game.settings.get(MODULE_ID, "last") ?? {};
    this.#mode = (last.mode in this.tools) ? last.mode : "stamp";
    this.#root = Math.min(last.root ?? 0, Math.max(0, this.#roots.length - 1));
    this.#path = last.path ?? this.#roots[this.#root]?.path ?? "";
  }

  static DEFAULT_OPTIONS = {
    id: "dewarim-map-painter",
    classes: ["dewarim-map-painter"],
    window: {title: "DEWARIM_MAP.Title", icon: "fa-solid fa-paintbrush", resizable: true},
    position: {width: 360, height: 640, top: 80, left: 120},
    actions: {
      pick: PaletteApp.#onPick,
      enter: PaletteApp.#onEnter,
      crumb: PaletteApp.#onCrumb,
      createFolder: PaletteApp.#onCreateFolder,
      addRoot: PaletteApp.#onAddRoot,
      removeRoot: PaletteApp.#onRemoveRoot,
      undo: PaletteApp.#onUndo,
      disarm: PaletteApp.#onDisarm,
      blackRock: PaletteApp.#onBlackRock,
      removeRock: PaletteApp.#onRemoveRock,
      mode: PaletteApp.#onMode
    }
  };

  static PARTS = {
    main: {template: `modules/${MODULE_ID}/templates/palette.hbs`, scrollable: [".images"]}
  };

  #root;
  #path;
  /** "stamp" | "paint" */
  #mode;
  #filter = "";
  /** {dirs, files} of the current folder, or {error} */
  #listing = null;

  /** The tool picking an image arms. */
  get tool() {
    return this.tools[this.#mode];
  }

  /** The image the current tool is armed with. */
  get #selected() {
    return (this.#mode === "stamp") ? this.tools.stamp.stamp.src : this.tools[this.#mode].settings.src;
  }

  /** Put every tool away (closing, a scene change). */
  disarmAll() {
    for ( const tool of Object.values(this.tools) ) tool.disarm();
  }

  /** The folders the GM chose (the setting), or the defaults: these come first and can be removed. */
  get #ownRoots() {
    const roots = game.settings.get(MODULE_ID, "roots");
    return roots?.length ? roots : DEFAULT_ROOTS;
  }

  /** ... then the folders active modules declare: flags["dewarim-map-painter"].roots = [{path, label?}] */
  get #roots() {
    return [...this.#ownRoots, ...moduleRoots()];
  }

  get #source() {
    return this.#roots[this.#root]?.source ?? "data";
  }

  async #load() {
    try {
      const result = await FilePicker().browse(this.#source, this.#path);
      this.#listing = {dirs: result.dirs, files: result.files.filter(isImage)};
    } catch(err) {
      this.#listing = {dirs: [], files: [], error: err.message, missing: true};
    }
  }

  /** @override */
  async _prepareContext() {
    if ( !this.#listing ) await this.#load();
    const root = this.#roots[this.#root];
    const needle = this.#filter.trim().toLowerCase();
    const name = p => decode(p.split("/").pop());
    const keep = p => !needle || name(p).toLowerCase().includes(needle);
    const stamp = this.tools.stamp.stamp;
    const selected = this.#selected;
    const segments = this.#path.slice(root?.path.length ?? 0).split("/").filter(Boolean);
    return {
      roots: this.#roots.map((r, i) => ({index: i, selected: i === this.#root,
        label: r.label ?? `${r.source === "public" ? "Foundry" : _loc("DEWARIM_MAP.UserData")}: ${decode(r.path)}`})),
      canRemoveRoot: !!game.settings.get(MODULE_ID, "roots")?.length && !root?.module,
      crumbs: [{label: root?.module ? root.label : decode(root?.path.split("/").pop() ?? ""), path: root?.path ?? ""},
        ...segments.map((s, i) => ({label: decode(s), path: [root.path, ...segments.slice(0, i + 1)].join("/")}))],
      filter: this.#filter,
      error: this.#listing.error,
      canCreate: this.#listing.missing && (this.#source === "data") && game.user.hasPermission("FILES_UPLOAD"),
      dirs: this.#listing.dirs.filter(keep).map(p => ({path: p, name: name(p)})),
      images: this.#listing.files.filter(keep).map(p => ({path: p, name: name(p), selected: p === selected, blocks: isBlocking(p)})),
      recent: (game.settings.get(MODULE_ID, "recent") ?? []).map(p => ({path: p, name: name(p), selected: p === selected})),
      armed: this.tool.armed,
      selectedName: selected ? name(selected) : "",
      paintMode: this.#mode === "paint",
      carveMode: this.#mode === "carve",
      carve: this.tools.carve.settings,
      hasRock: !!canvas.scene?.getFlag(MODULE_ID, "carve"),
      blocks: isBlocking(selected),
      hasSelection: !!selected,
      stamp,
      paint: this.tools.paint.settings,
      squareGrid: !!canvas.grid?.isSquare,
      rotations: [0, 90, 180, 270].map(r => ({value: r, selected: r === stamp.rotation})),
      canUndo: this.tool.canUndo,
      gridless: !!canvas.grid?.isGridless
    };
  }

  /** @override */
  _onRender(context, options) {
    const html = this.element;
    html.querySelector("[name=root]")?.addEventListener("change", e => this.#go(Number(e.target.value)));
    const filter = html.querySelector("[name=filter]");
    filter?.addEventListener("input", foundry.utils.debounce(e => {
      this.#filter = e.target.value;
      this.render({focusFilter: true});
    }, 200));
    if ( options.focusFilter && filter ) {
      filter.focus();
      filter.setSelectionRange(filter.value.length, filter.value.length);
    }
    // Stamp settings
    const settings = html.querySelector(".stamp-settings");
    settings?.addEventListener("change", event => {
      const input = event.target;
      const value = input.type === "checkbox" ? input.checked : Number(input.value);
      const clamp = (v, max) => Math.min(max, Math.max(1, Math.round(v) || 1));
      if ( input.name === "blocks" ) {
        const src = this.#selected;
        if ( src ) setBlocking(src, input.checked).then(() => this.render());
        return;
      }
      if ( input.name === "cells" ) this.tools.stamp.set({cells: clamp(value, 10)});
      else if ( input.name === "brush" ) this.tool.set({brush: clamp(value, 10)});
      else if ( input.name === "repeat" ) this.tool.set({repeat: clamp(value, 64)});
      else if ( input.name === "rockBlocks" ) this.tools.carve.set({rockBlocks: input.checked});
      else this.tools.stamp.set({[input.name]: value});
    });
  }

  /** @override */
  _onClose(options) {
    this.disarmAll();
    return super._onClose(options);
  }

  async #go(root, path) {
    this.#root = root;
    this.#path = path ?? this.#roots[root]?.path ?? "";
    this.#filter = "";
    this.#listing = null;
    await this.#remember();
    this.render();
  }

  #remember() {
    return game.settings.set(MODULE_ID, "last", {root: this.#root, path: this.#path, mode: this.#mode});
  }

  /** Switch between stamp and brush; the image picked stays picked. */
  static async #onMode(event, target) {
    const mode = target.dataset.mode;
    if ( !(mode in this.tools) || (mode === this.#mode) ) return;
    const src = this.#selected;
    this.tool.disarm();
    this.#mode = mode;
    await this.#remember();
    if ( src ) await this.tool.arm(src);
    this.render();
  }

  static async #onPick(event, target) {
    const src = target.dataset.path;
    if ( this.#selected === src ) return this.tool.disarm();
    await game.settings.set(MODULE_ID, "recent", remember(game.settings.get(MODULE_ID, "recent"), src));
    await this.tool.arm(src);
  }

  static #onEnter(event, target) {
    return this.#go(this.#root, target.dataset.path);
  }

  static #onCrumb(event, target) {
    return this.#go(this.#root, target.dataset.path);
  }

  /** The root folder does not exist yet (assets/props on a fresh world): make it. */
  static async #onCreateFolder() {
    const parts = this.#path.split("/").filter(Boolean);
    for ( let i = 1; i <= parts.length; i++ ) {
      try { await FilePicker().createDirectory("data", parts.slice(0, i).join("/")); }
      catch(err) { if ( !String(err.message).includes("EEXIST") ) console.debug(err); }
    }
    this.#listing = null;
    this.render();
  }

  static async #onAddRoot() {
    const path = await foundry.applications.api.DialogV2.prompt({
      window: {title: "DEWARIM_MAP.AddRoot"},
      content: `<p>${_loc("DEWARIM_MAP.AddRootHint")}</p><input type="text" name="path" value="${foundry.utils.escapeHTML(this.#path)}" autofocus>`,
      ok: {callback: (e, button) => button.form.elements.path.value.trim().replace(/^\/+|\/+$/g, "")},
      rejectClose: false
    });
    if ( !path ) return;
    const source = /^(icons|ui|sounds|cards|assets\/core)\//.test(path) ? "public" : "data";
    const roots = [...this.#ownRoots.filter(r => (r.path !== path) || (r.source !== source)), {source, path}];
    await game.settings.set(MODULE_ID, "roots", roots);
    return this.#go(roots.length - 1);
  }

  static async #onRemoveRoot() {
    const roots = this.#ownRoots.filter((r, i) => i !== this.#root);
    await game.settings.set(MODULE_ID, "roots", roots);
    return this.#go(0);
  }

  static #onUndo() {
    return this.tool.undo();
  }

  /** Carve mode without an image: plain black rock. */
  static async #onBlackRock() {
    if ( this.#mode !== "carve" ) return;
    await this.tool.arm(null);
  }

  /** Remove the scene's rock layer (tiles, walls, carving) after asking. */
  static async #onRemoveRock() {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: {title: "DEWARIM_MAP.RemoveRock"}, content: `<p>${_loc("DEWARIM_MAP.RemoveRockConfirm")}</p>`
    });
    if ( ok ) await this.tools.carve.removeRock();
    this.render();
  }

  static #onDisarm() {
    return this.tool.disarm();
  }
}
