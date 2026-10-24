#!/usr/bin/env python3
"""Build data/bestiary.json from the 5etools data repo.

Usage: python3 tools/build_bestiary.py [path-to-5etools-data-dir]
  The directory must contain bestiary/, books.json, adventures.json, legendarygroups is read from bestiary/.
  Without an argument the data is downloaded from GitHub (5etools-mirror-3/5etools-src).

Steps: load every bestiary file -> resolve _copy entries -> drop creatures that a newer
book reprinted under another name (reprintedAs) -> for same-name duplicates keep the one from
the newest book -> slim to the fields the app uses.
"""
import json, os, re, sys, copy, glob, subprocess, concurrent.futures as cf

RAW = 'https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data/'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'bestiary.json')


def fetch_all(dest):
    os.makedirs(os.path.join(dest, 'bestiary'), exist_ok=True)
    def get(rel):
        p = os.path.join(dest, rel)
        subprocess.run(['curl', '-sS', '-f', '-m', '120', '-o', p, RAW + rel], check=True)
    for rel in ['books.json', 'adventures.json', 'bestiary/index.json', 'bestiary/legendarygroups.json']:
        get(rel)
    idx = json.load(open(os.path.join(dest, 'bestiary/index.json')))
    with cf.ThreadPoolExecutor(8) as ex:
        list(ex.map(get, ['bestiary/' + f for f in idx.values()]))


def load(dirp):
    idx = json.load(open(os.path.join(dirp, 'bestiary/index.json')))
    mons = []
    for f in idx.values():
        mons += json.load(open(os.path.join(dirp, 'bestiary', f))).get('monster', [])
    published = {}
    for b in json.load(open(os.path.join(dirp, 'books.json')))['book']:
        published[b['source']] = b.get('published', '')
    for a in json.load(open(os.path.join(dirp, 'adventures.json')))['adventure']:
        published[a['source']] = a.get('published', '')
    lg = {}
    for g in json.load(open(os.path.join(dirp, 'bestiary/legendarygroups.json')))['legendaryGroup']:
        lg[(g['name'], g['source'])] = g
    return mons, published, lg


# ---------- _copy resolution ----------
DROP_ON_COPY = ['srd', 'srd52', 'basicRules', 'basicRules2024', 'reprintedAs', 'otherSources', 'isReprinted',
                'hasToken', 'hasFluff', 'hasFluffImages', 'altArt', 'soundClip', 'tokenCustom', 'page', 'familiar', 'group']


def walk_strings(o, fn):
    if isinstance(o, str):
        return fn(o)
    if isinstance(o, list):
        return [walk_strings(x, fn) for x in o]
    if isinstance(o, dict):
        return {k: walk_strings(v, fn) for k, v in o.items()}
    return o


def as_list(x):
    return x if isinstance(x, list) else [x]


def py_flags(f):
    fl = 0
    for c in (f or ''):
        fl |= {'i': re.I, 'm': re.M, 's': re.S}.get(c, 0)
    return fl


