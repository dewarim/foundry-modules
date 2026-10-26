# Foundry module popularity, 2026-10-25

Which add-on modules people actually use, and which repositories get attention. Gathered to find
gaps worth a new module.

## Where the numbers come from

| Source | What it gives | Rankings? | Reviews? |
|---|---|---|---|
| [The Forge](https://forge-vtt.com) `api/bazaar/modules` | install share for all 9,219 modules, unauthenticated | **yes — the only quantitative one** | no |
| [Foundry Hub](https://www.foundryvtt-hub.com) `wp-json/hubapi/v1/package/<id>` | install share (mirrored from the Forge), endorsements, comment count | derived | barely |
| foundryvtt.com (official) | version, compatibility, author, last update | **no** | **no** |
| GitHub search API | stars, last push, archived state | by stars | no |

The official package listing has no ratings, no reviews, no install counts and no sort by
popularity — 119 pages in recently-updated order and a search box. Endorsements that older guides
mention are gone from it. Qualitative judgement lives on r/FoundryVTT and the Foundry Discord;
curated lists on GitHub (`bryancasler/Bryans-Preferred-Modules`, `NateHawk85/Nathans-DnD5e-Foundry-Modules`)
stopped being updated in 2021.

The Hub's install figure matches the Forge's to four decimals (libWrapper 80.9205 vs 80.9194), so
there is exactly **one** install dataset in the ecosystem and both sites serve it.

## What install share means, and what it does not

It is the percentage of worlds that have the module installed. Three limits worth keeping in mind:

- **The telemetry is the Forge's**, so it samples *Forge-hosted* worlds, not self-hosters. Expect a
  skew toward paying, less technical, D&D-heavy GMs.
- **Installed is not used.** A module enabled once and forgotten still counts.
- **It is cumulative and slow-moving.** A long-dead module keeps its share for years; a good new one
  needs a long time to show up. `foundryvtt-simple-calendar` (30.4%, untouched since 2024-05) still
  has ten times the share of its own successor `foundryvtt-simple-calendar-reborn` (3.0%).

Stars are a much weaker signal: they measure developer attention. libWrapper sits in 81% of worlds
with 46 stars. Several of the most-installed modules are not on GitHub at all (Dice So Nice,
Midi-QOL, DAE, Pings, Quick Insert, Settings Extender are on GitLab), and premium modules are
closed-source.

## The tables

Install share, every module, 100 rows per file:

- [ranks 1–100](installs-001-100.md) · [101–200](installs-101-200.md) · [201–300](installs-201-300.md) · [301–400](installs-301-400.md) · [401–500](installs-401-500.md)

Install share, only modules that declare no `relationships.systems` — the same rule `CLAUDE.md`
uses for "generic first". 6,008 of 9,219 modules (65%) qualify:

- [ranks 1–100](agnostic-001-100.md) · [101–200](agnostic-101-200.md) · [201–300](agnostic-201-300.md) · [301–400](agnostic-301-400.md) · [401–500](agnostic-401-500.md)

And:

- [**Pain points**](pain-points.md) — what users complain about: 5,251 open issues from the trackers of
  the top 500 modules, classified, with the maintenance picture behind them
- [GitHub stars](github-stars.md) — the 52 module repositories found, by stars
- [Hub endorsements and comments](hub-endorsements.md) — top 108 by install share

Full data in [`data/`](data): `forge-installs-all.tsv` (9,219 rows),
`forge-installs-system-agnostic.tsv` (6,008), `github-foundry-repos.tsv` (150 repos classified by
manifest type), `foundry-hub-stats.tsv` (108), `descriptions.tsv` (9,219),
`descriptions-override.json`, `github-open-issues.tsv` (5,251 open issues) and
`github-issue-repos.tsv` (402 repositories with their tracker state).

## The "what it does" column

A module id tells you little — `levels` could be character levels or map floors (it is map floors:
"add multiple vertical levels to maps"). Every table therefore carries a one-line description.

The text is the author's own, not ours. `make-descriptions.py` takes the one-line `description` from
the manifest, and falls back to the first sentence of the longer `short_description` when that
one-liner is missing or says no more than the title. Either way it strips HTML, entities, markdown
links and README chrome ("Before opening an issue read THIS", "Troubleshooting and FAQ", donation
pitches) and caps the result. Provenance across the top 500:

| Source | Rows |
|---|---:|
| the manifest's own `description` | 465 |
| first sentence of `short_description` | 31 |
| hand-written in `data/descriptions-override.json` | 3 |
| whichever field was longer | 1 |

The three hand-written ones are modules no rule can rescue: `times-up`, whose description is the
two-word "Active expiry expiration"; `vueport`, whose description is a paragraph of marketing; and
`av-maps-remake-by-narchy`, written in the first person. Each override says what the module does in
the author's own terms — if you disagree with one, edit that JSON and re-run.

Manifest text is third-party input, so it is treated as data and never as instruction: scrubbed of
HTML and control characters, markdown-escaped, length-capped.

## Findings

**Generic beats system-specific, and the margin shrinks with rank.** 85 of the top 100 declare no
system; 74% in ranks 101–250, 67% in 251–500.

**Among system-specific modules, PF2e now out-numbers D&D 5e** in the top 500: 68 `pf2e` (plus 29
`sf2e`) against 63 `dnd5e`. Ranks 300–500 are dense with `pf2e-*` — that community writes its own
tooling prolifically.

**Libraries dominate the head of the list and are invisible on GitHub.** libWrapper 80.9%, socketlib
70.8%, lib-ColorSettings 38.9%, Settings Extender 34.8% — all with tiny star counts.

**Importers and asset pipelines are the biggest cluster by stars**: `ddb-importer` (252★), ddb-proxy,
ddb-adventure-muncher, pathmuncher, `lava-flow` (Obsidian), `FVTT-DD-Import` (Dungeondraft).

**Scene performance and scene manipulation is the newest active area.** `geanos-scene-rotation`
(75★) and `geanos-scene-optimizer` (69★) both appeared in 2026 and already out-star veterans; add
`foundryvtt-performance-hacks` (36★) and `geanos-phantom-performance` (26★).

**The abandoned-but-installed set is large.** Each of these is a one-feature module with a five-figure
installed base and no maintainer: Token Action HUD Classic (19.3%, 2023-05), Compendium Folders
(15.8%, 2023-05), Combat Utility Belt (15.5%, archived), Warp Gate (18.0%, 2023-12), Turn Marker
(13.6%, 2022-01), Perfect Vision (12.5%, 2023-04), The Furnace (11.1%, 2020-06), LMRTFY (11.3%,
2023-11), Dynamic Active Effects SRD (9.9%, 2020-09), Split Journal (9.6%, 2022-02), Ambient Doors
(9.5%, 2022-11), PDFoundry (5.0%, archived). Reviving one inherits an audience, but slowly — see the
Simple Calendar note above, where three successors (`-reborn` 3.0%, `seasons-and-stars` 2.5%,
`calendaria` 1.9%) are splitting one 30% incumbent.

**Asset and music packs are an established category**, not a fringe: `fa-battlemaps`, `michaelghelfi`,
`gAudioBundle-1..4`, the SoundBoard packs, `moonlight-maps-free`, `caeora-maps-tokens-assets` and a
long tail of `*-free` map packs — shipping licensed art as a palette module is a populated niche.

## Refreshing this

```bash
# install share for every module (17 MB)
curl -s https://forge-vtt.com/api/bazaar/modules -o forge_modules.json
jq -r '[.packages[]|select(.installs!=null)] | sort_by(-.installs) | to_entries | .[]
        | [(.key+1), (.value.installs*100|round/100), .value.id, (.value.title//""),
           ((.value.updated//0)/1000|strftime("%Y-%m")), ((.value.systems//[])|join("|")),
           (.value.url//"")] | @tsv' forge_modules.json

# endorsements and comments for one module
curl -s https://www.foundryvtt-hub.com/wp-json/hubapi/v1/package/lib-wrapper

# the Hub's sorted listing, 12 per page (plain ?page=N does not sort; this does)
curl -s 'https://www.foundryvtt-hub.com/packages/?sf_data=results&sort_order=_sfm_installs+desc+num&_sfm_type=module&sf_paged=3'
```

`make-descriptions.py` derives the one-liners from the same raw JSON, and `make-tables.py` rebuilds
every markdown table in this folder from the TSVs in `data/`:

```bash
python3 -I make-descriptions.py forge_modules.json data/descriptions.tsv 95 \
    data/descriptions-override.json
python3 -I make-tables.py data/forge-installs-all.tsv \
    data/forge-installs-system-agnostic.tsv data/github-foundry-repos.tsv \
    data/foundry-hub-stats.tsv data/descriptions.tsv . 2026-10-25
python3 -I make-pain-points.py data/github-open-issues.tsv \
    data/github-issue-repos.tsv pain-points.md 2026-10-25
```

The issue data itself comes from the GitHub API, one call per repository for the metadata and up to
three pages of `/issues?state=open` each, for the 413 GitHub repositories among the top 500 modules.
`make-issue-tsvs.py` turns that raw fetch into the two TSVs, counting an issue once when several
modules share a repository and dropping game system repositories; `pain-points.md` records the scope
and the limits.

Re-running the fetch and diffing against `data/forge-installs-all.tsv` shows what is *gaining*
installs, which is a better pointer at an unmet need than the absolute ranking.
