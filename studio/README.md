# Dewarim: Studio

**Requires:** nothing beyond Foundry v14 — system-agnostic; with dnd5e 6 (optional) it adds that system's
table columns, encounter loot and compendium sources. Meant for an *authoring* world; play worlds only
need the content module it builds.

Author content in a world, build it into a **content module** (a module with an Adventure compendium),
import that into any play world: replayable per group, shareable as a module.

## Workflow

1. Create a content module in the repository and restart Foundry:
   `node scripts/new-content-module.mjs dewarim-dnd5e-crypt "The Crypt" --system dnd5e`
2. In the authoring world activate *Dewarim: Studio* and the content module.
3. Put documents into the project: right-click in the sidebar → *Add to project* (documents or whole
   folders), *Project…* in a sheet's header menu, or drag into the project's folder (one per sidebar,
   named after the module). The *Studio* button in the Settings sidebar shows what belongs to it.
4. *Build adventure*. The build
   - pulls in what the content refers to (a scene's token actors, its journal, `@UUID` links) and
     lists what it added,
   - copies files from user data (e.g. `assets/upload`) into `modules/<id>/assets/` and points the
     *exported* data at the copies — the authoring world keeps its paths,
   - writes the Adventure into the module's compendium (same id each time, so play worlds update).
   It warns about references to other modules (add them to `requires`) and to missing documents.
5. Play world: activate the content module, open its compendium, open the Adventure, *Import*.
   Importing again resets everything to the built state.

## Tables

*Studio* → *Actors* / *Items* / *Scenes* / *Journal Entries* opens a spreadsheet-like editor for that
document type.

- **Columns** come from a preset (*Basics*; on dnd5e also *NPC stats*, *ability scores*, *physical
  items*) plus any data path you add (`system.details.cr`). The cell kind follows the document's schema:
  numbers, checkboxes, dropdowns for choices, image paths with a file picker. Paths the schema does not
  know, derived values and HTML are read-only. Numbers accept fractions (`1/4`).
  - *Scenes*: name, background (the first level's - v14 keeps it there), navigation, default ownership,
    size, grid, token vision, darkness, playlist and journal (dropdowns of the world's), and counts of
    tokens, notes and levels.
  - *Journal entries*: name, default ownership, pages (count and names), and where the entry is used:
    as a scene's journal, as map notes.
- **Scope**: the active project or the whole world; filter by subtype and name.
- **Edit** cells freely - changes are marked and nothing is written until *Save*, which sends all of them
  in one update. Invalid input is marked red and blocks *Save*; *Revert* drops everything pending.
- **Set for selected**: tick rows, pick a column, enter a value - it becomes a pending edit on each row.
- **New**, **Duplicate**, **Delete** (with confirmation) work on the selection. New and dropped documents
  join the project when the table shows the project.
- **Drop** a document from a compendium onto the table to copy it into the world (its compendium source
  is kept), or from the sidebar to pull it into the project.
- **Spreadsheet**: *copy* puts the selected rows (or all shown) on the clipboard as tab-separated text with
  an `_id` column; *paste* takes rows back - matched by `_id`, else by name, headers by label or data
  path. Matched rows become pending edits (Save writes them); names that match nothing become new
  documents after a confirmation. Unknown columns and invalid cells are reported, not written.
- **Undo**: *Undo: …* in the footer takes back the last Save, New, Duplicate, Delete, paste or drop (up to
  10, newest first): saved fields get their old values, new documents go, deleted ones come back with
  their id - so links to them keep working. The list lives as long as the window's session.

## Encounter editor

*Studio* → *Encounter*: put a group of creatures with their loot on a scene in one step.

- **Creatures**: drop actors (sidebar or compendium). Per row: kind, count, token name pattern (`{name} {n}`),
  HP (empty = as the actor; a number = that for every token; `roll`/`würfeln` = roll the actor's HP
  formula per token - dnd5e), hidden, disposition. Dropping the same actor again counts up.
- **Loot**: drop items, set the quantity, choose who carries it: *every* creature of a row, the *first*
  one, or the *chest* - an actor holding the leftover loot (dnd5e: a group actor), placed as a hidden token.
- **Kind**: *group* - tokens of the type ("Wolf 1", "Goblin"), each carrying its own HP and loot; the
  type's actor stays as it is. *named* - every token gets its own world actor with a name (a list like
  `Grimtooth, Snaga`, the rest numbered) and a linked token, so HP, loot and conditions stay with it when
  it flees and turns up in another scene. Dropping such a linked actor again places *this individual*
  as it is now, with no copy.
- **Placement**: a staging row along the bottom edge of the scene, or *where I click* (the window
  minimizes, click the map, Escape cancels).
- Tokens are unlinked: each one's HP and loot live on the token, the base actor stays untouched. A
  compendium actor is copied into the world once. Everything joins the active project.
- Each *Place* creates a new set of creatures - so placing twice gives two groups. Leftover loot goes
  into a chest: by default the scene's newest chest (its items stack - two daggers make *Dagger ×2*),
  or *a new chest* with its own hidden token. After a placement the editor stays on that chest.
- **Undo**: *Undo: n tokens on <scene>* in the footer takes the last placement back (up to 10, newest
  first): its tokens, a chest it created, items it put into an existing chest, named actors it made. A
  compendium actor copied into the world stays - the rows use that copy for the next placement. The list
  lives as long as the window's session.
- **Drafts**: *Save draft* keeps the rows (creatures, loot, placement, chest name) on the selected scene
  under a name; pick it from *Draft* to load it again. Drafts go into the content module with the scene,
  and the actors and items they name are pulled in by the build - so a prepared encounter (wandering
  monsters, reinforcements) can be loaded and placed during play in the play world (with the studio
  enabled there). The save button glows while there are unsaved changes. A row whose actor or item no
  longer exists - deleted, or its compendium not installed - is marked, and placing refuses until it is
  removed. Switching the scene keeps the rows; saving then makes a new draft on that scene.
- **Difficulty** (dnd5e): rated while you build, by the 2024 rules - each character adds the XP budget
  of their own level; the creatures' XP (by CR, with a lair) is low, moderate or high by the first
  budget it fits in, or *beyond high*. Each row shows its CR and XP; friendly rows are allies and do not
  count; a creature with a CR above the party's level is marked. dnd5e's own encounter sheet multiplies
  the average level's budget by the party size instead - the same for a party of one level.
- **Party**: rate *against* a party (a dnd5e group actor; ★ is the primary party, the default), *the
  player characters* (every character a player owns), or *a party of* n × level (for content without
  characters - kept per browser). A party's members show with their level (click: their sheet, ✕: out of
  the party); drop characters on the strip to add them (a compendium character is copied into the world);
  members that are not characters are listed, not counted. *New party* makes a group actor, with the
  player characters in it if you like - the primary party when there is none yet; ☆ makes the chosen one
  primary, the group icon opens its sheet.

## Scene contents

*Studio* → *Scene contents*, or right-click a scene in the sidebar: everything placed on one scene as
tables, written at once (these are toggles, not batches).

- **Tokens**: name, base actor (opens the sheet), hidden, disposition, HP (dnd5e), item count with the
  names on hover; *hide all* / *reveal all*. Unlinked tokens change only themselves, linked ones their actor.
- **Doors**: state (closed / open / locked, or cycle), secret doors marked; *close all* / *lock all*.
- **Notes**: label, journal, always visible, locked. **Tiles**: hidden, locked. **Lights**: off, bright and dim radius.
- The crosshair pans the canvas to the row (viewing the scene first) and selects a token.

## Commander

*Studio* → *Commander*: side-by-side columns, one document type each (Actors | Items | Scenes to start;
add more with **+**, switch a column's type and scope). Assigning is drag & drop onto a row:

| Drop | onto | does |
|---|---|---|
| Item | Actor | gives it; an item of the same name and type stacks (dnd5e quantity) |
| Actor | Scene | a hidden token on the next free cell of the bottom row - a type as "Goblin 3", a linked actor as itself (once per scene) |
| Item | Scene | into the scene's chest (the newest; same items stack), or a new chest actor as a hidden token |
| Journal | Scene | a note in the middle; the first one also becomes the scene's journal |
| Playlist | Scene | the scene's playlist |
| Roll table | Actor | rolls it and gives the items it yields (stacking); text results are named in the message |
| Roll table | Scene | rolls it, the items go into the scene's chest (or a new one) |
| Macro | Scene | a 2×2 region in the middle that runs the macro when a token enters - a trap, a trigger (Regions layer) |
| Actor | group / encounter actor | a member (dnd5e; a group takes world actors - a compendium actor is copied in; an encounter counts repeats up) |
| Item | container item | a copy goes inside, with its own contents (dnd5e) |

A rule can be limited to some targets (only group actors, only containers): rows that do not take the
dragged type are greyed out while dragging, and a drop says why it was refused.

**Undo**: the button above the columns takes back the last drop (up to 10, newest first; the tooltip
names it). It restores what the drop changed, deletes what it created - the token, the chest, the
copied item - and brings back what it deleted (same id), for any rule, also a system's. What was deleted
by hand meanwhile is skipped. The list lives as long as the window's session (not across reloads).

**Sources, all inside the studio**: a column's scope is the project, the whole world, or any compendium
of its type - read from the compendium index, so even the 872 SRD items list at once (first 200 shown,
narrow with the name filter and the subtype filter; on dnd5e a badge shows CR or rarity). Compendium rows
are read-only sources: drag them onto other columns (a compendium item onto an actor goes straight
onto the actor), or **copy & edit** (⧉ on any row) to make the project's own variant - name it, and its
sheet opens. **+** in a project or world column creates a new document of that type (and subtype
filter) in the project.

Rows are ordinary Foundry drag sources, so drops also work from the sidebar and compendiums (copied into
the world first), and rows can be dragged onto sheets and the canvas. Expanding a row shows what it holds
(an actor's items, a scene's tokens, a journal's pages) - those are draggable too. Dropping onto a
column's free space brings a document into the project. A pair without a rule is marked while
dragging. Other modules add pairs with `api.registerDropRule(sourceType, targetType, {label, handler})`.

Other modules can add presets: `game.modules.get("dewarim-studio").api.registerPreset("Actor", id,
{label, columns: [{path, label?, type?, choices?, types?, derived?, readonly?}]})`.

For git: `npm run unpack <id>` writes the compendium as JSON into `packs-src/` (works while Foundry
runs); `npm run pack <id>` rebuilds the compendium from it (not while a world using the module is open).
