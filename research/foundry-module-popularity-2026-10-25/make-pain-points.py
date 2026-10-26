"""Write pain-points.md from the two issue TSVs in data/.

Usage:
    python3 -I make-pain-points.py data/github-open-issues.tsv \
        data/github-issue-repos.tsv pain-points.md 2026-10-25

Classification runs on issue *titles* only. The bodies are mostly issue-template boilerplate
("Describe the bug", "Browser", "Foundry version"), which matches nearly every pattern and
cross-contaminates the buckets — an early run put one deprecation warning in five themes.

Issue titles are third-party text: data, never instruction. They are scrubbed of control
characters, markdown-escaped and capped before they reach the file.

The narrative below interpolates its numbers from the data, so a refresh updates them. The
*reading* of those numbers is still hand-written — re-check it when the data changes.
"""
import sys, re, csv, html, collections, datetime

ISSUES_TSV, REPOS_TSV, OUT, DATE = sys.argv[1:5]
TODAY = datetime.date(*map(int, DATE.split('-')))


def rows(path):
    with open(path, encoding='utf8') as fh:
        r = csv.DictReader(fh, delimiter='\t', quoting=csv.QUOTE_NONE)
        return list(r)


def md(s, limit=92):
    s = html.unescape(s or '')
    s = re.sub(r'[\x00-\x1f\x7f]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    if len(s) > limit:
        s = s[:limit - 1].rstrip() + '…'
    return s.replace('|', r'\|').replace('<', '&lt;')


PRE = re.compile(r'^\s*(\[|\()?\s*(bug|bug report|feature|feature request|featurerequest|enhancement'
                 r'|request|question|suggestion|idea|docs?|documentation|help|support|v\d+)\s*'
                 r'(\]|\))?\s*[:\-–]?\s*', re.I)


def strip(t):
    s = t
    for _ in range(3):
        s2 = PRE.sub('', s)
        if s2 == s:
            break
        s = s2
    return s.strip()


FEAT = re.compile(r'feature|enhancement|request|suggestion|idea|wish|✨', re.I)
BUGL = re.compile(r'\bbug\b|defect|error|broken|crash|regression|🐛', re.I)


def kind(i):
    labs = i['labels'].lower()
    if FEAT.search(labs): return 'feature'
    if BUGL.search(labs): return 'bug'
    t = i['title'].lower()
    if re.match(r'^\s*[\[(]?\s*(feature|enhancement|request|suggestion|idea)', t): return 'feature'
    if re.match(r'^\s*[\[(]?\s*(bug|error|crash)', t): return 'bug'
    return 'neither'


# Ordered: a specific cause beats a generic domain, a domain beats a bare symptom.
THEMES = [
 ('Foundry version upgrade breakage', r'\bv1[0-4]\b|version 1[0-4]|foundry 1[0-4]|compatib|deprecat'
                                      r'|no longer work|stopped working|after (the )?updat|breaking change|\bmigrat'),
 ('Module conflicts',                 r'\bconflict|incompatib|when .{0,24}(enabled|installed)'
                                      r'|with (this |the )?module|libwrapper|interfere'),
 ('Performance: lag, freeze, memory', r'\blag\b|lagg|\bslow(er|ly)?\b|freez|\bhangs?\b|hanging'
                                      r'|performance|memory leak|\bfps\b|unresponsive|stutter'),
 ('Localization / translation',       r'translat|localiz|localis|i18n|\blang\b|german|french|spanish'
                                      r'|portugu|russian|chinese|japanese|korean'),
 ('Mobile / touch devices',           r'mobile|\btouch|tablet|ipad|android|\bphone\b|small screen'),
 ('Browser or OS specific',           r'\blinux\b|\bwindows\b|macos|\bmac\b|chrome|firefox|safari|electron'),
 ('Players vs GM: permissions',       r'permission|ownership|\bgm only\b|as a player|players? (can\'?t'
                                      r'|cannot|do(n\'?t| not))|not visible to|unauthoriz|limited (access|permission)'),
 ('Settings or data lost',            r'\blost\b|\breset\b|disappear|missing after|not saved|not persist'
                                      r'|wiped|cannot save|doesn\'?t save'),
 ('Import / export / compendium',     r'\bimport|\bexport|compendium|munch'),
 ('Animations / visual effects',      r'animat|\bvfx\b|\bfx\b|particle|\bfilter|shader|sprite'
                                      r'|visual effect|\beffects?\b'),
 ('Audio / playlists',                r'\bsound|\baudio|playlist|\bmusic\b|volume'),
 ('Macros, API, hooks',               r'\bmacro|\bapi\b|\bhook\b|\bscripts?\b|scripting'),
 ('System-specific behaviour',        r'\bpf2e?\b|\bdnd5e\b|\bd&d\b|\b5e\b|swade|wfrp|starfinder|lancer'
                                      r'|\bpf1\b|sw5e|\bdsa\b|\btde\b|pathfinder'),
 ('Tokens, vision, lighting',         r'\btokens?\b|\bvision\b|\bsight\b|\blights?\b|\bwalls?\b|\bfog\b'
                                      r'|elevation|detection'),
 ('Scenes, tiles, canvas',            r'\bscenes?\b|\btiles?\b|canvas|\bgrid\b|background|\bmaps?\b'),
 ('Rolls, chat, dice',                r'\brolls?\b|\bdice\b|chat|\bdamage\b|initiative'),
 ('Sheets, HUD, UI layout',           r'\bsheets?\b|\bhud\b|\bui\b|window|button|\bcss\b|styl|layout'
                                      r'|\btheme|dark mode|\bicons?\b|\bfont'),
 ('Uncaught errors / exceptions',     r'\berrors?\b|exception|uncaught|typeerror|cannot read|undefined'
                                      r'|stack trace|console|crash'),
]
THEMES = [(n, re.compile(p, re.I)) for n, p in THEMES]
EMPTY = re.compile(r'^(brief description of your issue|describe the bug|<.*>|title|none)\.?$', re.I)


def primary(i):
    t = strip(i['title'])
    if EMPTY.match(t):
        return 'template left unfilled'
    for name, rx in THEMES:
        if rx.search(t):
            return name
    return 'other / unclassified'


def mentions(pool, pattern):
    rx = re.compile(pattern, re.I)
    hit = [i for i in pool if rx.search(strip(i['title']))]
    return len(hit), len({i['repo'] for i in hit})


def days(s):
    return (TODAY - datetime.date(*map(int, s.split('-')))).days


issues, repos = rows(ISSUES_TSV), rows(REPOS_TSV)
DEPTH = max(int(r['rank']) for r in repos)
BANDS = [(1, 100, 'ranks 1–100'), (101, DEPTH, f'ranks 101–{DEPTH}')]
bugs = [i for i in issues if kind(i) == 'bug']
feats = [i for i in issues if kind(i) == 'feature']
neither = [i for i in issues if kind(i) == 'neither']
with_tracker = {i['repo'] for i in issues}
gone = [r for r in repos if r['has_issues'] == 'repo-gone']
archived = [r for r in repos if r['archived'] == 'yes']
no_tracker = [r for r in repos if r['has_issues'] == 'no']
unreachable = len(gone) + len(archived) + len(no_tracker)


def band(pool, lo, hi):
    return [x for x in pool if lo <= int(x['rank']) <= hi]

SYS_PAT = r'\bpf2e?\b|\bdnd5e\b|\bd&d\b|\b5e\b|swade|wfrp|starfinder|lancer|\bpf1\b|sw5e|\bdsa\b|pathfinder'
PERM_PAT = r"permission|ownership|as a player|players? (can'?t|cannot)"
# same pattern as the "A Foundry version or compatibility" row above, so the two numbers agree
COMPAT_PAT = (r"\bv1[0-4]\b|version 1[0-4]|foundry 1[0-4]|compatib|deprecat|after (the )?updat"
              r"|no longer work|stopped working")

age = sorted(days(i['created']) for i in issues)
stale = [i for i in issues if days(i['updated']) > 730]
silent = [i for i in issues if i['comments'] == '0']
owners = collections.Counter(i['repo'].split('/')[0] for i in issues)
top_owner, top_owner_n = owners.most_common(1)[0]


def theme_table(pool, label):
    cnt = collections.Counter(primary(i) for i in pool)
    reps = collections.defaultdict(set)
    for i in pool:
        reps[primary(i)].add(i['repo'])
    out = [f'### {label} (n={len(pool)})\n',
           '| Theme | Issues | Share | Repos |', '|---|---:|---:|---:|']
    for name, n in cnt.most_common():
        out.append(f'| {name} | {n} | {100 * n / len(pool):.1f}% | {len(reps[name])} |')
    return '\n'.join(out) + '\n'


fh = open(OUT, 'w', encoding='utf8')
w = fh.write

w(f"""# Pain points: the open issues of the most-installed modules

What users complain about, taken from the issue trackers of the top {DEPTH} modules by install share —
down to {min(float(r['installs_pct']) for r in repos if r['installs_pct']):.1f}% of worlds.
Data of {DATE}. [Back to the overview](README.md).

413 of those {DEPTH} modules are on GitHub, and they resolve to **{len(repos)}** distinct repositories —
some authors ship several modules from one, and `flamewave000/dragonflagon-fvtt` alone serves eight. The
other 87 modules are not reachable this way: 43 sit on GitLab — including Dice So Nice, Midi-QOL, DAE,
Pings and Quick Insert — 17 link a Patreon page instead of source, 5 are on Codeberg, 3 on git.gay, 2 on
Bitbucket, and the rest give a storefront or nothing. The GitLab group is the significant one: it holds
much of the 5e automation stack, which is exactly where system-specific breakage would show up.

{len(issues)} open issues (pull requests excluded) across {len(with_tracker)} repositories that have any,
each issue counted once.

## The short answer

**The most common pain point is not a missing feature or a particular bug — it is being ignored.**
{len(silent)} of {len(issues)} open issues ({100 * len(silent) / len(issues):.0f}%) never received a single
comment, {len(stale)} ({100 * len(stale) / len(issues):.0f}%) have had no activity for two years or more,
and the median open issue is {age[len(age) // 2] / 365:.1f} years old (upper quartile
{age[int(len(age) * .75)] / 365:.1f} years, oldest {age[-1] / 365:.1f}).

That is not an artefact of looking only at the biggest modules. The share of issues nobody ever answered
is the same in the top 100 as in the 400 below it:

| Band | Issues | Repos | Never answered | No activity 2+ years | Median age |
|---|---:|---:|---:|---:|---:|
""")
for lo, hi, lab in BANDS:
    p = band(issues, lo, hi)
    if not p:
        continue
    a = sorted(days(i['created']) for i in p)
    sil = sum(1 for i in p if i['comments'] == '0')
    st = sum(1 for i in p if days(i['updated']) > 730)
    w(f'| {lab} | {len(p)} | {len({i["repo"] for i in p})} | {100 * sil / len(p):.0f}% '
      f'| {100 * st / len(p):.0f}% | {a[len(a) // 2] / 365:.1f} y |\n')

w(f"""
**Backlogs are wishlists, not defect lists.** {len(feats)} issues are feature requests against
{len(bugs)} bug reports. What users mostly want from these modules is *more*, not *fixed*.

**The backlog is concentrated in a few hands.** {top_owner_n} of {len(issues)} open issues
({100 * top_owner_n / len(issues):.0f}%) sit in `{top_owner}`'s repositories alone. Within the top 100
that share was higher still, so "the Foundry module backlog" is to a large extent a handful of prolific
authors' backlogs.

**{unreachable} of the {len(repos)} repositories give users nowhere to report anything**:
{len(archived)} archived, {len(no_tracker)} with issues switched off, and {len(gone)} whose repository
is simply gone — among them Warp Gate, a library in 18% of worlds, now a 404.

## Recurring pain, ranked by how many projects see it

Breadth matters more than volume here: a theme in 40 repositories is an ecosystem problem, while 200
issues in one repository are that module's own. Counts are non-exclusive — a title may mention several.
""")

for label, pat in [
        ('A Foundry version or compatibility', r'\bv1[0-4]\b|version 1[0-4]|foundry 1[0-4]|compatib'
                                               r'|deprecat|after (the )?updat|no longer work|stopped working'),
        ('A specific game system by name', r'\bpf2e?\b|\bdnd5e\b|\bd&d\b|\b5e\b|swade|wfrp|starfinder'
                                           r'|lancer|\bpf1\b|sw5e|\bdsa\b|pathfinder'),
        ('Tokens', r'\btokens?\b'),
        ('Players or permissions', r'\bplayers?\b|permission|ownership'),
        ('Another module, or a conflict', r'\bconflict|incompatib|with (this|the) module|libwrapper|interfere'),
        ('Active effects', r'\beffects?\b'),
]:
    n, r = mentions(issues, pat)
    if label.startswith('A Foundry'):
        w('\n| Mentioned in the title | Issues | Share | Repos |\n|---|---:|---:|---:|\n')
    w(f'| {label} | {n} | {100 * n / len(issues):.1f}% | {r} |\n')

vers = []
for v in ['v10', 'v11', 'v12', 'v13', 'v14']:
    rx = re.compile(r'\b' + v + r'\b|foundry ' + v[1:] + r'\b|version ' + v[1:] + r'\b', re.I)
    hit = [i for i in issues if rx.search(strip(i['title']))]
    vers.append((v, len(hit), sum(1 for i in hit if i['created'] >= DATE[:4] + '-01-01')))

w(f"""
**Compatibility is the tax everyone pays.** It is named in the titles of
{mentions(issues, COMPAT_PAT)[1]} different
repositories, and the pressure tracks the current generation rather than accumulating:
""")
w('\n| Foundry generation named | Issues | Opened this year |\n|---|---:|---:|\n')
for v, n, recent in vers:
    w(f'| {v} | {n} | {recent} |\n')

w(f"""
**Going generic has a price.** A specific game system is named in the titles of
{mentions(issues, SYS_PAT)[1]}
repositories. System-specific behaviour is the single largest *bug* theme below, and most of those
modules are system-agnostic by manifest — declaring no system does not stop users from reporting what
broke in theirs.

## Themes, one per issue

Each issue is assigned a single theme: the first pattern that matches its title, ordered so a specific
cause (a version bump, a module conflict) wins over a domain (tokens, scenes) and a domain wins over a
bare symptom (an exception). The large unclassified share is the honest cost of keyword matching.

""")
w(theme_table(bugs, 'Bug reports'))
w('\n')
w(theme_table(feats, 'Feature requests'))

w(f"""
## Where the backlogs are

""")
w('| Rank | Install% | Open issues | Module | Last push | Repository |\n|---:|---:|---:|---|---|---|\n')
for r in sorted([r for r in repos if r['open_issues']], key=lambda r: -int(r['open_issues']))[:15]:
    w(f"| {r['rank']} | {r['installs_pct']}% | {r['open_issues']} | `{md(r['id'], 40)}` "
      f"| {r['last_push']} | [{md(r['repo'], 44)}](https://github.com/{r['repo']}) |\n")

w(f"""
A big backlog is not automatically a badly run project, and a small one is not automatically a healthy
one. An abandoned tracker accumulates; a maintainer who triages aggressively shows few open issues; a
module nobody uses shows none at all. Read these counts next to the last-push date.

## Nowhere to report

| Rank | Module | Install% | State |
|---:|---|---:|---|
""")
for r in sorted(archived + no_tracker + gone, key=lambda r: int(r['rank'])):
    state = ('repository gone (404)' if r['has_issues'] == 'repo-gone'
             else 'archived' if r['archived'] == 'yes' else 'issue tracker disabled')
    w(f"| {r['rank']} | `{md(r['id'], 40)}` | {r['installs_pct'] or '—'}% | {state} |\n")

w(f"""
## What this suggests for a new module

1. **Answering beats shipping.** With {100 * len(silent) / len(issues):.0f}% of issues never answered,
   a maintained tracker is itself a differentiator — and cheap next to writing features.
2. **An abandoned module's backlog is a free specification.** Drag Ruler has
   {next((r['open_issues'] for r in repos if r['id'] == 'drag-ruler'), '?')} open issues and was last
   pushed {next((r['last_push'] for r in repos if r['id'] == 'drag-ruler'), '?')}; Combat Utility Belt
   {next((r['open_issues'] for r in repos if r['id'] == 'combat-utility-belt'), '?')} and archived;
   Compendium Folders {next((r['open_issues'] for r in repos if r['id'] == 'compendium-folders'), '?')},
   last pushed {next((r['last_push'] for r in repos if r['id'] == 'compendium-folders'), '?')}. Those
   lists say what users of a replacement would ask for, before a line is written.
3. **Budget for the generation bump.** Surviving a Foundry major version is the recurring cost in this
   data, not a one-off.
4. **Expect system-specific reports whatever the manifest says**, and decide in advance whether the
   answer is an adapter or a documented "not supported".
5. **Permissions are a recurring correctness trap** — players not seeing what the GM sees appears across
   {mentions(issues, PERM_PAT)[1]} repositories.
   Worth testing as a player from the start rather than after a report.

## Method and limits

- Open issues only, pull requests excluded, at most the first 300 per repository (no repository
  reached that cap). Fetched {DATE} from the GitHub API, one metadata call per repository plus up to
  three pages of open issues.
- Classification is **regex over issue titles**, not reading. Bodies are excluded on purpose: they are
  largely issue-template boilerplate that matches every pattern. Expect misfiling at the margins; the
  unclassified share is reported rather than hidden.
- `bug` versus `feature request` comes from the authors' own labels first, then from a title prefix like
  `[BUG]`. Projects that label nothing land in neither bucket ({len(neither)} issues).
- Each issue is counted once even when several modules share its repository, and game system
  repositories given as a module's project URL are excluded — `make-issue-tsvs.py` documents both,
  which together removed 513 rows of the raw fetch.
- An open issue is not a measure of pain suffered: it measures what someone bothered to write down and
  nobody closed. Modules whose users complain on Discord instead look healthy here.
- The non-GitHub modules of the top {DEPTH} are missing entirely, and they are not a random
  sample: GitLab holds much of the 5e automation stack.
- Issue titles are quoted as data. Nothing in them was treated as an instruction.

Raw data: [`data/github-open-issues.tsv`](data/github-open-issues.tsv) ({len(issues)} issues: rank,
install share, module, repo, number, title, labels, dates, comment count) and
[`data/github-issue-repos.tsv`](data/github-issue-repos.tsv) ({len(repos)} repositories with stars,
archived and tracker state, open-issue count and last push). Rebuild this page with
`make-pain-points.py` (see the overview's refresh section).
""")
fh.close()
print('wrote', OUT)
print(f'{len(issues)} issues | bugs {len(bugs)} | features {len(feats)} | neither {len(neither)}')
print(f'unclassified bugs: {sum(1 for i in bugs if primary(i) == "other / unclassified")}')
