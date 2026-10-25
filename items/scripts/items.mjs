// dewarim-items: item templates. A base item, aspects that change it (strength of its heal or damage, price,
// weight, rarity, any data path, a rider - a save that guards a side effect) and a variance that makes
// several items of it: a rolled range, fixed tiers, or rows typed or pasted like a spreadsheet for quick
// mundane items. Generated items are world items in a folder (merchants take a folder as a source, the
// studio builds a project's folder into its adventure); `api.vary` gives merchants' craft its variants.
// System code lives in systems/<id>.mjs; other systems get the generic fallback.
import {adapter, registerAdapter} from "./adapter.mjs";
import {MODULE_ID, build, deleteTemplate, generate, getTemplate, saveTemplate, templates, vary} from "./generate.mjs";
import {ItemsApp} from "./items-app.mjs";
import {registerChangelog} from "./shared/changelog.mjs";

// After an install or update, GMs see what changed (CHANGELOG.md)
registerChangelog(MODULE_ID);

let app;

/**
 * The template editor.
 * @param {{folder?: string, template?: string}} [options]  folder: where new templates write (the studio's
 *                                                           project folder); template: the one to show
 */
function open(options = {}) {
  app ??= new ItemsApp();
  app.configure(options);
  return app.render({force: true});
}

Hooks.once("init", async () => {
  game.settings.register(MODULE_ID, "templates", {scope: "world", config: false, type: Array, default: []});
  game.settings.register(MODULE_ID, "automateRiders", {
    name: "DEWARIM_ITEMS.Settings.AutomateRiders", hint: "DEWARIM_ITEMS.Settings.AutomateRidersHint",
    scope: "world", config: game.system.id === "dnd5e", type: Boolean, default: true
  });
  game.settings.register(MODULE_ID, "rarityThresholds", {
    name: "DEWARIM_ITEMS.Settings.Thresholds", hint: "DEWARIM_ITEMS.Settings.ThresholdsHint",
    scope: "world", config: game.system.id === "dnd5e", type: String, default: "100, 500, 5000, 50000"
  });
  game.settings.registerMenu(MODULE_ID, "templatesMenu", {
    name: "DEWARIM_ITEMS.Title", label: "DEWARIM_ITEMS.Open", hint: "DEWARIM_ITEMS.Hint",
    icon: "fa-solid fa-flask-vial", type: ItemsApp, restricted: true
  });

  if ( game.system.id === "dnd5e" ) (await import("./systems/dnd5e.mjs")).register({registerAdapter});
  else {
    for ( const key of ["price", "weight"] ) {
      game.settings.register(MODULE_ID, `generic.${key}`, {
        name: `DEWARIM_ITEMS.Generic.${key}`, hint: "DEWARIM_ITEMS.Generic.Hint",
        scope: "world", config: true, type: String, default: ""
      });
    }
    (await import("./systems/generic.mjs")).register({registerAdapter});
  }
});

Hooks.once("ready", () => {
  game.modules.get(MODULE_ID).api = {
    templates, getTemplate, saveTemplate, deleteTemplate, generate, vary, open,
    preview: async template => (await build(template)).items.map(i => ({key: i.key, name: i.data.name, ...adapter.summary(i.data)})),
    presets: () => adapter.presets?.() ?? [],
    adapter: {
      id: adapter.id,
      aspectKinds: [...(adapter.aspectKinds ?? [])]
    }
  };
});

// A button in the Items sidebar for GMs
Hooks.on("renderItemDirectory", (directory, html) => {
  if ( !game.user.isGM ) return;
  const root = html instanceof HTMLElement ? html : html[0];
  const actions = root?.querySelector(".header-actions");
  if ( !actions || actions.querySelector(`.${MODULE_ID}-open`) ) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = `${MODULE_ID}-open`;
  button.innerHTML = `<i class="fa-solid fa-flask-vial" inert></i> ${_loc("DEWARIM_ITEMS.Open")}`;
  button.addEventListener("click", () => open());
  actions.append(button);
});
