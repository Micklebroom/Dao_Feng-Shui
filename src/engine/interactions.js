/**
 * interactions.js — Поиск слияний, столкновений, наказаний, вреда, Ша, Тай Суй.
 * STATUS: VERIFIED (составы групп), детерминированный перебор.
 */

/** Утилита: все ветви набора столпов с ролями. */
function branchList(pillars, tables) {
  return pillars.map((p) => ({
    role: p.role,
    id: tables.branches.items[p.branch].id
  }));
}

function stemList(pillars, tables) {
  return pillars.map((p) => ({
    role: p.role,
    id: tables.stems.items[p.stem].id
  }));
}

/** Есть ли все нужные ID среди присутствующих (с учётом кратности). */
function containsAll(present, needed) {
  const pool = [...present];
  const used = [];
  for (const n of needed) {
    const i = pool.findIndex((x) => x.id === n);
    if (i === -1) return null;
    used.push(pool[i]);
    pool.splice(i, 1);
  }
  return used;
}

/**
 * Найти все взаимодействия в наборе столпов.
 * @param pillars [{stem,branch,role}]
 * @returns {stemCombinations, sixCombinations, threeHarmonies, directional, clashes, harms, punishments}
 */
export function findInteractions(pillars, tables) {
  const { interactions } = tables;
  const branches = branchList(pillars, tables);
  const stems = stemList(pillars, tables);

  const out = {
    stemCombinations: [], sixCombinations: [], threeHarmonies: [],
    directionalCombinations: [], clashes: [], harms: [], punishments: []
  };

  for (const c of interactions.stemCombinations.items) {
    const hit = containsAll(stems, c.stems);
    if (hit) out.stemCombinations.push({ ...c, roles: hit.map((h) => h.role) });
  }
  for (const c of interactions.sixCombinations.items) {
    const hit = containsAll(branches, c.branches);
    if (hit) out.sixCombinations.push({ ...c, roles: hit.map((h) => h.role) });
  }
  for (const c of interactions.threeHarmonies.items) {
    const hit = containsAll(branches, c.branches);
    if (hit) out.threeHarmonies.push({ ...c, roles: hit.map((h) => h.role) });
  }
  for (const c of interactions.directionalCombinations.items) {
    const hit = containsAll(branches, c.branches);
    if (hit) out.directionalCombinations.push({ ...c, roles: hit.map((h) => h.role) });
  }
  for (const c of interactions.clashes.items) {
    const hit = containsAll(branches, c.branches);
    if (hit) out.clashes.push({ ...c, roles: hit.map((h) => h.role) });
  }
  for (const c of interactions.harms.items) {
    const hit = containsAll(branches, c.branches);
    if (hit) out.harms.push({ ...c, roles: hit.map((h) => h.role) });
  }
  for (const c of interactions.punishments.items) {
    const hit = containsAll(branches, c.branches);
    if (hit) out.punishments.push({ ...c, roles: hit.map((h) => h.role) });
  }

  return out;
}

/** Плоский список всех найденных слияний, пригодный для applyCombinations. */
export function combinationsForTransform(found) {
  return [
    ...found.stemCombinations,
    ...found.sixCombinations,
    ...found.threeHarmonies,
    ...found.directionalCombinations
  ];
}

/** Три Ша и Тай Суй для года. */
export function yearAfflictions(yearBranchId, tables) {
  const { interactions, mountains24 } = tables;
  const sha = interactions.threeSha.items.find((s) => s.yearTriad.includes(yearBranchId));
  const taiSuiMountain = mountains24.items.find((m) => m.id === yearBranchId);
  let suiPo = null;
  if (taiSuiMountain) {
    const opp = (taiSuiMountain.index + 12) % 24;
    suiPo = mountains24.items[opp];
  }
  return {
    threeSha: sha ? { direction: sha.direction, branches: sha.shaBranches, ru: sha.ru } : null,
    taiSui: taiSuiMountain ? { code: taiSuiMountain.code, id: taiSuiMountain.id } : null,
    suiPo: suiPo ? { code: suiPo.code, id: suiPo.id } : null
  };
}

/** Число Гуа. */
export function computeGua(solarYear, gender, tables) {
  const { gua } = tables;
  let s = solarYear;
  while (s > 9) s = String(s).split('').reduce((a, d) => a + Number(d), 0);
  let g;
  if (gender === 'male') { g = 11 - s; if (g > 9) g -= 9; if (g === 5) g = 2; }
  else { g = s + 4; if (g > 9) g -= 9; if (g === 5) g = 8; }
  const group = gua.guaTypes.east.includes(g) ? 'east' : 'west';
  return { gua: g, group, directions: gua.directionsByGua[String(g)] };
}
