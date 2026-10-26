"""Turn the raw GitHub issue fetch into the two TSVs in data/.

Usage:
    python3 -I make-issue-tsvs.py issues.jsonl issues_meta.json \
        data/github-open-issues.tsv data/github-issue-repos.tsv

Two corrections happen here, both of which the raw fetch cannot make on its own.

**One repository, several modules.** Some authors ship many modules from one repository
(`flamewave000/dragonflagon-fvtt` serves eight). The fetch is driven by the module list, so such a
repository is visited once per module and its issues land in the file several times — 288 duplicate
rows in the first run over ranks 1-500. An issue is counted once here, attributed to the
best-ranked module that claims the repository; the others are listed in `also_modules`.

**A game system is not a module.** A few modules give a game system's repository as their project
URL. Its issues are the system's, not the module's, and a system repository is large enough to swamp
the data: `foundryvtt/pf2e` alone carried 225 open issues. Those repositories are excluded by name.

Issue titles are third-party text: scrubbed of control characters, never treated as instruction.
"""
import json, re, sys, collections

ISS, META, OUT_I, OUT_R = sys.argv[1:5]

# Game system repositories given as a module's project URL. The issues in them belong to the system.
EXCLUDE_REPOS = {
    'foundryvtt/pf2e': 'the Pathfinder 2e game system, linked by sf2e-anachronism',
}


def flat(s):
    return re.sub(r'\s+', ' ', re.sub(r'[\x00-\x1f\x7f]', ' ', s or '')).strip()


issues = [json.loads(l) for l in open(ISS, encoding='utf8')]
meta = json.load(open(META, encoding='utf8'))

# one row per repository, kept under the best-ranked module that claims it
by_repo = {}
extra = collections.defaultdict(list)
for m in sorted(meta, key=lambda x: x['rank']):
    if m['repo'] in EXCLUDE_REPOS:
        continue
    if m['repo'] in by_repo:
        extra[m['repo']].append(m['id'])
        continue
    by_repo[m['repo']] = m

dropped_repos = sum(1 for m in meta if m['repo'] in EXCLUDE_REPOS)
shared = sum(len(v) for v in extra.values())

seen = set()
kept = 0
with open(OUT_I, 'w', encoding='utf8') as fh:
    fh.write('rank\tinstalls_pct\tid\trepo\tnumber\ttitle\tlabels\tcreated\tupdated\tcomments\n')
    for i in sorted(issues, key=lambda x: (x['rank'], x['number'])):
        if i['repo'] in EXCLUDE_REPOS:
            continue
        key = (i['repo'], i['number'])
        if key in seen:
            continue
        seen.add(key)
        owner = by_repo.get(i['repo'])
        if owner is None:
            continue
        fh.write('\t'.join([str(owner['rank']), f"{owner.get('installs', 0):.2f}", owner['id'],
                            i['repo'], str(i['number']), flat(i['title']),
                            ';'.join(flat(l) for l in i['labels']),
                            i['created'], i['updated'], str(i['comments'])]) + '\n')
        kept += 1

with open(OUT_R, 'w', encoding='utf8') as fh:
    fh.write('rank\tinstalls_pct\tid\trepo\tstars\tarchived\thas_issues\topen_issues\tlast_push'
             '\tcreated\talso_modules\n')
    for m in sorted(by_repo.values(), key=lambda x: x['rank']):
        also = ';'.join(sorted(extra.get(m['repo'], [])))
        if 'error' in m:
            fh.write('\t'.join([str(m['rank']), '', m['id'], m['repo'], '', '', 'repo-gone',
                                '', '', '', also]) + '\n')
            continue
        fh.write('\t'.join([str(m['rank']), f"{m['installs']:.2f}", m['id'], m['repo'],
                            str(m['stars']), 'yes' if m['archived'] else 'no',
                            'yes' if m['has_issues'] else 'no', str(m['open_issues_fetched']),
                            m['pushed_at'], m['created_at'], also]) + '\n')

print(f'issues: {len(issues)} fetched -> {kept} kept '
      f'({len(issues) - kept} dropped as duplicates or system issues)')
print(f'repos: {len(meta)} rows -> {len(by_repo)} distinct '
      f'({shared} extra module claims folded in, {dropped_repos} excluded as a game system)')
for r, why in EXCLUDE_REPOS.items():
    print(f'  excluded {r}: {why}')
