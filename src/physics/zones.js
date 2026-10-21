// Split low-/high-mass collector zones for U–Pb (static Pb + U multicollection).
//
// The magnet's lateral image position is set by momentum: x(m) ≈ D·(m − m_a)/(2·m_a)·2
// → per mass unit the spacing scales as D/m. Across the U–Pb span (²⁰²Hg … ²³⁸U, ~36 u
// around m ≈ 220) the spacing of 1 u changes by ~17 %. A collector array built with a
// uniform mechanical pitch per mass unit therefore cannot have *both* the Pb group and
// the U group centred by a single dispersion (zoom) + steering setting; the best compromise
// leaves the outer beams off-centre. If the low-mass and high-mass zones have their own
// zoom/steering (user/lab-reported capability of the Nu Sapphire — confirm with Nu
// documentation), each zone is fitted separately and every beam is centred: Pb and U are
// collected statically and simultaneously, with no peak hopping.
//
// x positions here are lateral offsets (m) at the image plane relative to the axial beam.

import { slitOverlap } from './optics.js';

export const UPB = {
  low: [
    { name: '²⁰²Hg', m: 201.97064, det: 'IC', role: 'Hg monitor for ²⁰⁴Hg subtraction' },
    { name: '²⁰⁴Pb', m: 203.97304, det: 'IC', role: '²⁰⁴Pb + ²⁰⁴Hg (common-Pb monitor)' },
    { name: '²⁰⁶Pb', m: 205.97447, det: 'IC/F', role: 'radiogenic ²⁰⁶Pb' },
    { name: '²⁰⁷Pb', m: 206.97590, det: 'IC', role: 'radiogenic ²⁰⁷Pb (small in young zircon)' },
    { name: '²⁰⁸Pb', m: 207.97665, det: 'IC', role: '²⁰⁸Pb (common / Th-derived)' },
  ],
  high: [
    { name: '²³²Th', m: 232.03806, det: 'F', role: 'Th for ²⁰⁸Pb/²³²Th and Th/U' },
    { name: '²³⁵U', m: 235.04393, det: 'F', role: '²³⁵U (or calculated from ²³⁸U/137.818)' },
    { name: '²³⁸U', m: 238.05079, det: 'F', role: '²³⁸U (Faraday, or IC for low-U grains)' },
  ],
};

/** Least-squares fit of beam = z·x + s onto cup positions c. */
export function fitZoomSteer(x, c) {
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n, mc = c.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, sxc = 0;
  for (let i = 0; i < n; i++) { sxx += (x[i] - mx) ** 2; sxc += (x[i] - mx) * (c[i] - mc); }
  const z = sxx > 0 ? sxc / sxx : 1;
  return { z, s: mc - z * mx };
}

/**
 * @param {(m:number)=>number} natural traced lateral position (m) for mass m with the reference axial mass
 * @param {object} o {pitch: mechanical pitch per u (m), mRef: mass at array centre, wb, wc}
 * @returns per-mode residuals and signal fractions
 */
export function analyseZones(natural, { pitch = 2.5e-3, mRef = 220, wb = 0.25e-3, wc = 1.0e-3, linked = null, low = null, high = null } = {}) {
  const all = [...UPB.low.map((i) => ({ ...i, zone: 'low' })), ...UPB.high.map((i) => ({ ...i, zone: 'high' }))];
  for (const b of all) { b.x = natural(b.m); b.cup = pitch * (b.m - mRef); } // uniform mechanical pitch per u (model)
  const fitAll = fitZoomSteer(all.map((b) => b.x), all.map((b) => b.cup));
  const L = all.filter((b) => b.zone === 'low'), H = all.filter((b) => b.zone === 'high');
  const fitL = fitZoomSteer(L.map((b) => b.x), L.map((b) => b.cup));
  const fitH = fitZoomSteer(H.map((b) => b.x), H.map((b) => b.cup));
  const useLinked = linked ?? fitAll;
  const useL = low ?? fitL, useH = high ?? fitH;
  for (const b of all) {
    b.dLinked = useLinked.z * b.x + useLinked.s - b.cup;
    const f = b.zone === 'low' ? useL : useH;
    b.dSplit = f.z * b.x + f.s - b.cup;
    b.fLinked = slitOverlap(b.dLinked, wb, wc);
    b.fSplit = slitOverlap(b.dSplit, wb, wc);
  }
  const worst = (k) => Math.max(...all.map((b) => Math.abs(b[k])));
  return { beams: all, fitAll, fitL, fitH, worstLinked: worst('dLinked'), worstSplit: worst('dSplit'),
    minFLinked: Math.min(...all.map((b) => b.fLinked)), minFSplit: Math.min(...all.map((b) => b.fSplit)) };
}

/** Peak-coincidence scan: signal of each beam vs a common steering offset δ (m). */
export function zoneScan(beams, key, { wb, wc, span = 1.5e-3, n = 161 }) {
  const xs = Array.from({ length: n }, (_, i) => -span + (2 * span * i) / (n - 1));
  return beams.map((b) => ({ name: b.name, zone: b.zone, x: xs, y: xs.map((d) => slitOverlap(b[key] + d, wb, wc)) }));
}
