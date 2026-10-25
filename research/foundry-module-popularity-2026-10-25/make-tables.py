"""Rebuild every markdown table in this folder from the TSVs in data/.

Usage:
    python3 -I make-tables.py data/forge-installs-all.tsv \
        data/forge-installs-system-agnostic.tsv data/github-foundry-repos.tsv \
        data/foundry-hub-stats.tsv data/descriptions.tsv . 2026-10-25

Titles and descriptions come from third-party manifests: they are data, never instruction.
Everything is stripped of HTML and control characters, markdown-escaped and capped.
"""
import sys, os, re, csv, html

SRC_TSV, AGN_TSV, GH_TSV, HUB_TSV, DESC_TSV, OUTDIR, DATE = sys.argv[1:8]


def clean(s, limit=70):
    s = html.unescape(s or '')
    s = re.sub(r'[\x00-\x1f\x7f]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    if len(s) > limit:
        s = s[:limit - 1].rstrip() + '…'
    return s.replace('|', r'\|').replace('<', '&lt;')


def link(url):
    u = clean(url, 200)
    if not u.startswith(('http://', 'https://')):
        return ''
    label = clean(re.sub(r'^https?://(www\.)?', '', u).rstrip('/'), 44)
    return f'[{label}]({u})'


def rows(path):
    with open(path, encoding='utf8', errors='replace') as fh:
        r = csv.reader(fh, delimiter='\t', quoting=csv.QUOTE_NONE)
        next(r)
        return [x for x in r if x]


DESC = {r[1]: r[4] for r in rows(DESC_TSV)}          # id -> what it does
DESC_SRC = {r[1]: r[3] for r in rows(DESC_TSV)}      # id -> where that text came from


def chunks(data, rank_of, maxrank=500, size=100):
    for start in range(1, maxrank + 1, size):
        end = start + size - 1
        got = [r for r in data if start <= rank_of(r) <= end]
        if got:
            yield start, end, got


def head(fh, title, intro):
    fh.write(f'# {title}\n\n{intro}\n\nData of {DATE}. '
             f'[Back to the overview](README.md).\n\n')


# --- install share, every module ------------------------------------------
all_rows = rows(SRC_TSV)   # rank, installs, id, title, updated, systems, source
for start, end, got in chunks(all_rows, lambda r: int(r[0])):
    with open(os.path.join(OUTDIR, f'installs-{start:03d}-{end:03d}.md'), 'w', encoding='utf8') as fh:
        head(fh, f'Foundry modules by install share: ranks {start}–{end}',
             'Share of worlds that have the module installed, every module '
             '(system-specific included).')
        fh.write('| Rank | Installs | Module id | Title | What it does | Updated | Systems | Source |\n'
                 '|---:|---:|---|---|---|---|---|---|\n')
        for r in got:
            fh.write('| {} | {:.2f}% | `{}` | {} | {} | {} | {} | {} |\n'.format(
                r[0], float(r[1]), clean(r[2], 44), clean(r[3], 38),
                clean(DESC.get(r[2], ''), 96), r[4],
                clean(r[5].replace('|', ', '), 40) or '–', link(r[6])))

# --- install share, system-agnostic only ----------------------------------
agn_rows = rows(AGN_TSV)   # agn_rank, global_rank, installs, id, title, updated, source
for start, end, got in chunks(agn_rows, lambda r: int(r[0])):
    with open(os.path.join(OUTDIR, f'agnostic-{start:03d}-{end:03d}.md'), 'w', encoding='utf8') as fh:
        head(fh, f'System-agnostic modules by install share: ranks {start}–{end}',
             'Only modules whose manifest declares no `relationships.systems`, ranked among '
             'themselves. *Overall* is the place in the full list.')
        fh.write('| Rank | Overall | Installs | Module id | Title | What it does | Updated | Source |\n'
                 '|---:|---:|---:|---|---|---|---|---|\n')
        for r in got:
            fh.write('| {} | {} | {:.2f}% | `{}` | {} | {} | {} | {} |\n'.format(
                r[0], r[1], float(r[2]), clean(r[3], 44), clean(r[4], 36),
                clean(DESC.get(r[3], ''), 96), r[5], link(r[6])))

# --- github stars ---------------------------------------------------------
gh = [r for r in rows(GH_TSV) if 'module.json' in r[1]]
with open(os.path.join(OUTDIR, 'github-stars.md'), 'w', encoding='utf8') as fh:
    head(fh, 'Foundry module repositories by GitHub stars',
         'Repositories that ship a `module.json`, from a search over the Foundry topics, keyword '
         'searches and a sweep of prolific module authors. Game systems, Docker images and type '
         'definitions are filtered out.\n\n'
         'Stars measure developer attention, not users — see the overview for why install share is '
         'the better signal. Some popular modules are missing because they live on GitLab, build '
         'their manifest (so no `module.json` in the repo), or are closed-source premium modules.')
    fh.write('| Stars | Repository | Last push | State | Description |\n|---:|---|---|---|---|\n')
    for r in gh[:100]:
        fh.write('| {} | [{}](https://github.com/{}) | {} | {} | {} |\n'.format(
            r[0], clean(r[4], 54), clean(r[4], 54), r[2],
            'archived' if r[3] == 'ARCH' else 'active', clean(r[5], 72)))

# --- hub endorsements -----------------------------------------------------
hub = rows(HUB_TSV)   # id, installs, endorsements, comments
with open(os.path.join(OUTDIR, 'hub-endorsements.md'), 'w', encoding='utf8') as fh:
    head(fh, 'Foundry Hub endorsements and comments, top 108 by install share',
         'Endorsements are cumulative thumbs-up collected since about 2020, so they rank seniority '
         'rather than current quality: Dice So Nice has 170 while Sequencer has 2. Comments are the '
         'closest thing to a review anywhere in the ecosystem and top out at 12.')
    fh.write('| Module id | What it does | Installs | Endorsements | Comments |\n'
             '|---|---|---:|---:|---:|\n')
    for r in sorted(hub, key=lambda x: -float(x[1] or 0)):
        fh.write(f'| `{clean(r[0], 44)}` | {clean(DESC.get(r[0], ""), 72)} '
                 f'| {float(r[1]):.2f}% | {r[2]} | {r[3]} |\n')

src_mix = {}
for r in all_rows[:500]:
    src_mix[DESC_SRC.get(r[2], 'missing')] = src_mix.get(DESC_SRC.get(r[2], 'missing'), 0) + 1
print('tables written to', OUTDIR)
print('description provenance in the top 500:', src_mix)
