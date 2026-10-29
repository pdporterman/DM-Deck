#!/usr/bin/env python3
"""Build data/rules.json (conditions, actions and combat rules) from the 5etools data.

Usage: python3 tools/build_rules.py [path-to-5etools-data-dir]
  Without an argument the three source files are downloaded from GitHub (5etools-mirror-3/5etools-src).
Then change VERSION at the top of sw.js so installed copies refresh.

Two editions are written: "2024" (XPHB) and "2014" (PHB, plus the DMG/XGE optional rules).
"""
import datetime, json, os, subprocess, sys, tempfile

RAW = 'https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data/'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'rules.json')

RULES_2024 = ['Unarmed Strike', 'Grappling', 'Cover', 'Advantage', 'Disadvantage', 'D20 Test', 'Attack Roll', 'Critical Hit',
              'Saving Throw', 'Ability Check', 'Initiative', 'Reach', 'Occupied Space', 'Unoccupied Space', 'Size', 'Speed',
              'Difficult Terrain', 'Climbing', 'Crawling', 'Swimming', 'Flying', 'Jumping', 'High Jump', 'Long Jump',
              'Darkness', 'Heavily Obscured', 'Lightly Obscured', 'Bright Light', 'Dim Light',
              'Hit Points', 'Temporary Hit Points', 'Healing', 'Knocking Out a Creature', 'Death Saving Throw', 'Stable', 'Dead',
              'Damage Types', 'Resistance', 'Vulnerability', 'Immunity', 'Damage Threshold', 'Simultaneous Effects',
              'Improvised Weapons', 'Breaking Objects', 'Hazard', 'Short Rest', 'Long Rest', 'Heroic Inspiration',
              'Passive Perception', 'Shape-Shifting']
RULES_2014_DMG = ['Flanking', 'Facing', 'Hitting Cover', 'Cleaving Through Creatures', 'Massive Damage', 'Injuries',
                  'Initiative Variants', 'Fear and Horror', 'Morale', 'Action Options', 'Playing on a Grid', 'Diagonals']
ACTIONS_2014_OPTIONAL = [('Climb onto a Bigger Creature', 'DMG'), ('Disarm', 'DMG'), ('Mark', 'DMG'), ('Overrun', 'DMG'),
                         ('Shove Aside', 'DMG'), ('Tumble', 'DMG'), ('Activate an Item', 'DMG'), ('Healing Surge', 'DMG'),
                         ('Identify a Spell', 'XGE'), ('Waking Someone', 'XGE')]
# words that should find an entry even though the entry's own name differs
KEYS = {('Unarmed Strike', 'XPHB'): 'grapple grappling shove push punch kick', ('Grappling', 'XPHB'): 'grapple grab hold',
        ('Escape a Grapple', 'XPHB'): 'grapple break free', ('Opportunity Attack', 'XPHB'): 'attack of opportunity'}


def get(dirp, rel):
    p = os.path.join(dirp, rel)
    if not os.path.exists(p):
        subprocess.run(['curl', '-sS', '-f', '-m', '120', '-o', p, RAW + rel], check=True)
    return json.load(open(p, encoding='utf-8'))


def item(x):
    o = {'name': x['name'], 'source': x['source'], 'entries': x.get('entries', [])}
    if x.get('page'):
        o['page'] = x['page']
    t = x.get('time')
    if t and isinstance(t, list) and isinstance(t[0], dict) and t[0].get('unit') in ('action', 'bonus', 'reaction'):
        o['time'] = {'action': 'Action', 'bonus': 'Bonus Action', 'reaction': 'Reaction'}[t[0]['unit']]
    k = KEYS.get((x['name'], x['source']))
    if k:
        o['keys'] = k
    return o


def main():
    d = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp(prefix='5etools-rules-')
    cd, act, var = get(d, 'conditionsdiseases.json'), get(d, 'actions.json'), get(d, 'variantrules.json')
    conds = {(x['name'], x['source']): x for x in cd['condition']}
    stats = {(x['name'], x['source']): x for x in cd['status']}
    acts = {(x['name'], x['source']): x for x in act['action']}
    rules = {(x['name'], x['source']): x for x in var['variantrule']}

    def pick(table, names, *srcs):
        return [item(table[(n, s)]) for n in names for s in srcs[:1] + srcs[1:] if (n, s) in table][:len(names)]

    def by_src(table, src):
        return [item(v) for k, v in sorted(table.items()) if k[1] == src]

    out = {'built': datetime.date.today().isoformat(), 'editions': {
        '2024': {
            'Conditions': by_src(conds, 'XPHB'),
            'Other statuses': by_src(stats, 'XPHB'),
            'Actions in combat': by_src(acts, 'XPHB'),
            'Core rules': pick(rules, RULES_2024, 'XPHB'),
        },
        '2014': {
            'Conditions': by_src(conds, 'PHB'),
            'Other statuses': by_src(stats, 'PHB'),
            'Actions in combat': by_src(acts, 'PHB'),
            'Optional actions': [item(acts[k]) for k in ACTIONS_2014_OPTIONAL if k in acts],
            'Optional and variant rules': pick(rules, RULES_2014_DMG, 'DMG', 'PHB'),
        }}}
    for ed, groups in out['editions'].items():
        print(ed, {k: len(v) for k, v in groups.items()})
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, separators=(',', ':'), ensure_ascii=False)
    print('wrote', os.path.getsize(OUT) // 1024, 'KB')


if __name__ == '__main__':
    main()
