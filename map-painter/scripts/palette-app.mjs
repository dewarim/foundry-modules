// The palette: images from a few root folders (props, textures, Foundry's environment icons), browsable
// and filterable, the recently used ones on top. Picking one arms the current tool; their settings live
// here too. Filling the world with material is an action in the brush's settings, not a mode of its own
// (ROADMAP step 5).
//
// Two axes, not one list of tools. **The mode** says what a stroke means - *Floor*, *Wall* or *Prop*: the
// first two are the cell's one slot and replace each other, the third lies above it (slot-model.mjs).
// **The axis** says how it is drawn - with the brush over cells, or stamped as a tile. So a floor can be
// painted or stamped, and the questions the GM used to answer per stroke ("does this block view?", "is
// this a way through the rock?") are answered by the mode, once, in both. A prop is only ever stamped:
// props are things, placed one at a time, and a brush that repeats one over a region is not a thing to do.
import {readCarve} from "./carve-model.mjs";
import {PaintTool} from "./paint-tool.mjs";
import {canUndoReset, resetScene, undoReset} from "./repair.mjs";
import {StampTool} from "./stamp-tool.mjs";
import {hideWalls, showWalls} from "./wall-view.mjs";
import {KIND} from "./slot-model.mjs";
import {isImage, remember} from "./stamp-model.mjs";
import {decode, folderOf, relative, searchTree} from "./search-model.mjs";

export const MODULE_ID = "dewarim-map-painter";
const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;
const FilePicker = () => foundry.applications.apps.FilePicker.implementation;

/** Shown when the roots setting is empty: user data for one's own images, Foundry's own icons to start with. */
export const DEFAULT_ROOTS = [
  {source: "data", path: "assets/props"},
  {source: "data", path: "assets/textures"},
  {source: "public", path: "icons/environment"}
];

/** The modes, in the order the palette offers them: what a cell can be, then what lies on it. */
const MODES = [
  {key: KIND.FLOOR, icon: "fa-border-all", label: "DEWARIM_MAP.ModeFloor", hint: "DEWARIM_MAP.ModeFloorHint"},
  {key: KIND.WALL, icon: "fa-block-brick", label: "DEWARIM_MAP.ModeWall", hint: "DEWARIM_MAP.ModeWallHint"},
  {key: KIND.PROP, icon: "fa-cube", label: "DEWARIM_MAP.ModeProp", hint: "DEWARIM_MAP.ModePropHint"}
];

/**
 * The two ways to draw, under the modes. The mode says what a stroke means and the axis only how it is
 * made, which is why they are two rows and not five buttons: *Stamp* is not a third kind of thing beside
 * *Floor* and *Wall*. Each carries the sentence that says so, as its tooltip and in the help window.
 */
const AXES = [
  {key: "brush", icon: "fa-paint-roller", label: "DEWARIM_MAP.AxisBrush", hint: "DEWARIM_MAP.AxisBrushHint"},
  {key: "stamp", icon: "fa-stamp", label: "DEWARIM_MAP.AxisStamp", hint: "DEWARIM_MAP.AxisStampHint"}
];

/**
 * Mode and axis from what was remembered, including what the modes were called before them: "stamp"
 * placed props, "floor" was the brush, and "paint" and "carve" were the brush before that. A remembered
 * mode that no longer exists therefore lands on something sensible rather than on nothing.
 * @param {{mode?: string, axis?: string}} last
 */
function readMode(last) {
  const known = MODES.some(m => m.key === last.mode);
  const mode = known ? last.mode : ((last.mode === "stamp") ? KIND.PROP : KIND.FLOOR);
  let axis = ["brush", "stamp"].includes(last.axis) ? last.axis
    : ((mode === KIND.PROP) ? "stamp" : "brush");
  // A prop is stamped, never painted
  if ( mode === KIND.PROP ) axis = "stamp";
  return {mode, axis};
}

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

export class PaletteApp extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options) {
    super(options);
    const onChange = () => this.rendered && this.render();
    this.tools = {stamp: new StampTool({onChange}), brush: new PaintTool({onChange})};
    const last = game.settings.get(MODULE_ID, "last") ?? {};
    ({mode: this.#mode, axis: this.#axis} = readMode(last));
    this.#applyMode();
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
      openOnly: PaletteApp.#onOpenOnly,
      fillWorld: PaletteApp.#onFillWorld,
      removeRock: PaletteApp.#onRemoveRock,
      resetScene: PaletteApp.#onResetScene,
      undoReset: PaletteApp.#onUndoReset,
      mode: PaletteApp.#onMode,
      axis: PaletteApp.#onAxis,
      help: PaletteApp.#onHelp
    }
  };

