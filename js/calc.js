// Encounter difficulty. 2024 DMG (XP budget per character) and 2014 DMG (thresholds + multiplier).
export const CR_XP = {
  0: 10, 0.125: 25, 0.25: 50, 0.5: 100, 1: 200, 2: 450, 3: 700, 4: 1100, 5: 1800, 6: 2300, 7: 2900, 8: 3900,
  9: 5000, 10: 5900, 11: 7200, 12: 8400, 13: 10000, 14: 11500, 15: 13000, 16: 15000, 17: 18000, 18: 20000,
  19: 22000, 20: 25000, 21: 33000, 22: 41000, 23: 50000, 24: 62000, 25: 75000, 26: 90000, 27: 105000,
  28: 120000, 29: 135000, 30: 155000,
};
export const xpForCr = crn => (crn == null ? 0 : (CR_XP[crn] ?? 0));

export const crLabel = crn => (crn == null ? '—' : crn === 0.125 ? '1/8' : crn === 0.25 ? '1/4' : crn === 0.5 ? '1/2' : String(crn));
export const proficiency = crn => (crn == null || crn < 5 ? 2 : 2 + Math.floor((crn - 1) / 4));

// [Low, Moderate, High] XP per character, indexed by level 1..20 (2024 DMG)
const B2024 = [null,
  [50, 75, 100], [100, 150, 200], [150, 225, 400], [250, 375, 500], [500, 750, 1100], [600, 1000, 1400],
  [750, 1300, 1700], [1000, 1700, 2100], [1300, 2000, 2600], [1600, 2300, 3100], [1900, 2900, 4100],
  [2200, 3700, 4700], [2600, 4200, 5400], [2900, 4900, 6200], [3300, 5400, 7800], [3800, 6100, 9800],
  [4500, 7200, 11700], [5000, 8700, 14200], [5500, 10700, 17200], [6400, 13200, 22000]];

// [Easy, Medium, Hard, Deadly] XP per character, indexed by level 1..20 (2014 DMG)
const B2014 = [null,
  [25, 50, 75, 100], [50, 100, 150, 200], [75, 150, 225, 400], [125, 250, 375, 500], [250, 500, 750, 1100],
  [300, 600, 900, 1400], [350, 750, 1100, 1700], [450, 900, 1400, 2100], [550, 1100, 1600, 2400],
  [600, 1200, 1900, 2800], [800, 1600, 2400, 3600], [1000, 2000, 3000, 4500], [1100, 2200, 3400, 5100],
  [1250, 2500, 3800, 5700], [1400, 2800, 4300, 6400], [1600, 3200, 4800, 7200], [2000, 3900, 5900, 8800],
  [2100, 4200, 6300, 9500], [2400, 4900, 7300, 10900], [2800, 5700, 8500, 12700]];

const MULTS = [0.5, 1, 1.5, 2, 2.5, 3, 4];
function multiplier(monsterCount, partySize) {
  let i = monsterCount <= 1 ? 1 : monsterCount === 2 ? 2 : monsterCount <= 6 ? 3 : monsterCount <= 10 ? 4 : monsterCount <= 14 ? 5 : 6;
  if (partySize < 3) i = Math.min(i + 1, MULTS.length - 1);
  else if (partySize >= 6) i = Math.max(i - 1, 0);
  return MULTS[i];
}

const clampLevel = l => Math.max(1, Math.min(20, Math.round(Number(l) || 1)));

/**
 * @param {number[]} levels  character levels
 * @param {(number|null)[]} crs  one CR number per creature (null = no CR)
 * @param {'2024'|'2014'} rules
 */
export function difficulty(levels, crs, rules = '2024') {
  const total = crs.reduce((a, c) => a + xpForCr(c), 0);
  const n = crs.length;
  const lv = levels.map(clampLevel);
  if (rules === '2014') {
    const names = ['Easy', 'Medium', 'Hard', 'Deadly'];
    const th = names.map((_, i) => lv.reduce((a, l) => a + B2014[l][i], 0));
    const mult = n ? multiplier(n, lv.length) : 1;
    const adjusted = Math.round(total * mult);
    let label = 'Trivial';
    if (lv.length) names.forEach((nm, i) => { if (adjusted >= th[i]) label = nm; });
    return { rules, total, adjusted, mult, names, thresholds: th, label, count: n, party: lv.length };
  }
  const names = ['Low', 'Moderate', 'High'];
  const th = names.map((_, i) => lv.reduce((a, l) => a + B2024[l][i], 0));
  let label = 'Trivial';
  if (lv.length) names.forEach((nm, i) => { if (total >= th[i]) label = nm; });
  return { rules: '2024', total, adjusted: total, mult: 1, names, thresholds: th, label, count: n, party: lv.length };
}