def apply_mod(mon, prop, mod, unknown):
    if prop == '*':
        mode = mod.get('mode')
        if mode == 'replaceTxt':
            rx = re.compile(mod['replace'], py_flags(mod.get('flags')))
            w = mod['with']
            for k in list(mon.keys()):
                if k in ('name', 'source', '_copy'):
                    continue
                if mod.get('props') and k not in mod['props']:
                    continue
                mon[k] = walk_strings(mon[k], lambda s: rx.sub(w, s))
        else:
            unknown.add('*:' + str(mode))
        return
    mode = mod.get('mode') if isinstance(mod, dict) else None
    if isinstance(mod, str):  # e.g. "remove"
        if mod == 'remove':
            mon.pop(prop, None)
        return
    arr = mon.get(prop)
    if mode == 'appendArr':
        mon[prop] = (arr or []) + as_list(mod['items'])
    elif mode == 'prependArr':
        mon[prop] = as_list(mod['items']) + (arr or [])
    elif mode == 'insertArr':
        a = arr or []; i = mod.get('index', 0)
        mon[prop] = a[:i] + as_list(mod['items']) + a[i:]
    elif mode == 'appendIfNotExistsArr':
        a = list(arr or [])
        for it in as_list(mod['items']):
            if it not in a:
                a.append(it)
        mon[prop] = a
    elif mode in ('replaceArr', 'replaceOrAppendArr'):
        a = list(arr or [])
        rep = mod['replace']
        idx = None
        if isinstance(rep, dict) and 'index' in rep:
            idx = rep['index']
        else:
            for i, x in enumerate(a):
                nm = x.get('name') if isinstance(x, dict) else x
                if nm == rep:
                    idx = i; break
        items = as_list(mod['items'])
        if idx is None:
            if mode == 'replaceOrAppendArr':
                a += items
        else:
            a = a[:idx] + items + a[idx + 1:]
        mon[prop] = a
    elif mode == 'removeArr':
        names = mod.get('names') or mod.get('items')
        names = as_list(names) if names is not None else []
        mon[prop] = [x for x in (arr or []) if (x.get('name') if isinstance(x, dict) else x) not in names]
    elif mode == 'replaceTxt':
        rx = re.compile(mod['replace'], py_flags(mod.get('flags')))
        if arr is not None:
            mon[prop] = walk_strings(arr, lambda s: rx.sub(mod['with'], s))
    elif mode == 'setProp':
        path = mod['prop'].split('.')
        o = mon
        for p in path[:-1]:
            o = o.setdefault(p, {})
        o[path[-1]] = mod['value']
    elif mode == 'addSenses':
        s = list(mon.get('senses') or [])
        for it in as_list(mod['senses']):
            s.append('%s %d ft.' % (it['type'], it['val']))
        mon['senses'] = s
    elif mode in ('addSkills', 'addSaves'):
        key = 'skill' if mode == 'addSkills' else 'save'
        d = dict(mon.get(key) or {})
        pb = None
        cr = mon.get('cr'); cr = cr.get('cr') if isinstance(cr, dict) else cr
        n = cr_num(cr)
        pb = 2 + int((max(n, 1) - 1) // 4) if n is not None else 2
        for k, mult in (mod.get(key + 's') or mod.get('skills') or mod.get('saves') or {}).items():
            abil = {'athletics': 'str', 'acrobatics': 'dex', 'stealth': 'dex', 'sleight of hand': 'dex'}.get(k, None)
            stat = k if key == 'save' else (abil or 'wis')
            m = (mon.get(stat, 10) - 10) // 2
            d[k] = '%+d' % (m + pb * mult)
        mon[key] = d
    else:
        unknown.add(str(prop) + ':' + str(mode))


def cr_num(cr):
    if cr is None:
        return None
    if isinstance(cr, dict):
        cr = cr.get('cr')
    if cr in (None, 'Unknown', '--'):
        return None
    if '/' in str(cr):
        a, b = str(cr).split('/')
        return int(a) / int(b)
    try:
        return float(cr)
    except ValueError:
        return None


def resolve(m, table, cache, unknown, stack=()):
    key = (m['name'], m['source'])
    if key in cache:
        return cache[key]
    if '_copy' not in m:
        cache[key] = m
        return m
    c = m['_copy']
    bkey = (c['name'], c['source'])
    base = table.get(bkey) or table.get(('ci', c['name'].lower(), c['source']))
    if base is None or bkey in stack:
        unknown.add('missing-base:%s|%s' % bkey)
        out = {k: v for k, v in m.items() if k != '_copy'}
        cache[key] = out
        return out
    base = resolve(base, table, cache, unknown, stack + (key,))
    out = copy.deepcopy(base)
    preserve = c.get('_preserve') or {}
    for k in DROP_ON_COPY:
        if not preserve.get(k) and not preserve.get('*'):
            out.pop(k, None)
    for k, v in m.items():
        if k != '_copy':
            out[k] = v
    mods = c.get('_mod') or {}
    # text replace on '*' first (it is commonly used to rename the creature in text)
    for prop, mod in mods.items():
        for one in as_list(mod):
            apply_mod(out, prop, one, unknown)
    cache[key] = out
    return out


# ---------- slimming ----------
KEEP = ['name', 'source', 'page', 'size', 'type', 'alignment', 'alignmentPrefix', 'ac', 'hp', 'speed',
        'str', 'dex', 'con', 'int', 'wis', 'cha', 'save', 'skill', 'senses', 'passive', 'resist', 'immune',
        'vulnerable', 'conditionImmune', 'languages', 'cr', 'pbNote', 'initiative', 'gear', 'trait', 'action',
        'actionNote', 'bonus', 'reaction', 'reactionHeader', 'legendary', 'legendaryHeader', 'legendaryActions',
        'legendaryActionsLair', 'mythic', 'mythicHeader', 'spellcasting', 'environment', 'isNpc',
        'isNamedCreature', 'shortName', 'summonedBySpell', 'level']


def slim(m, lg):
    o = {k: m[k] for k in KEEP if k in m}
    g = m.get('legendaryGroup')
    if g:
        grp = lg.get((g['name'], g['source']))
        if grp:
            for k in ('lairActions', 'regionalEffects', 'mythicEncounter'):
                if k in grp:
                    o[k] = grp[k]
    return o


def mtype(m):
    t = m.get('type')
    if isinstance(t, dict):
        t = t.get('type')
    if isinstance(t, dict):  # {choose:[...]}
        t = '/'.join(t.get('choose', []))
    return t or ''


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else None
    if not src:
        src = '/tmp/5etools-data'
        fetch_all(src)
    mons, published, lg = load(src)
    print('loaded', len(mons))
    table = {(m['name'], m['source']): m for m in mons}
    for m in mons:
        table.setdefault(('ci', m['name'].lower(), m['source']), m)
    cache, unknown = {}, set()
    resolved = [resolve(m, table, cache, unknown) for m in mons]
    print('unhandled copy mods/missing bases:', sorted(unknown))
    byid = {(m['name'], m['source']): m for m in resolved}

    # reprintedAs: drop creatures that a newer book reprinted under another name
    dropped, aka = set(), {}
    for m in resolved:
        for r in m.get('reprintedAs') or []:
            uid = r if isinstance(r, str) else r.get('uid', '')
            nm, _, so = uid.partition('|')
            tgt = (nm, so)
            if tgt in byid and tgt != (m['name'], m['source']) and published.get(so, '') >= published.get(m['source'], ''):
                dropped.add((m['name'], m['source']))
                aka.setdefault(tgt, set()).add(m['name'])
    kept = [m for m in resolved if (m['name'], m['source']) not in dropped]
    print('dropped as reprinted:', len(dropped))

    # same name: newest book wins
    best = {}
    for m in kept:
        k = m['name'].lower()
        cur = best.get(k)
        if cur is None or published.get(m['source'], '') > published.get(cur['source'], ''):
            best[k] = m
    final = sorted(best.values(), key=lambda m: m['name'].lower())
    print('after newest-book dedupe:', len(final))

    out = []
    for m in final:
        s = slim(m, lg)
        s['crn'] = cr_num(m.get('cr'))
        s['t'] = mtype(m)
        a = aka.get((m['name'], m['source']))
        a = (a or set()) - {m['name']}
        if a:
            s['aka'] = sorted(a)
        out.append(s)
    with open(OUT, 'w') as f:
        json.dump({'built': __import__('datetime').date.today().isoformat(), 'monsters': out}, f, separators=(',', ':'))
    print('wrote', os.path.getsize(OUT) // 1024, 'KB,', len(out), 'creatures')
    print('missing published date for:', sorted({m['source'] for m in out if m['source'] not in published}))


if __name__ == '__main__':
    main()
