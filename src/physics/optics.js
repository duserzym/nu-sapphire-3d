// Double-focusing (Nier–Johnson) ion optics: cylindrical electrostatic analyser (ESA)
// followed by a homogeneous magnetic sector, both bending the beam the same way.
//
// Why two sectors? Ions leaving an ICP have a kinetic-energy spread of several eV
// (plasma potential, expansion), i.e. ΔK/K ~ 10⁻³ at 6 kV. A magnet alone disperses by
// momentum, so this energy spread smears every mass peak. The ESA disperses by energy
// only (r = 2K/(qE) — no mass dependence); with the right drift lengths its energy
// dispersion is cancelled by the magnet's, leaving a focus that is achromatic (energy
// independent) yet still mass dispersive.
//
// First-order transfer matrices act on (x, x′, δK, δm) with x the radial displacement
// (positive = away from the centre of curvature), δK = ΔK/K, δm = Δm/m.
//   drift L:        x ← x + L·x′
//   ESA (a, φ):     x″ + (2/a²)·x = δK/a           (cylindrical field E ∝ 1/r)
//   magnet (R, φ):  x″ + (1/R²)·x = δp/R, δp = (δK + δm)/2
// A numerical RK4 tracer through explicit fields checks the matrix design.

const I4 = () => [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
export function matMul(A, B) {
  const C = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += A[i][k] * B[k][j]; C[i][j] = s; }
  return C;
}
export const drift = (L) => { const M = I4(); M[0][1] = L; return M; };

/** Generic sector: x″ + ω²x = (cK·δK + cM·δm)/ρ, path length s = ρφ. */
function sectorMatrix(rho, phi, omega, cK, cM) {
  const s = rho * phi, c = Math.cos(omega * s), sn = Math.sin(omega * s);
  const eq = 1 / (rho * omega * omega); // equilibrium displacement per unit source term
  return [
    [c, sn / omega, cK * eq * (1 - c), cM * eq * (1 - c)],
    [-omega * sn, c, cK * eq * omega * sn, cM * eq * omega * sn],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];
}
/** Cylindrical ESA of radius a, angle φ: ω = √2/a, energy term only. */
export const esaMatrix = (a, phi) => sectorMatrix(a, phi, Math.SQRT2 / a, 1, 0);
/** Homogeneous magnet of radius R, angle φ (normal entry): ω = 1/R, δp = (δK+δm)/2. */
export const magnetMatrix = (R, phi) => sectorMatrix(R, phi, 1 / R, 0.5, 0.5);

/** Total matrix for source → L1 → ESA → L2 → magnet → L3. */
export function systemMatrix({ L1, a, phiE, L2, R, phiM, L3 }) {
  let M = drift(L1);
  M = matMul(esaMatrix(a, phiE), M);
  M = matMul(drift(L2), M);
  M = matMul(magnetMatrix(R, phiM), M);
  M = matMul(drift(L3), M);
  return M;
}

/**
 * Solve the inter-sector drift L2 and image distance L3 so that the final focus is
 * angle-focusing ((x|x′) = 0) and energy-focusing ((x|δK) = 0). Returns null if none.
 */
export function designAchromat({ L1, a, phiE, R, phiM, L2min = 0.02, L2max = 2.0 }) {
  const partial = (L2) => {
    let M = drift(L1);
    M = matMul(esaMatrix(a, phiE), M);
    M = matMul(drift(L2), M);
    M = matMul(magnetMatrix(R, phiM), M);
    const L3 = -M[0][1] / M[1][1];
    const E = M[0][2] + L3 * M[1][2];
    return { L3, E };
  };
  const N = 400;
  let prev = null;
  for (let i = 0; i <= N; i++) {
    const L2 = L2min + ((L2max - L2min) * i) / N;
    const p = partial(L2);
    if (prev && p.L3 > 0 && prev.p.L3 > 0 && Math.sign(p.E) !== Math.sign(prev.p.E)) {
      let lo = prev.L2, hi = L2, flo = prev.p.E;
      for (let k = 0; k < 80; k++) {
        const mid = 0.5 * (lo + hi), fm = partial(mid).E;
        if (Math.sign(fm) === Math.sign(flo)) { lo = mid; flo = fm; } else hi = mid;
      }
      const L2s = 0.5 * (lo + hi);
      return { L1, a, phiE, L2: L2s, R, phiM, L3: partial(L2s).L3 };
    }
    prev = { L2, p };
  }
  return null;
}

