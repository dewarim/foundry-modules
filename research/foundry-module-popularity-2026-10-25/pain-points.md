# Pain points: the open issues of the most-installed modules

What users complain about, taken from the issue trackers of the top 500 modules by install share —
down to 1.6% of worlds.
Data of 2026-10-25. [Back to the overview](README.md).

413 of those 500 modules are on GitHub, and they resolve to **402** distinct repositories —
some authors ship several modules from one, and `flamewave000/dragonflagon-fvtt` alone serves eight. The
other 87 modules are not reachable this way: 43 sit on GitLab — including Dice So Nice, Midi-QOL, DAE,
Pings and Quick Insert — 17 link a Patreon page instead of source, 5 are on Codeberg, 3 on git.gay, 2 on
Bitbucket, and the rest give a storefront or nothing. The GitLab group is the significant one: it holds
much of the 5e automation stack, which is exactly where system-specific breakage would show up.

5251 open issues (pull requests excluded) across 315 repositories that have any,
each issue counted once.

## The short answer

**The most common pain point is not a missing feature or a particular bug — it is being ignored.**
2645 of 5251 open issues (50%) never received a single
comment, 3117 (59%) have had no activity for two years or more,
and the median open issue is 2.9 years old (upper quartile
4.4 years, oldest 7.2).

That is not an artefact of looking only at the biggest modules. The share of issues nobody ever answered
is the same in the top 100 as in the 400 below it:

| Band | Issues | Repos | Never answered | No activity 2+ years | Median age |
|---|---:|---:|---:|---:|---:|
| ranks 1–100 | 2343 | 69 | 51% | 61% | 2.9 y |
| ranks 101–500 | 2908 | 246 | 50% | 58% | 2.8 y |

**Backlogs are wishlists, not defect lists.** 2146 issues are feature requests against
1301 bug reports. What users mostly want from these modules is *more*, not *fixed*.

**The backlog is concentrated in a few hands.** 1036 of 5251 open issues
(20%) sit in `ironmonk108`'s repositories alone. Within the top 100
that share was higher still, so "the Foundry module backlog" is to a large extent a handful of prolific
authors' backlogs.

**32 of the 402 repositories give users nowhere to report anything**:
19 archived, 7 with issues switched off, and 6 whose repository
is simply gone — among them Warp Gate, a library in 18% of worlds, now a 404.

## Recurring pain, ranked by how many projects see it

Breadth matters more than volume here: a theme in 40 repositories is an ecosystem problem, while 200
issues in one repository are that module's own. Counts are non-exclusive — a title may mention several.

| Mentioned in the title | Issues | Share | Repos |
|---|---:|---:|---:|
| A Foundry version or compatibility | 435 | 8.3% | 188 |
| A specific game system by name | 320 | 6.1% | 102 |
| Tokens | 390 | 7.4% | 107 |
| Players or permissions | 206 | 3.9% | 95 |
| Another module, or a conflict | 110 | 2.1% | 65 |
| Active effects | 138 | 2.6% | 57 |

**Compatibility is the tax everyone pays.** It is named in the titles of
188 different
repositories, and the pressure tracks the current generation rather than accumulating:

| Foundry generation named | Issues | Opened this year |
|---|---:|---:|
| v10 | 31 | 0 |
| v11 | 24 | 0 |
| v12 | 34 | 1 |
| v13 | 61 | 15 |
| v14 | 43 | 43 |

**Going generic has a price.** A specific game system is named in the titles of
102
repositories. System-specific behaviour is the single largest *bug* theme below, and most of those
modules are system-agnostic by manifest — declaring no system does not stop users from reporting what
broke in theirs.

## Themes, one per issue

Each issue is assigned a single theme: the first pattern that matches its title, ordered so a specific
cause (a version bump, a module conflict) wins over a domain (tokens, scenes) and a domain wins over a
bare symptom (an exception). The large unclassified share is the honest cost of keyword matching.

### Bug reports (n=1301)

| Theme | Issues | Share | Repos |
|---|---:|---:|---:|
| other / unclassified | 465 | 35.7% | 111 |
| Tokens, vision, lighting | 113 | 8.7% | 51 |
| System-specific behaviour | 94 | 7.2% | 33 |
| Foundry version upgrade breakage | 94 | 7.2% | 54 |
| Scenes, tiles, canvas | 70 | 5.4% | 26 |
| Sheets, HUD, UI layout | 64 | 4.9% | 39 |
| Import / export / compendium | 63 | 4.8% | 22 |
| Animations / visual effects | 58 | 4.5% | 25 |
| Rolls, chat, dice | 56 | 4.3% | 28 |
| Uncaught errors / exceptions | 55 | 4.2% | 41 |
| Audio / playlists | 28 | 2.2% | 11 |
| Macros, API, hooks | 25 | 1.9% | 16 |
| Module conflicts | 24 | 1.8% | 18 |
| Players vs GM: permissions | 21 | 1.6% | 12 |
| Performance: lag, freeze, memory | 17 | 1.3% | 15 |
| template left unfilled | 16 | 1.2% | 8 |
| Settings or data lost | 16 | 1.2% | 15 |
| Browser or OS specific | 12 | 0.9% | 9 |
| Localization / translation | 7 | 0.5% | 6 |
| Mobile / touch devices | 3 | 0.2% | 3 |

