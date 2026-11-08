# Changelog

## 0.3.0 (2026-11-08)

- **A portrait from the local image generator.** *Generate a portrait* on an actor (sheet header or
  sidebar) opens a window with a prompt already written from the actor - its name and, under dnd5e, its
  size, kind and challenge rating - asks `image-gen` on this machine for a picture or four, and writes
  the one you click into the actor, optionally as its token picture too. Nothing is applied before you
  have seen it. When image-gen is not running the window says so and offers nothing; its address is a
  setting.

- **Optional: that page written for every new NPC.** A setting (off by default) seeds the journal page
  as soon as an actor is created in the active project - the same page the button makes, but without
  opening a window. Imported actors never get one: a compendium or adventure import carries ids with it
  and nothing imported belongs to a project anyway, and the hook only acts on the client that did the
  creating, so four players no longer mean four pages.

- **A journal page for an actor, in one click.** *Journal page* in an actor sheet's header menu and in
  the sidebar's context menu writes a page with the portrait, a link to the sheet and room to write -
  under dnd5e an NPC also gets its live statblock. Clicking it again opens the page it made rather than
  making a second one, even after an import has stripped the flag that marks it. New pages go into a
  journal named *NPCs* (*NSCs*): an existing one of that name is used, otherwise it is created - in the
  active project's folder, so the build takes it along. *Use for NPC pages* on any journal points them
  somewhere else. The page is seeded, not owned: nothing regenerates it, so what you write there stays.

- **A picture of an actor in journal text, without a copy of it.** `@Portrait[Actor.xxx]{Marvin}` in
  any journal page shows that actor's portrait, read when the page is rendered - so changing the
  actor's picture changes every page that names it, with nothing to keep in step. Click it and
  Foundry's image popout opens it full size. Options: `token` for the token picture instead,
  `width=`/`height=` (200 px wide by default), and `left`, `right` or `center` to float it in the
  text. A page whose actor was not imported says which one is missing instead of showing a hole.

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
