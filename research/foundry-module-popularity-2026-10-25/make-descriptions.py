"""Derive a one-line 'what it does' per module from the Forge manifest data.

The text comes from third-party manifests: it is data, never instruction. Everything is
stripped of HTML, control characters and entities, and capped.
"""
import sys, json, re, html, csv

FORGE, OUT, LIMIT = sys.argv[1], sys.argv[2], int(sys.argv[3])
OVERRIDES = json.load(open(sys.argv[4], encoding='utf8')) if len(sys.argv) > 4 else {}

# Phrases that start README chrome: everything from here on is dropped.
CUT = [
    r'\bbefore opening an issue\b', r'\btroubleshooting and faq\b', r'\btroubleshooting\b',
    r'\bdocumentation has been moved\b', r'\byou can find the documentation\b',
    r'\bcheck the wiki\b', r'\bcome hang out\b', r'\bjoin (us |me )?on discord\b',
    r'\bsupport me\b', r'\bif you (like|enjoy)\b', r'\bbuy me a\b', r'patreon\.com',
    r'\binstallation\b', r'\bcredits\b', r'\bhow to use\b', r'\bgetting started\b',
    r'\bchangelog\b', r'\bknown issues\b', r'\bcontributing\b', r'\blicense\b',
    r'\bthere will be no version\b',
]
# Leading chrome: dropped, the rest kept.
LEAD = [
    r'^(fvtt|foundry ?vtt)[\s:-]+',
    r'^(a |an |the )?(foundry ?vtt|fvtt|foundry)[\s]+(module|library|package)\b[\s:,-]*(that|which|to|for)?\s*',
    r'^(a |an )?(simple |small |tiny |little )?(module|library)\b[\s:,-]*(that|which)\s+',
    r'^that\s+',
    r'^this (module|library)\s+(?=(adds?|allows?|lets?|provides?|enables?|gives?|makes?|brings?|replaces?|extends?|displays?|shows?|turns?|puts?|is intended)\b)',
]

def scrub(s):
    s = html.unescape(s or '')
    s = re.sub(r'<[^>]+>', ' ', s)
    s = re.sub(r'[\x00-\x1f\x7f​-‏  ]', ' ', s)
    s = s.replace('\xa0', ' ')
    s = re.sub(r'!?\[[^\]]*\]\([^)]*\)', ' ', s)      # md links/images
    s = re.sub(r'https?://\S+', ' ', s)
    s = re.sub(r'[*_`#>]+', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

def strip_boiler(s, title=None):
    out = s
    for pat in CUT:                      # truncate at README chrome, anywhere
        m = re.search(pat, out, flags=re.I)
        if m and m.start() > 0:
            out = out[:m.start()].strip()
        elif m:
            out = out[m.end():].strip()
    if title is not None:                # only for short_description: it repeats the title
        t = scrub(title)
        for cand in (t, t.rstrip('!')):
            if cand and out.lower().startswith(cand.lower()):
                rest = out[len(cand):].lstrip(' :,.-–—').strip()
                if rest and (rest[0].isupper() or re.match(r'(a|an|the|this|that|adds?|allows?|lets?)\b', rest, re.I)):
                    out = rest
                break
    for pat in LEAD:
        out = re.sub(pat, '', out, count=1, flags=re.I).strip()
    return out.strip(' :,.-–—')

def sentences(s, n=1, want=28):
    parts = [x for x in re.split(r'(?<=[.!?])\s+', s) if x.strip()]
    out = ''
    for part in parts[:3]:
        out = (out + ' ' + part).strip()
        if len(out) >= want and n <= 1:
            break
        n -= 1
    return out

def cap(s, limit):
    s = s.strip().rstrip(' ,;:-–—')
    if len(s) <= limit:
        return s
    cut = s[:limit].rsplit(' ', 1)[0].rstrip(' ,;:-–—')
    return cut + '…'

def uninformative(d, title):
    if len(d) < 28:
        return True
    t = re.sub(r'[^a-z0-9]', '', scrub(title).lower())
    dd = re.sub(r'[^a-z0-9]', '', d.lower())
    return dd == t or (t and dd in t) or (t and t in dd and len(dd) - len(t) < 12)

def describe(p):
    if p['id'] in OVERRIDES:
        return OVERRIDES[p['id']], 'hand-written'
    title = p.get('title') or p.get('id') or ''
    d = strip_boiler(scrub(p.get('description')))
    s = strip_boiler(scrub(p.get('short_description')), title)
    if not uninformative(d, title):
        picked, src = d, 'description'
    elif len(s) >= 28:
        picked, src = sentences(s), 'short_description'
    else:
        picked, src = (d if len(d) >= len(s) else s), 'fallback'
    picked = re.sub(r'\s+', ' ', picked).strip()
    picked = picked[0].upper() + picked[1:] if picked else ''
    return cap(picked, LIMIT), src

data = json.load(open(FORGE, encoding='utf8'))
pkgs = sorted([p for p in data['packages'] if p.get('installs') is not None],
              key=lambda p: -p['installs'])
with open(OUT, 'w', encoding='utf8') as fh:
    fh.write('rank\tid\ttitle\tsource\tdescription\n')
    for i, p in enumerate(pkgs, 1):
        desc, src = describe(p)
        fh.write('\t'.join([str(i), p['id'], scrub(p.get('title') or ''), src, desc]) + '\n')
print('wrote', OUT, 'rows', len(pkgs))