/** Key first-order coefficients of a design. */
export function coefficients(d) {
  const M = systemMatrix(d);
  return { xx: M[0][0], xa: M[0][1], xK: M[0][2], xm: M[0][3], M };
}

// ---------------------------------------------------------------------------
// Geometry & numerical tracing in the bending plane (2-D, metres).
// Convention (as tims-3d sector.js): the beam starts along +x and bends counter-clockwise.

const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const mul = (a, s) => [a[0] * s, a[1] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const len = (a) => Math.hypot(a[0], a[1]);
const rotCCW = (d, th) => [d[0] * Math.cos(th) - d[1] * Math.sin(th), d[0] * Math.sin(th) + d[1] * Math.cos(th)];
const left = (d) => [-d[1], d[0]];
export const v2 = { add, sub, mul, dot, len, rotCCW, left };

/** Lay out the design in 2-D: object slit at (−L1, 0) travelling +x. */
export function layout(d, { esaGap = 0.02, poleHalf = null } = {}) {
  const S = [-d.L1, 0];
  const E1 = [0, 0], dE1 = [1, 0];
  const Ce = add(E1, mul(left(dE1), d.a));
  const dE2 = rotCCW(dE1, d.phiE);
  const E2 = add(Ce, mul(rotCCW(sub(E1, Ce), d.phiE), 1));
  const M1 = add(E2, mul(dE2, d.L2));
  const Cm = add(M1, mul(left(dE2), d.R));
  const dM2 = rotCCW(dE2, d.phiM);
  const M2 = add(Cm, rotCCW(sub(M1, Cm), d.phiM));
  const F = add(M2, mul(dM2, d.L3));
  return { S, E1, dE1, Ce, E2, dE2, M1, Cm, M2, dM2, F, esaGap, poleHalf: poleHalf ?? 0.25 * d.R };
}

function inWedge(p, C, Pin, din, Pout, dout, rIn, rOut) {
  if (dot(sub(p, Pin), din) < 0) return false;
  if (dot(sub(p, Pout), dout) > 0) return false;
  const r = len(sub(p, C));
  return r > rIn && r < rOut;
}

/**
 * RK4 trace of one ion through ESA + magnet with explicit fields.
 * Units: reference ion speed 1; ion speed √(κ/μ) where κ = K/K0, μ = m/m0.
 *  ESA:   |a| = 1/(μ r) towards Ce        (E ∝ 1/r, ref ion circles at r = a)
 *  magnet: a = (1/(μR))·(−vy, vx)         (ref ion circles at R)
 * @returns {{pts:number[][], end:number[], dir:number[], lost:boolean}}
 */
export function traceIon(d, L, { alpha = 0, y0 = 0, kappa = 1, mu = 1, after = 0.05, ds = 0.001, maxLen = 6 } = {}) {
  let p = add(L.S, [0, y0]);
  const sp = Math.sqrt(kappa / mu);
  let v = mul([Math.cos(alpha), Math.sin(alpha)], sp);
  const pts = [p];
  const g = L.esaGap / 2;
  const region = (q) => {
    if (inWedge(q, L.Ce, L.E1, L.dE1, L.E2, L.dE2, d.a - g * 4, d.a + g * 4)) return 1;
    if (inWedge(q, L.Cm, L.M1, L.dE2, L.M2, L.dM2, d.R - L.poleHalf, d.R + L.poleHalf)) return 2;
    return 0;
  };
  const accel = (reg, q, vv) => {
    if (reg === 1) { const rv = sub(q, L.Ce), r = len(rv); return mul(rv, -1 / (mu * r * r)); }
    if (reg === 2) { const k = 1 / (mu * d.R); return [-vv[1] * k, vv[0] * k]; }
    return [0, 0];
  };
  const rk = (reg, p0, v0, h) => {
    const a1 = accel(reg, p0, v0);
    const p2 = add(p0, mul(v0, h / 2)), v2_ = add(v0, mul(a1, h / 2));
    const a2 = accel(reg, p2, v2_);
    const p3 = add(p0, mul(v2_, h / 2)), v3 = add(v0, mul(a2, h / 2));
    const a3 = accel(reg, p3, v3);
    const v4 = add(v0, mul(a3, h));
    const a4 = accel(reg, add(p0, mul(v3, h)), v4);
    return [add(p0, mul(add(add(v0, mul(v2_, 2)), add(mul(v3, 2), v4)), h / 6)), add(v0, mul(add(add(a1, mul(a2, 2)), add(mul(a3, 2), a4)), h / 6))];
  };
  // Sharp-boundary ESA: plates biased so the central radius is at ground,
  // φ(r) = +(2K0/q)·ln(r/a) (outer plate positive). An ion crossing the field boundary
  // off-axis loses kinetic energy ΔK/K0 = 2·ln(r/a) on entry (and regains it on exit).
  const kick = (q, sign) => {
    const r = len(sub(q, L.Ce)), vv = len(v);
    const Krel = mu * vv * vv;
    const Knew = Krel - sign * 2 * Math.log(r / d.a);
    v = mul(v, Math.sqrt(Math.max(Knew, 1e-9) / Krel));
  };
  const dt = ds / sp;
  let s = 0, lost = false, k = 0, reg = region(p);
  while (s < maxLen) {
    let [pn, vn] = rk(reg, p, v, dt);
    const rn = region(pn);
    if (rn !== reg) {
      // bisect for the boundary crossing so field edges are hit exactly
      let lo = 0, hi = dt;
      for (let it = 0; it < 40; it++) {
        const mid = 0.5 * (lo + hi);
        const [pm] = rk(reg, p, v, mid);
        if (region(pm) === reg) lo = mid; else hi = mid;
      }
      [pn, vn] = rk(reg, p, v, hi);
      p = pn; v = vn;
      const newReg = region(p);
      if (reg === 1) kick(p, -1);
      if (newReg === 1) kick(p, +1);
      reg = newReg;
      pts.push(p);
      s += ds * (hi / dt);
    } else { p = pn; v = vn; s += ds; }
    if (++k % 4 === 0) pts.push(p);
    if (reg === 1) {
      const re = len(sub(p, L.Ce));
      if (re < d.a - g || re > d.a + g) { lost = true; break; }
    }
    if (dot(sub(p, L.M2), L.dM2) > d.L3 + after) break;
  }
  pts.push(p);
  return { pts, end: p, dir: mul(v, 1 / len(v)), lost };
}

/** Lateral position of a ray on the final focal plane (perpendicular to the axis at F). */
export function lateralAtFocus(L, ray) {
  const n = [L.dM2[1], -L.dM2[0]]; // outward (high-mass side) normal
  // intersect the ray's last straight segment with the plane through F ⟂ dM2
  const t = dot(sub(L.F, ray.end), L.dM2) / dot(ray.dir, L.dM2);
  const q = add(ray.end, mul(ray.dir, t));
  return dot(sub(q, L.F), n);
}

/**
 * Peak shape for a beam of image width wb (FWHM, Gaussian) swept across a collector
 * slit of width wc: flat-topped when wc > wb. Resolving power (10 % valley/edge
 * definitions) for a given mass dispersion D (m per unit δm).
 */
export function resolvingPower({ D, wb, wc, def = 'edge' }) {
  // edge (5–95 %) resolving power used in MC-ICP-MS: m/Δm = D / (width of the 5–95 % edge)
  const sigma = wb / 2.3548;
  if (def === 'edge') return D / (2 * 1.645 * sigma);
  // conventional 10 % valley: peaks separated by (wb + wc)
  return D / (wb + wc);
}

// ---------------------------------------------------------------------------
// Peak shapes on a collector slit.
function erf(x) {
  const s = Math.sign(x); x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
}
const Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));