### Feature requests (n=2146)

| Theme | Issues | Share | Repos |
|---|---:|---:|---:|
| other / unclassified | 1123 | 52.3% | 184 |
| Tokens, vision, lighting | 164 | 7.6% | 76 |
| Rolls, chat, dice | 154 | 7.2% | 48 |
| Sheets, HUD, UI layout | 127 | 5.9% | 67 |
| Foundry version upgrade breakage | 110 | 5.1% | 72 |
| Animations / visual effects | 104 | 4.8% | 53 |
| Scenes, tiles, canvas | 69 | 3.2% | 35 |
| Macros, API, hooks | 68 | 3.2% | 44 |
| System-specific behaviour | 65 | 3.0% | 39 |
| Import / export / compendium | 52 | 2.4% | 33 |
| Audio / playlists | 42 | 2.0% | 21 |
| Players vs GM: permissions | 16 | 0.7% | 11 |
| Localization / translation | 13 | 0.6% | 11 |
| Performance: lag, freeze, memory | 11 | 0.5% | 10 |
| Module conflicts | 10 | 0.5% | 10 |
| Browser or OS specific | 6 | 0.3% | 6 |
| Settings or data lost | 6 | 0.3% | 6 |
| Uncaught errors / exceptions | 4 | 0.2% | 4 |
| Mobile / touch devices | 2 | 0.1% | 2 |

## Where the backlogs are