  static PARTS = {
    main: {template: `modules/${MODULE_ID}/templates/palette.hbs`, scrollable: [".images"]}
  };

  #root;
  #path;
  /** What a stroke means: "floor" | "wall" | "prop" */
  #mode;
  /** How it is drawn, which is also the key of the tool that draws it: "brush" | "stamp" */
  #axis;
  #filter = "";
  /** {dirs, files} of the current folder, or {error} */
  #listing = null;
  /**
   * Folder listings for the search, keyed source:path.
   *
   * A search opens one folder per request, and it runs again on every keystroke - so without this
   * a ten-letter word would walk the tree ten times. Cleared whenever the palette navigates, so
   * what a search finds is never older than the folder the GM is standing in.
   */
  #browsed = new Map();

  /** The tool picking an image arms: the axis says which. */
  get tool() {
    return this.tools[this.#axis];
  }

  /** The current tool's own settings - the stamp's or the brush's. Both carry `src` and `kind`. */
  get #strokeSettings() {
    return (this.#axis === "stamp") ? this.tools.stamp.stamp : this.tools.brush.settings;
  }

  /**
   * Tell both tools what the mode means, so the one that draws the next stroke writes the right kind -
   * whichever it turns out to be. The brush never paints props (there is no such gesture), so in *Prop*
   * mode it keeps the floor it had: the axis is on the stamp then anyway.
   */
  #applyMode() {
    this.tools.brush.settings.kind = (this.#mode === KIND.PROP) ? KIND.FLOOR : this.#mode;
    this.tools.stamp.stamp.kind = this.#mode;
  }

  /** The image the current tool is armed with. */
  get #selected() {
    return this.#strokeSettings.src;
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
      this.#browsed.set(`${this.#source}:${this.#path}`, Promise.resolve(result));
      this.#listing = {dirs: result.dirs, files: result.files.filter(isImage)};
    } catch(err) {
      this.#listing = {dirs: [], files: [], error: err.message, missing: true};
    }
  }

  /** One folder, from the cache if the current search has already been there. */
  #browse(path) {
    const key = `${this.#source}:${path}`;
    if ( !this.#browsed.has(key) ) this.#browsed.set(key, FilePicker().browse(this.#source, path));
    return this.#browsed.get(key);
  }

  /** @override */
  async _prepareContext() {
    if ( !this.#listing ) await this.#load();
    const root = this.#roots[this.#root];
    const name = p => decode(p.split("/").pop());
    const stamp = this.tools.stamp.stamp;
    const selected = this.#selected;
    const segments = this.#path.slice(root?.path.length ?? 0).split("/").filter(Boolean);

    // A filter searches the whole tree below the current folder, not this one listing: what a GM
    // is after is hardly ever in the folder they happen to be standing in.
    //
    // Searching is asynchronous, and a later keystroke can finish before an earlier one - the
    // first walk pays for the requests while the next is served from the cache and overtakes it,
    // which would leave the box showing one word and the grid the results of another. So it is
    // repeated until what was searched for is still what is in the box. The repeat is free: by
    // then every folder it needs is cached.
    let needle = this.#filter.trim();
    let found = null;
    for ( let attempt = 0; (attempt < 3) && needle && !this.#listing.error; attempt++ ) {
      needle = this.#filter.trim();
      found = await searchTree({browse: path => this.#browse(path), root: this.#path, needle, isImage});
      if ( this.#filter.trim() === needle ) break;
    }
    const dirs = found ? found.dirs : this.#listing.dirs;
    const images = found ? found.files : this.#listing.files;
    const where = decode(this.#path.split("/").pop() ?? "");
    const rock = readCarve(canvas.scene?.getFlag(MODULE_ID, "carve"));
    return {
      roots: this.#roots.map((r, i) => ({index: i, selected: i === this.#root,
        label: r.label ?? `${r.source === "public" ? "Foundry" : _loc("DEWARIM_MAP.UserData")}: ${decode(r.path)}`})),
      canRemoveRoot: !!game.settings.get(MODULE_ID, "roots")?.length && !root?.module,
      crumbs: [{label: root?.module ? root.label : decode(root?.path.split("/").pop() ?? ""), path: root?.path ?? ""},
        ...segments.map((s, i) => ({label: decode(s), path: [root.path, ...segments.slice(0, i + 1)].join("/")}))],
      filter: this.#filter,
      error: this.#listing.error,
      canCreate: this.#listing.missing && (this.#source === "data") && game.user.hasPermission("FILES_UPLOAD"),
      dirs: dirs.map(p => ({path: p, name: found ? relative(p, this.#path) : name(p)})),
      images: images.map(p => ({
        path: p, name: name(p), selected: p === selected,
        // Where it was found, so two files called red.webp are told apart - and the tooltip is
        // the whole path below the search, since the caption has room for neither.
        sub: found ? folderOf(relative(p, this.#path)) : "",
        title: found ? relative(p, this.#path) : name(p)
      })),
      search: found ? this.#searchNote(found, needle, where) : null,
      recent: (game.settings.get(MODULE_ID, "recent") ?? []).map(p => ({path: p, name: name(p), selected: p === selected})),
      armed: this.tool.armed,
      selectedName: selected ? name(selected) : "",
      // What a stroke means, and how it is drawn
      modes: MODES.map(m => ({...m, active: m.key === this.#mode})),
      brushMode: this.#axis === "brush",
      propMode: this.#mode === KIND.PROP,
      // Each axis button says what it does; a brush that cannot be used says why instead
      axes: AXES.map(a => ({...a, active: a.key === this.#axis,
        off: (a.key === "brush") ? this.#brushOff() : null})),
      pickHint: (this.#axis === "brush") ? "DEWARIM_MAP.BrushHint" : "DEWARIM_MAP.PickHint",
      hasRock: !!rock,
      // The material the world is filled with, for the brush's settings
      material: rock ? {name: rock.rock.src ? name(rock.rock.src) : _loc("DEWARIM_MAP.BlackRock"),
        repeat: rock.rock.repeat, blocks: rock.blocks} : null,
      // Whether a *prop* blocks view: a wall always does and a floor never, so only props are asked
      blocks: !!stamp.blocks,
      hasSelection: !!selected,
      stamp,
      brush: {size: this.tools.brush.settings.brush, repeat: this.tools.brush.settings.repeat},
      squareGrid: !!canvas.grid?.isSquare,
      rotations: [0, 90, 180, 270].map(r => ({value: r, selected: r === stamp.rotation})),
      canUndo: this.tool.canUndo,
      canUndoReset: canUndoReset(),
      gridless: !!canvas.grid?.isGridless
    };
  }

  /** @override */
  _onRender(context, options) {
    // While the palette is open, what blocks sight is drawn on the map - no switching to the Walls
    // layer, which would take the canvas back from the painter and disarm it (wall-view.mjs)
    showWalls();
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
      if ( input.name === "blocks" ) this.tools.stamp.set({blocks: input.checked});
      else if ( input.name === "cells" ) this.tools.stamp.set({cells: clamp(value, 10)});
      else if ( input.name === "brush" ) this.tools.brush.set({brush: clamp(value, 10)});
      else if ( input.name === "repeat" ) this.tools.brush.set({repeat: clamp(value, 64)});
      else if ( input.name === "rockBlocks" ) this.#fill({blocks: input.checked});
      else this.tools.stamp.set({[input.name]: value});
    });
  }

  /** @override */
  _onClose(options) {
    this.disarmAll();
    hideWalls();
    return super._onClose(options);
  }

  /** What the search found, in words: how much, from where, and whether it stopped early. */
  #searchNote({files, dirs, folders, truncated, deep, failed}, needle, where) {
    const hits = files.length + dirs.length;
    const note = [];
    if ( truncated ) note.push(_loc("DEWARIM_MAP.SearchTruncated", {count: files.length}));
    else if ( deep ) note.push(_loc("DEWARIM_MAP.SearchDeep", {folders}));
    if ( failed.length ) note.push(_loc("DEWARIM_MAP.SearchFailed", {count: failed.length}));
    return {
      text: hits
        ? _loc("DEWARIM_MAP.SearchFound", {hits, folders, where})
        : _loc("DEWARIM_MAP.SearchNone", {needle, folders, where}),
      note: note.join(" ")
    };
  }

  async #go(root, path) {
    this.#root = root;
    this.#path = path ?? this.#roots[root]?.path ?? "";
    this.#filter = "";
    this.#listing = null;
    this.#browsed.clear();
    await this.#remember();
    this.render();
  }

  #remember() {
    return game.settings.set(MODULE_ID, "last",
      {root: this.#root, path: this.#path, mode: this.#mode, axis: this.#axis});
  }

  /**
   * Why the brush cannot be used, or null when it can. One place, because the rule is a rule and not a
   * drawing of one: the template disables the button from this, and #onAxis refuses from the same answer.
   */
  #brushOff() {
    if ( this.#mode === KIND.PROP ) return "DEWARIM_MAP.PropStampOnly";
    if ( !canvas.grid?.isSquare ) return "DEWARIM_MAP.PaintSquareOnly";
    return null;
  }

  /** What the next stroke means: floor, wall or prop. The image picked stays picked. */
  static async #onMode(event, target) {
    const mode = target.dataset.mode;
    if ( !MODES.some(m => m.key === mode) || (mode === this.#mode) ) return;
    this.#mode = mode;
    // Props are stamped: a brush in prop mode has nothing to draw
    return this.#switch((mode === KIND.PROP) ? "stamp" : this.#axis);
  }

  /** How it is drawn: with the brush over cells, or stamped as a tile. */
  static async #onAxis(event, target) {
    const axis = target.dataset.axis;
    if ( !(axis in this.tools) || (axis === this.#axis) ) return;
    // The button is disabled there, which is the whole of it in the window - but the rule belongs here
    // and not only in the template, which is where the *Wall* checkbox went wrong before it.
    if ( (axis === "brush") && this.#brushOff() ) return;
    return this.#switch(axis);
  }

  /**
   * The two questions a stroke answers, in one window: what it means, how it is drawn, and the rule that
   * ties them together. Built from the very strings the buttons carry as their tooltips, so the window
   * cannot drift away from them - and from the labels, so *Stamp* is read as an answer to "how".
   */
  static async #onHelp() {
    const item = x => `<li><strong>${_loc(x.label)}</strong> - ${_loc(x.hint)}</li>`;
    const section = (title, list) => `<h4>${_loc(title)}</h4><ul>${list.map(item).join("")}</ul>`;
    return foundry.applications.api.DialogV2.prompt({
      window: {title: "DEWARIM_MAP.Help"},
      position: {width: 520},
      content: section("DEWARIM_MAP.HelpWhat", MODES) + section("DEWARIM_MAP.HelpHow", AXES)
        + `<h4>${_loc("DEWARIM_MAP.HelpSlotTitle")}</h4><p>${_loc("DEWARIM_MAP.HelpSlot")}</p>`,
      // Our own key: core's German is not installed here, so APPLICATION.ACTIONS.Close would read "Close"
      ok: {label: "DEWARIM_MAP.Close", icon: "fa-solid fa-xmark"}
    });
  }

  /** Change mode or axis: the tool being left puts itself away, and the new one picks the image up. */
  async #switch(axis) {
    const src = this.#selected;
    if ( axis !== this.#axis ) this.tool.disarm();
    this.#axis = axis;
    this.#applyMode();
    await this.#remember();
    if ( src && !this.tool.armed ) await this.tool.arm(src);
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
      // Our own label again: prompt()'s default is COMMON.Confirm, which has no German here either
      ok: {label: "DEWARIM_MAP.Add", callback: (e, button) => button.form.elements.path.value.trim().replace(/^\/+|\/+$/g, "")},
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

  /** The brush with no texture: it opens the world and leaves the floor below as it is. */
  static async #onOpenOnly() {
    if ( this.#axis !== "brush" ) return;
    await this.tool.arm(null);
  }

  /** Fill the world with the selected image as its material - or with black rock when nothing is picked. */
  static #onFillWorld() {
    return this.#fill({});
  }

  /**
   * Cover the scene in material, or change the material it is covered with.
   * @param {{blocks?: boolean}} change  what the form changed; the rest comes from the selection
   */
  #fill(change) {
    if ( !canvas.scene ) return ui.notifications.warn("DEWARIM_MAP.NoScene", {localize: true});
    if ( !canvas.grid?.isSquare ) return ui.notifications.warn("DEWARIM_MAP.PaintSquareOnly", {localize: true});
    const rock = readCarve(canvas.scene.getFlag(MODULE_ID, "carve"));
    const brush = this.tools.brush.settings;
    return this.tools.brush.fillWorld(canvas.scene, {
      // Changing only the checkbox keeps the material; filling takes it from what is selected now
      src: ("blocks" in change) ? (rock?.rock.src ?? null) : (this.#selected ?? null),
      repeat: ("blocks" in change) ? (rock?.rock.repeat ?? brush.repeat) : brush.repeat,
      blocks: change.blocks ?? rock?.blocks ?? true
    });
  }

  /** Remove the scene's rock layer (tiles, walls, carving) after asking. */
  static async #onRemoveRock() {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: {title: "DEWARIM_MAP.RemoveRock"}, content: `<p>${_loc("DEWARIM_MAP.RemoveRockConfirm")}</p>`,
      // Our own keys, as for Close above: confirm() labels its buttons COMMON.Yes/COMMON.No, and core's
      // German is not installed here, so a German dialog would end in two English buttons.
      yes: {label: "DEWARIM_MAP.Yes"}, no: {label: "DEWARIM_MAP.No"}
    });
    if ( ok ) await this.tools.brush.removeRock();
    this.render();
  }

  /** Empty the scene so a test can start from nothing, and put it back (repair.mjs). */
  static async #onResetScene() {
    await resetScene();
    this.render();
  }

  static async #onUndoReset() {
    await undoReset();
    this.render();
  }

  static #onDisarm() {
    return this.tool.disarm();
  }
}