/** Fraction of a Gaussian beam (FWHM wb, centred δ from the slit centre) passing a slit of width wc. */
export function slitOverlap(delta, wb, wc) {
  const sg = Math.max(1e-9, wb / 2.3548);
  return Phi((wc / 2 - delta) / sg) - Phi((-wc / 2 - delta) / sg);
}

/**
 * Magnet-scan peak: total signal vs scan displacement s for several beams
 * {x (lateral, m), I (relative), wb (FWHM, m)} on a slit of width wc.
 */
export function peakScan(beams, wc, { span = 3e-3, n = 241 } = {}) {
  const xs = [], ys = [], parts = beams.map(() => []);
  for (let i = 0; i < n; i++) {
    const s = -span + (2 * span * i) / (n - 1);
    xs.push(s);
    let tot = 0;
    beams.forEach((b, j) => { const v = b.I * slitOverlap(b.x + s, b.wb, wc); parts[j].push(v); tot += v; });
    ys.push(tot);
  }
  return { xs, ys, parts };
}

/** Image width (FWHM, m) from object slit, magnification and energy spread. */
export function imageWidth({ slit, mag, xK, dKrel, aberr = 0 }) {
  return Math.hypot(slit * Math.abs(mag), 2.3548 * Math.abs(xK) * dKrel / 2.3548, aberr);
}
