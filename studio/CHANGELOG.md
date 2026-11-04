# Changelog

## 0.2.0 (2026-11-04)

- Placing an encounter or a merchant by clicking the canvas is cancelled by a scene change, instead
  of waiting for a click on a canvas that is gone.

- **Item templates** (with *Dewarim: Item templates*): opens the template editor, generating into the
  active project's Item folder, so the items join the adventure.
- **Merchants** (with *Dewarim: Merchants*): a table of all merchants, new ones from templates, place
  them on a scene, several as a market (an encounter draft), custom stock from the source panel. The
  build follows a merchant's sources and leaves out placed merchants' restock state.
- After an install or update, a GM sees what changed; *What's new* in the module settings shows the
  whole history.

## 0.1.0 (2026-10-22)

- Projects are content modules: put world documents into one, *Build* writes them into its Adventure
  compendium, with the files copied into the module.
- **Tables** for actors, items, scenes and journals: spreadsheet editing, paste from a spreadsheet,
  undo.
- **Encounter editor**: creatures with loot placed in one step, drafts kept on the scene, a chest for
  leftover loot, undo; with dnd5e a difficulty rating against a party.
- **Scene contents**, **commander** (drag and drop between columns, roll tables, regions), **sources**
  from the project, the world and every compendium, with condition filters (`cr<=2 rarity=rare`).
- dnd5e is optional: without it the studio runs on any system.