| Rank | Install% | Open issues | Module | Last push | Repository |
|---:|---:|---:|---|---|---|
| 46 | 17.99% | 285 | `monks-enhanced-journal` | 2026-09-14 | [ironmonk108/monks-enhanced-journal](https://github.com/ironmonk108/monks-enhanced-journal) |
| 10 | 35.50% | 241 | `monks-active-tiles` | 2026-06-19 | [ironmonk108/monks-active-tiles](https://github.com/ironmonk108/monks-active-tiles) |
| 31 | 21.82% | 162 | `monks-tokenbar` | 2026-05-17 | [ironmonk108/monks-tokenbar](https://github.com/ironmonk108/monks-tokenbar) |
| 17 | 30.38% | 135 | `foundryvtt-simple-calendar` | 2025-05-12 | [vigoren/foundryvtt-simple-calendar](https://github.com/vigoren/foundryvtt-simple-calendar) |
| 52 | 15.50% | 125 | `combat-utility-belt` | 2023-01-31 | [death-save/combat-utility-belt](https://github.com/death-save/combat-utility-belt) |
| 102 | 9.31% | 111 | `betterrolls5e` | 2022-09-12 | [RedReign/FoundryVTT-BetterRolls5e](https://github.com/RedReign/FoundryVTT-BetterRolls5e) |
| 55 | 15.03% | 104 | `xdy-pf2e-workbench` | 2026-09-04 | [xdy/xdy-pf2e-workbench](https://github.com/xdy/xdy-pf2e-workbench) |
| 19 | 28.58% | 100 | `drag-ruler` | 2024-08-07 | [manuelVo/foundryvtt-drag-ruler](https://github.com/manuelVo/foundryvtt-drag-ruler) |
| 42 | 18.52% | 88 | `item-piles` | 2026-07-18 | [fantasycalendar/FoundryVTT-ItemPiles](https://github.com/fantasycalendar/FoundryVTT-ItemPiles) |
| 150 | 6.75% | 83 | `chris-premades` | 2026-10-25 | [chrisk123999/chris-premades](https://github.com/chrisk123999/chris-premades) |
| 14 | 33.28% | 77 | `ddb-importer` | 2026-10-19 | [MrPrimate/ddb-importer](https://github.com/MrPrimate/ddb-importer) |
| 291 | 3.23% | 70 | `blood-n-guts` | 2024-11-24 | [edzillion/blood-n-guts](https://github.com/edzillion/blood-n-guts) |
| 22 | 27.12% | 62 | `token-action-hud-core` | 2026-09-25 | [Larkinabout/fvtt-token-action-hud-core](https://github.com/Larkinabout/fvtt-token-action-hud-core) |
| 204 | 4.82% | 59 | `monks-common-display` | 2026-05-17 | [ironmonk108/monks-common-display](https://github.com/ironmonk108/monks-common-display) |
| 13 | 33.70% | 56 | `tokenmagic` | 2026-09-10 | [Feu-Secret/Tokenmagic](https://github.com/Feu-Secret/Tokenmagic) |

A big backlog is not automatically a badly run project, and a small one is not automatically a healthy
one. An abandoned tracker accumulates; a maintainer who triages aggressively shows few open issues; a
module nobody uses shows none at all. Read these counts next to the last-push date.

## Nowhere to report

| Rank | Module | Install% | State |
|---:|---|---:|---|
| 38 | `tabletop-rpg-music` | 19.72% | archived |
| 45 | `warpgate` | —% | repository gone (404) |
| 52 | `combat-utility-belt` | 15.50% | archived |
| 56 | `magicitems` | 14.96% | archived |
| 60 | `initiative-double-click` | 14.51% | archived |
| 92 | `dragupload` | 10.01% | issue tracker disabled |
| 97 | `split-journal` | 9.58% | issue tracker disabled |
| 108 | `animated-spell-effects` | —% | repository gone (404) |
| 130 | `combat-carousel` | 7.83% | archived |
| 153 | `pf2e-dragruler` | —% | repository gone (404) |
| 156 | `acelib` | 6.62% | archived |
| 198 | `animated-spell-effects-cartoon` | —% | repository gone (404) |
| 200 | `pdfoundry` | 4.97% | archived |
| 208 | `babonus` | —% | repository gone (404) |
| 223 | `maestro` | 4.49% | archived |
| 231 | `token-frames` | 4.23% | issue tracker disabled |
| 244 | `CommunityLighting` | 4.03% | archived |
| 258 | `templatemacro` | —% | repository gone (404) |
| 269 | `mcc` | 3.54% | archived |
| 279 | `pf2e-target-damage` | 3.40% | archived |
| 284 | `pf2e-lootgen` | 3.30% | archived |
| 291 | `blood-n-guts` | 3.23% | archived |
| 309 | `lib-changelogs` | 3.04% | issue tracker disabled |
| 326 | `pdf-sheet` | 2.82% | archived |
| 332 | `custom-fonts` | 2.75% | archived |
| 358 | `dnd5e-helpers` | 2.58% | archived |
| 360 | `pf2e-toolbox` | 2.55% | archived |
| 432 | `foundryvtt-mountup` | 1.95% | archived |
| 437 | `chat-notifications` | 1.91% | issue tracker disabled |
| 459 | `roofs` | 1.80% | archived |
| 464 | `weatherblock` | 1.78% | issue tracker disabled |
| 484 | `token-action-hud-lancer` | 1.67% | issue tracker disabled |

## What this suggests for a new module

1. **Answering beats shipping.** With 50% of issues never answered,
   a maintained tracker is itself a differentiator — and cheap next to writing features.
2. **An abandoned module's backlog is a free specification.** Drag Ruler has
   100 open issues and was last
   pushed 2024-08-07; Combat Utility Belt
   125 and archived;
   Compendium Folders 56,
   last pushed 2023-08-05. Those
   lists say what users of a replacement would ask for, before a line is written.
3. **Budget for the generation bump.** Surviving a Foundry major version is the recurring cost in this
   data, not a one-off.
4. **Expect system-specific reports whatever the manifest says**, and decide in advance whether the
   answer is an adapter or a documented "not supported".
5. **Permissions are a recurring correctness trap** — players not seeing what the GM sees appears across
   31 repositories.
   Worth testing as a player from the start rather than after a report.

## Method and limits

- Open issues only, pull requests excluded, at most the first 300 per repository (no repository
  reached that cap). Fetched 2026-10-25 from the GitHub API, one metadata call per repository plus up to
  three pages of open issues.
- Classification is **regex over issue titles**, not reading. Bodies are excluded on purpose: they are
  largely issue-template boilerplate that matches every pattern. Expect misfiling at the margins; the
  unclassified share is reported rather than hidden.
- `bug` versus `feature request` comes from the authors' own labels first, then from a title prefix like
  `[BUG]`. Projects that label nothing land in neither bucket (1804 issues).
- Each issue is counted once even when several modules share its repository, and game system
  repositories given as a module's project URL are excluded — `make-issue-tsvs.py` documents both,
  which together removed 513 rows of the raw fetch.
- An open issue is not a measure of pain suffered: it measures what someone bothered to write down and
  nobody closed. Modules whose users complain on Discord instead look healthy here.
- The non-GitHub modules of the top 500 are missing entirely, and they are not a random
  sample: GitLab holds much of the 5e automation stack.
- Issue titles are quoted as data. Nothing in them was treated as an instruction.

Raw data: [`data/github-open-issues.tsv`](data/github-open-issues.tsv) (5251 issues: rank,
install share, module, repo, number, title, labels, dates, comment count) and
[`data/github-issue-repos.tsv`](data/github-issue-repos.tsv) (402 repositories with stars,
archived and tracker state, open-issue count and last push). Rebuild this page with
`make-pain-points.py` (see the overview's refresh section).
