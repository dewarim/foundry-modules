// dewarim-file-commander: two independent panes over Foundry's file storage, commander-style.
// Copy only - Foundry's server offers a client browse, create folder and upload, but no move, rename or
// delete (see ROADMAP.md). Every copy goes into a ledger (world setting), so the sources can be cleaned
// up later by hand or from the shell. Generic: no system-specific code. A copy can take the documents
// that used the original with it (repoint.mjs) - which is what makes "copy as" a rename.
import {basename, cleanFolderName, copyNames, crumbs, extensionOf, fileKind, join, parent, planCopy, select} from "./paths.mjs";
import {findUses, repoint} from "./repoint.mjs";

const MODULE_ID = "dewarim-file-commander";
const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;
const FilePicker = () => foundry.applications.apps.FilePicker.implementation;

const kinds = () => ({
  image: Object.keys(CONST.IMAGE_FILE_EXTENSIONS),
  video: Object.keys(CONST.VIDEO_FILE_EXTENSIONS),
  audio: Object.keys(CONST.AUDIO_FILE_EXTENSIONS)
});

class FileCommander extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options) {
    super(options);
    const saved = game.settings.get(MODULE_ID, "panes") ?? [];
    this.#panes = [0, 1].map(i => ({
      source: saved[i]?.source ?? "data",
      path: saved[i]?.path ?? (i === 0 ? "assets" : "modules"),
      listing: null,
      error: null,
      selected: new Set(),
      anchor: null,
      filter: ""
    }));
  }

  static DEFAULT_OPTIONS = {
    id: "dewarim-file-commander",
    classes: ["dewarim-file-commander"],
    window: {title: "DEWARIM_FILES.Title", icon: "fa-solid fa-folder-tree", resizable: true},
    position: {width: 1100, height: 680},
    actions: {
      up: FileCommander.#onUp,
      crumb: FileCommander.#onCrumb,
      refresh: FileCommander.#onRefresh,
      newFolder: FileCommander.#onNewFolder,
      copy: FileCommander.#onCopy,
      copyAs: FileCommander.#onCopyAs,
      copyPath: FileCommander.#onCopyPath,
      uses: FileCommander.#onUses,
      sameFolder: FileCommander.#onSameFolder
    }
  };

  static PARTS = {
    main: {template: `modules/${MODULE_ID}/templates/commander.hbs`}
  };

  #panes;
  #active = 0;
  #preview = null;
  #busy = false;

  get #other() {
    return 1 - this.#active;
  }

  /** Read a pane's folder; a folder that is gone falls back to its parent, then to the root. */
  async #load(index) {
    const pane = this.#panes[index];
    for ( let path = pane.path; ; path = parent(path) ) {
      try {
        pane.listing = await FilePicker().browse(pane.source, path);
        pane.path = pane.listing.target ?? path;
        pane.error = null;
        break;
      } catch(err) {
        pane.error = err.message;
        if ( !path ) {
          pane.listing = {dirs: [], files: []};
          break;
        }
      }
    }
    pane.selected = new Set([...pane.selected].filter(p => pane.listing.files.includes(p) || pane.listing.dirs.includes(p)));
  }

  async #save() {
    await game.settings.set(MODULE_ID, "panes", this.#panes.map(p => ({source: p.source, path: p.path})));
  }

  /** @override */
  async _prepareContext() {
    // First render (ApplicationV2 prepares the context before _preFirstRender): read both folders
    await Promise.all(this.#panes.map((pane, i) => pane.listing ? null : this.#load(i)));
    const k = kinds();
    const sources = [
      {value: "data", label: _loc("DEWARIM_FILES.Source.data")},
      {value: "public", label: _loc("DEWARIM_FILES.Source.public")}
    ];
    const panes = this.#panes.map((pane, index) => {
      const needle = pane.filter.trim().toLowerCase();
      const keep = p => !needle || basename(p).toLowerCase().includes(needle);
      const entry = (path, isDir) => {
        const kind = isDir ? "folder" : fileKind(path, k);
        return {path, name: basename(path), isDir, kind, isImage: kind === "image", selected: pane.selected.has(path)};
      };
      return {
        index,
        active: index === this.#active,
        sources: sources.map(s => ({...s, selected: s.value === pane.source})),
        crumbs: crumbs(pane.path, _loc(`DEWARIM_FILES.Source.${pane.source}`)),
        filter: pane.filter,
        error: pane.error,
        readonly: pane.source !== "data",
        dirs: pane.listing.dirs.filter(keep).map(p => entry(p, true)),
        files: pane.listing.files.filter(keep).map(p => entry(p, false)),
        count: pane.listing.files.length,
        selectedCount: [...pane.selected].filter(p => pane.listing.files.includes(p)).length
      };
    });
    const preview = this.#preview && {
      path: this.#preview,
      name: basename(this.#preview),
      kind: fileKind(this.#preview, k),
      isImage: fileKind(this.#preview, k) === "image",
      isVideo: fileKind(this.#preview, k) === "video",
      isAudio: fileKind(this.#preview, k) === "audio"
    };
    const target = this.#panes[this.#other];
    return {
      panes,
      preview,
      busy: this.#busy,
      canCopy: !this.#busy && (target.source === "data") && game.user.hasPermission("FILES_UPLOAD")
        && (panes[this.#active].selectedCount > 0),
      canCopyAs: !this.#busy && game.user.hasPermission("FILES_UPLOAD") && (panes[this.#active].selectedCount > 0)
        && this.#panes.some(p => p.source === "data"),
      copyLabel: _loc("DEWARIM_FILES.CopyTo", {count: panes[this.#active].selectedCount, folder: decodeURIComponent(target.path) || "/"}),
      ledger: game.settings.get(MODULE_ID, "ledger").length
    };
  }

  /** @override */
  _onRender(context, options) {
    const html = this.element;
    for ( const paneEl of html.querySelectorAll(".pane") ) {
      const index = Number(paneEl.dataset.index);
      paneEl.addEventListener("pointerdown", event => {
        if ( !event.target.closest("input, select, textarea, a, button") ) this.element.focus({preventScroll: true});
        if ( this.#active !== index ) {
          this.#active = index;
          this.#syncActive();
        }
      }, true);
      paneEl.querySelector("[name=source]").addEventListener("change", e => this.#navigate(index, "", e.target.value));
      const filter = paneEl.querySelector("[name=filter]");
      filter.addEventListener("input", foundry.utils.debounce(e => {
        this.#panes[index].filter = e.target.value;
        this.render({focusFilter: index});
      }, 200));
      if ( options.focusFilter === index ) {
        filter.focus();
        filter.setSelectionRange(filter.value.length, filter.value.length);
      }
      // Files from the other pane or from the desktop
      paneEl.addEventListener("dragover", e => {
        e.preventDefault();
        paneEl.classList.add("drag-over");
      });
      paneEl.addEventListener("dragleave", e => { if ( !paneEl.contains(e.relatedTarget) ) paneEl.classList.remove("drag-over"); });
      paneEl.addEventListener("drop", e => {
        paneEl.classList.remove("drag-over");
        this.#onDrop(e, index);
      });
    }
    for ( const el of html.querySelectorAll(".entry") ) {
      // No dblclick: the first click re-renders, so the element a dblclick would target is gone by then.
      // The second click's detail count says the same, on the new element.
      el.addEventListener("click", e => (e.detail >= 2 ? this.#onEntryOpen(e) : this.#onEntryClick(e)));
      el.addEventListener("dragstart", this.#onDragStart.bind(this));
    }
  }

  /** @override - the window element outlives re-renders, so its key handler is added once */
  _onFirstRender(context, options) {
    // List entries cannot take the focus, so the window does - otherwise the keys go to the page
    this.element.tabIndex = -1;
    this.element.addEventListener("keydown", this.#onKey.bind(this));
    return super._onFirstRender(context, options);
  }

  /** Move the "active pane" marker without a re-render (a click may be starting a drag). */
  #syncActive() {
    this.element.querySelectorAll(".pane").forEach((el, i) => el.classList.toggle("active", i === this.#active));
  }

  async #navigate(index, path, source) {
    const pane = this.#panes[index];
    if ( source ) pane.source = source;
    pane.path = path;
    pane.selected = new Set();
    pane.anchor = null;
    pane.filter = "";
    await this.#load(index);
    await this.#save();
    this.render();
  }

  #onEntryClick(event) {
    const el = event.currentTarget;
    const index = Number(el.closest(".pane").dataset.index);
    const pane = this.#panes[index];
    const order = [...el.closest(".pane").querySelectorAll(".entry")].map(e => e.dataset.path);
    const result = select(order, pane.selected, pane.anchor, el.dataset.path, {ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey});
    pane.selected = result.selected;
    pane.anchor = result.anchor;
    this.#active = index;
    if ( el.dataset.dir !== "true" ) this.#preview = el.dataset.path;
    this.render();
  }

  #onEntryOpen(event) {
    const el = event.currentTarget;
    const index = Number(el.closest(".pane").dataset.index);
    if ( el.dataset.dir === "true" ) return this.#navigate(index, el.dataset.path);
    window.open(foundry.utils.getRoute(el.dataset.path), "_blank");
  }

  /** Drag: Foundry's tile format (drop on the canvas -> a tile), plus the selection for the other pane. */
  #onDragStart(event) {
    const el = event.currentTarget;
    const index = Number(el.closest(".pane").dataset.index);
    const pane = this.#panes[index];
    if ( !pane.selected.has(el.dataset.path) ) {
      pane.selected = new Set([el.dataset.path]);
      pane.anchor = el.dataset.path;
    }
    const files = [...pane.selected].filter(p => pane.listing.files.includes(p));
    event.dataTransfer.setData("text/plain", JSON.stringify({
      type: "Tile",
      texture: {src: el.dataset.path},
      fromFilePicker: true,
      tileSize: canvas.dimensions?.size ?? 100,
      dewarimFiles: {pane: index, paths: files}
    }));
    event.dataTransfer.effectAllowed = "copy";
  }

  async #onDrop(event, index) {
    event.preventDefault();
    event.stopPropagation();
    const desktop = [...(event.dataTransfer?.files ?? [])];
    if ( desktop.length ) return this.#uploadFiles(index, desktop);
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    const paths = data.dewarimFiles?.paths ?? (data.texture?.src ? [data.texture.src] : []);
    if ( !paths.length ) return;
    if ( (data.dewarimFiles?.pane === index) && (parent(paths[0]) === this.#panes[index].path) ) return;
    return this.#copy(paths, index);
  }

  #onKey(event) {
    if ( event.target.matches("input, select, textarea") ) return;
    // Copy is F4, not the commander-classic F5: F5 reloads the page, and stays that way
    if ( event.key === "F4" ) {
      event.preventDefault();
      FileCommander.#onCopy.call(this);
    }
    else if ( event.key === "F6" ) {
      event.preventDefault();
      FileCommander.#onCopyAs.call(this);
    }
    else if ( event.key === "F7" ) {
      event.preventDefault();
      FileCommander.#onNewFolder.call(this);
    }
    else if ( event.key === "Backspace" ) {
      event.preventDefault();
      FileCommander.#onUp.call(this, event, this.element.querySelector(`.pane[data-index="${this.#active}"] [data-action=up]`));
    }
    else if ( event.key === "Tab" ) {
      event.preventDefault();
      this.#active = this.#other;
      this.render();
    }
  }

  /* -------------------------------------------- */
  /*  Copy                                        */
  /* -------------------------------------------- */

  /**
   * Copy files into a pane's folder: fetch each, upload under a name that is free there, record it.
   * @param {string[]} paths
   * @param {number} index  target pane
   * @param {string[]} [names]  wanted names - rename by copying
   */
  async #copy(paths, index, names) {
    const target = this.#panes[index];
    if ( target.source !== "data" ) return ui.notifications.warn("DEWARIM_FILES.ReadOnly", {localize: true});
    if ( !game.user.hasPermission("FILES_UPLOAD") ) return ui.notifications.warn("DEWARIM_FILES.NoUpload", {localize: true});
    this.#busy = true;
    this.render();
    const plan = planCopy(paths, target.path, target.listing.files.map(basename), names);
    const renamed = plan.filter(p => p.name !== p.wanted);
    if ( renamed.length ) {
      ui.notifications.warn(_loc("DEWARIM_FILES.NameTaken", {names: renamed.map(p => `${p.wanted} → ${p.name}`).join(", ")}));
    }
    const bar = ui.notifications.info(_loc("DEWARIM_FILES.Copying", {count: plan.length}), {progress: true});
    const ledger = [];
    const failed = [];
    for ( const [i, step] of plan.entries() ) {
      try {
        const response = await fetch(foundry.utils.getRoute(step.from));
        if ( !response.ok ) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        const result = await FilePicker().upload("data", target.path, new File([blob], step.name, {type: blob.type}), {}, {notify: false});
        if ( !result?.path ) throw new Error("upload refused");
        ledger.push({from: step.from, to: result.path, time: Date.now(), user: game.user.id});
      } catch(err) {
        failed.push(`${basename(step.from)}: ${err.message}`);
      }
      bar.update({pct: (i + 1) / plan.length});
    }
    if ( ledger.length ) await game.settings.set(MODULE_ID, "ledger", [...game.settings.get(MODULE_ID, "ledger"), ...ledger]);
    if ( failed.length ) ui.notifications.error(failed.join(" · "));
    if ( ledger.length ) ui.notifications.info(_loc("DEWARIM_FILES.Copied", {count: ledger.length, folder: decodeURIComponent(target.path)}));
    this.#busy = false;
    await this.#load(index);
    target.selected = new Set(ledger.map(l => l.to));
    if ( ledger.length === 1 ) this.#preview = ledger[0].to;     // show what was just made
    this.render();
    return ledger;
  }

  /** Files dropped from the desktop: upload into the pane's folder, never overwriting. */
  async #uploadFiles(index, files) {
    const target = this.#panes[index];
    if ( target.source !== "data" ) return ui.notifications.warn("DEWARIM_FILES.ReadOnly", {localize: true});
    if ( !game.user.hasPermission("FILES_UPLOAD") ) return ui.notifications.warn("DEWARIM_FILES.NoUpload", {localize: true});
    const plan = planCopy(files.map(f => f.name), target.path, target.listing.files.map(basename));
    const stored = [];
    for ( const [i, file] of files.entries() ) {
      const named = plan[i].name === file.name ? file : new File([file], plan[i].name, {type: file.type});
      const result = await FilePicker().upload("data", target.path, named, {}, {notify: false});
      if ( result?.path ) stored.push(result.path);
    }
    ui.notifications.info(_loc("DEWARIM_FILES.Uploaded", {count: stored.length, folder: decodeURIComponent(target.path)}));
    await this.#load(index);
    target.selected = new Set(stored);
    this.render();
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static #onUp(event, target) {
    const index = Number(target?.closest(".pane")?.dataset.index ?? this.#active);
    const pane = this.#panes[index];
    if ( pane.path ) return this.#navigate(index, parent(pane.path));
  }

  static #onCrumb(event, target) {
    return this.#navigate(Number(target.closest(".pane").dataset.index), target.dataset.path);
  }

  static async #onRefresh(event, target) {
    const index = Number(target.closest(".pane").dataset.index);
    await this.#load(index);
    this.render();
  }

  static async #onNewFolder(event, target) {
    const index = Number(target?.closest(".pane")?.dataset.index ?? this.#active);
    const pane = this.#panes[index];
    if ( pane.source !== "data" ) return ui.notifications.warn("DEWARIM_FILES.ReadOnly", {localize: true});
    const name = await foundry.applications.api.DialogV2.prompt({
      window: {title: "DEWARIM_FILES.NewFolder"},
      content: `<input type="text" name="folder" autofocus placeholder="${_loc("DEWARIM_FILES.FolderName")}">`,
      ok: {callback: (e, button) => button.form.elements.folder.value},
      rejectClose: false
    });
    const clean = cleanFolderName(name);
    if ( !clean ) return;
    try {
      const path = join(pane.path, foundry.utils.encodeURL(clean));
      await FilePicker().createDirectory("data", path);
      await this.#navigate(index, path);
    } catch(err) {
      ui.notifications.error(err.message);
    }
  }

  static async #onCopy() {
    const source = this.#panes[this.#active];
    const files = [...source.selected].filter(p => source.listing.files.includes(p));
    if ( files.length ) await this.#copy(files, this.#other);
  }

  /**
   * Copy as: the selected file(s) under a new name, into the same folder or the other pane. The way to
   * "rename" a generated "c0ecc5df-….jpg" - copy it as "goblin-chief", then copy that where it belongs.
   */
  static async #onCopyAs() {
    const index = this.#active;
    const pane = this.#panes[index];
    const files = [...pane.selected].filter(p => pane.listing.files.includes(p));
    if ( !files.length ) return ui.notifications.warn("DEWARIM_FILES.SelectFirst", {localize: true});
    const single = files.length === 1;
    const first = basename(files[0]);
    const ext = extensionOf(first);
    const stem = ext ? first.slice(0, -(ext.length + 1)) : first;
    const otherWritable = this.#panes[this.#other].source === "data";
    const here = pane.source === "data";
    if ( !here && !otherWritable ) return ui.notifications.warn("DEWARIM_FILES.ReadOnly", {localize: true});
    const esc = foundry.utils.escapeHTML;
    // One file that documents use: offer to take them along - copy as + repoint is a rename
    const uses = single && game.user.isGM ? findUses(files[0]) : [];
    const repointBox = uses.length ? `<label class="checkbox"><input type="checkbox" name="repoint" checked>
      ${_loc("DEWARIM_FILES.RepointAfterCopy", {count: uses.length})}</label>` : "";
    const choice = (where, button) => ({where, name: button.form.elements.name.value, repoint: !!button.form.elements.repoint?.checked});
    const result = await foundry.applications.api.DialogV2.wait({
      window: {title: "DEWARIM_FILES.CopyAs"},
      content: `<p>${single ? esc(first) : _loc("DEWARIM_FILES.CopyAsMany", {count: files.length})}</p>
        <input type="text" name="name" value="${single ? esc(stem) : ""}" autofocus
          placeholder="${single ? "" : "cave-{n}"}">
        <p class="hint">${_loc(single ? "DEWARIM_FILES.CopyAsHint" : "DEWARIM_FILES.CopyAsManyHint", {ext: ext || "–"})}</p>
        ${repointBox}`,
      buttons: [
        ...(here ? [{action: "here", label: "DEWARIM_FILES.CopyAsHere", icon: "fa-solid fa-clone", default: true,
          callback: (e, button) => choice(index, button)}] : []),
        ...(otherWritable ? [{action: "other", label: "DEWARIM_FILES.CopyAsOther", icon: "fa-solid fa-right-long", default: !here,
          callback: (e, button) => choice(this.#other, button)}] : [])
      ],
      rejectClose: false
    });
    if ( !result?.name?.trim() ) return;
    const names = copyNames(result.name, files.map(basename));
    const copied = await this.#copy(files, result.where, names);
    if ( result.repoint && (copied?.length === 1) ) await this.#repoint(copied[0].from, copied[0].to);
  }

  /** Point the documents using `from` at `to`, report, and note it in the ledger. */
  async #repoint(from, to) {
    const result = await repoint(from, to);
    if ( result.failed.length ) ui.notifications.error(result.failed.join(" · "));
    ui.notifications.info(_loc("DEWARIM_FILES.Repointed", {uses: result.uses, documents: result.documents, file: basename(to)}));
    const ledger = game.settings.get(MODULE_ID, "ledger").map(l => (l.from === from) && (l.to === to)
      ? {...l, repointed: (l.repointed ?? 0) + result.uses} : l);
    await game.settings.set(MODULE_ID, "ledger", ledger);
    return result;
  }

  /**
   * Where the previewed file is used, and - if the ledger knows copies of it, or the file it was copied
   * from - the offer to move those uses over.
   */
  static async #onUses() {
    const path = this.#preview;
    if ( !path ) return;
    const esc = foundry.utils.escapeHTML;
    const uses = findUses(path);
    const list = uses.map(({doc, plan}) => {
      const fields = plan.fields.length > 3 ? [...plan.fields.slice(0, 3), "…"] : plan.fields;
      return `<li><a data-uuid="${doc.uuid}">${esc(_loc(doc.constructor.metadata.label))}: ${esc(doc.name ?? doc.id)}</a>
        <span class="fields">${esc(fields.join(", "))}</span></li>`;
    }).join("");
    // Repoint offers from the ledger: this file's copies (uses move to the copy), the file it is a copy of
    // (that file's uses move here)
    const ledger = game.settings.get(MODULE_ID, "ledger");
    const offers = [];
    if ( uses.length ) {
      for ( const l of ledger.filter(l => l.from === path).slice(-3) ) offers.push({from: path, to: l.to, count: uses.length});
    }
    for ( const l of ledger.filter(l => l.to === path).slice(-3) ) {
      const count = findUses(l.from).length;
      if ( count ) offers.push({from: l.from, to: path, count});
    }
    const content = `<p><code>${esc(decodeURIComponent(path))}</code></p>
      <p>${uses.length ? _loc("DEWARIM_FILES.UsedBy", {count: uses.length}) : _loc("DEWARIM_FILES.NotUsed")}</p>
      ${uses.length ? `<ul class="fc-uses">${list}</ul>` : ""}
      ${offers.length && !game.user.isGM ? `<p class="hint">${_loc("DEWARIM_FILES.RepointGMOnly")}</p>` : ""}`;
    const buttons = (game.user.isGM ? offers : []).map((o, i) => ({
      action: `repoint${i}`,
      icon: "fa-solid fa-arrows-turn-right",
      label: o.from === path
        ? _loc("DEWARIM_FILES.RepointTo", {count: o.count, file: basename(o.to)})
        : _loc("DEWARIM_FILES.RepointFrom", {count: o.count, file: basename(o.from)}),
      callback: () => o
    }));
    buttons.push({action: "close", label: "Close", icon: "fa-solid fa-xmark", default: true});
    const choice = await foundry.applications.api.DialogV2.wait({
      window: {title: "DEWARIM_FILES.Uses"},
      classes: ["dewarim-file-commander-uses"],
      position: {width: 520},
      content,
      buttons,
      rejectClose: false,
      render: (event, dialog) => {
        for ( const a of dialog.element.querySelectorAll("[data-uuid]") ) {
          a.addEventListener("click", () => fromUuid(a.dataset.uuid).then(d => d?.sheet?.render(true)));
        }
      }
    });
    if ( choice?.from ) await this.#repoint(choice.from, choice.to);
  }

  /** Show the active pane's folder in the other pane too (commander "same folder"). */
  static async #onSameFolder() {
    const from = this.#panes[this.#active];
    const to = this.#panes[this.#other];
    to.source = from.source;
    await this.#navigate(this.#other, from.path);
  }

  static async #onCopyPath() {
    if ( !this.#preview ) return;
    await game.clipboard.copyPlainText(this.#preview);
    ui.notifications.info(_loc("DEWARIM_FILES.PathCopied", {path: this.#preview}));
  }
}

let app;

function open() {
  app ??= new FileCommander();
  return app.render({force: true});
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "panes", {scope: "client", config: false, type: Array, default: []});
  // Every copy: {from, to, time, user}. Sources listed here can be deleted once nothing uses them.
  game.settings.register(MODULE_ID, "ledger", {scope: "world", config: false, type: Array, default: []});
  game.keybindings.register(MODULE_ID, "open", {
    name: "DEWARIM_FILES.Open",
    editable: [{key: "KeyF", modifiers: ["Shift", "Alt"]}],
    restricted: true,
    onDown: () => { open(); return true; }
  });
});

Hooks.once("ready", () => {
  game.modules.get(MODULE_ID).api = {open, findUses, repoint};
});

// A button in the Settings sidebar, like the studio's
Hooks.on("renderSettings", (settings, html) => {
  if ( !game.user.hasPermission("FILES_BROWSE") || html.querySelector("[data-dewarim-files]") ) return;
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.dewarimFiles = "";
  button.innerHTML = `<i class="fa-solid fa-folder-tree" inert></i> ${_loc("DEWARIM_FILES.Title")}`;
  button.addEventListener("click", open);
  html.querySelector("section.settings")?.append(button);
});
