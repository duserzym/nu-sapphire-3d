// Hexapole collision/reaction cell (CRC) physics.
//
// RF confinement: a multipole of order n (hexapole n = 3) with RF amplitude V at angular
// frequency Ω and inscribed radius r₀ creates an effective (pseudo-)potential
//   V*(r) = n² q V² / (4 m Ω² r₀²) · (r/r₀)^{2n−2}
// (Gerlich 1992). For a hexapole V* ∝ r⁴: a flat-bottomed well that holds a broad
// m/z range — ideal for collisional cooling.
//
// Collisional damping: in an elastic collision with a gas atom of mass M at rest, an ion
// of mass m keeps on average a fraction ⟨E′/E⟩ = (m² + M²)/(m + M)² of its energy
// (isotropic CM scattering). Ions entering at tens of eV therefore thermalise after a
// few collisions with He/H₂; the beam's energy spread collapses (why the Sapphire
// decelerates ions into a low-energy path and re-accelerates them afterwards).
//
// Reactions: an interfering ion that reacts with rate coefficient k (cm³ s⁻¹) in gas of
// number density n for residence time t survives with probability exp(−k·n·t).
// Rate coefficients below are representative literature values (Anicich 1993
// compilation); those marked illustrative are placeholders for the teaching model.

import { K_B, AMU, E_CHARGE } from './constants.js';
import { RNG } from './rng.js';

export function hexapoleWellDepth({ V = 100, freqMHz = 5.0, r0 = 0.004, mU = 40, n = 3 }) {
  const q = E_CHARGE, m = mU * AMU, W = 2 * Math.PI * freqMHz * 1e6;
  // depth at r = r0 in volts
  return (n * n * q * V * V) / (4 * m * W * W * r0 * r0);
}
export function pseudoPotential(r, opts) {
  const n = opts.n ?? 3, r0 = opts.r0 ?? 0.004;
  return hexapoleWellDepth(opts) * Math.pow(Math.min(1, Math.abs(r) / r0), 2 * n - 2);
}

/** Mean fractional energy retained per elastic collision (isotropic in the CM frame). */
export const meanRetained = (m, M) => (m * m + M * M) / ((m + M) ** 2);

/** Gas number density (m⁻³) from pressure (Pa) and temperature (K). */
export const numberDensity = (P, T = 300) => P / (K_B * T);

/** Cell pressure (Pa) from a gas flow in mL/min (sccm) and an effective exit conductance (L/s). Illustrative. */
export function cellPressure(flowSccm, conductanceLps = 8) {
  const Q = flowSccm * 1.689e-3; // Pa·m³/s per sccm
  return Q / (conductanceLps * 1e-3);
}

/**
 * Monte-Carlo collisional cooling along the cell axis.
 * @returns {{x:number[], meanE:number[], sdE:number[], exitE:number[], collisions:number}}
 */
export function coolingMC({ mIon = 40, mGas = 4, E0 = 20, dE0 = 3, P = 1.0, sigma = 4e-19, L = 0.15, Tgas = 300, n = 600, bins = 30, seed = 1 }) {
  const rng = new RNG(seed);
  const nd = numberDensity(P, Tgas);
  const mfp = 1 / (nd * sigma);
  const kT = (K_B * Tgas) / E_CHARGE; // eV
  const floor = 1.5 * kT;
  const xs = Array.from({ length: bins + 1 }, (_, i) => (L * i) / bins);
  const sums = new Array(bins + 1).fill(0), sq = new Array(bins + 1).fill(0);
  const exitE = [];
  let totalColl = 0;
  for (let i = 0; i < n; i++) {
    let E = Math.max(0.1, rng.normal(E0, dE0));
    let x = 0, b = 0;
    while (x < L) {
      const step = rng.exponential(mfp);
      // record energy at bin boundaries crossed
      while (b <= bins && xs[b] <= x + step) { sums[b] += E; sq[b] += E * E; b++; }
      x += step;
      if (x >= L) break;
      // elastic collision, isotropic CM angle; gas thermal motion keeps E ≥ thermal floor
      const cos = 2 * rng.u() - 1;
      const f = (mIon * mIon + mGas * mGas + 2 * mIon * mGas * cos) / ((mIon + mGas) ** 2);
      E = floor + (E - floor) * f + rng.normal(0, 0.15 * kT);
      E = Math.max(0.2 * kT, E);
      totalColl++;
    }
    while (b <= bins) { sums[b] += E; sq[b] += E * E; b++; }
    exitE.push(E);
  }
  const meanE = sums.map((s) => s / n);
  const sdE = sq.map((s, i) => Math.sqrt(Math.max(0, s / n - meanE[i] ** 2)));
  return { x: xs, meanE, sdE, exitE, collisions: totalColl / n, mfp };
}

/** Rate coefficients (cm³ s⁻¹) for reactions with H₂ used in the teaching model. */
export const REACTIONS = {
  Ar: { label: 'Ar⁺ + H₂ → ArH⁺ + H', k: 8.9e-10, src: 'Anicich (1993) compilation', illustrative: false },
  ArH: { label: 'ArH⁺ + H₂ → H₃⁺ + Ar', k: 6.3e-10, src: 'Anicich (1993) compilation (approx.)', illustrative: false },
  Ar2: { label: 'Ar₂⁺ + H₂ → products', k: 4e-10, src: 'illustrative', illustrative: true },
  ArX: { label: 'ArO⁺/ArN⁺ + H₂ → products', k: 3e-10, src: 'illustrative', illustrative: true },
  analyte: { label: 'K⁺, Ca⁺, Fe⁺, Se⁺ + H₂', k: 1e-13, src: 'endothermic / very slow (illustrative upper bound)', illustrative: true },
};

/** Surviving fraction exp(−k n t); k in cm³/s, n in m⁻³, t in s. */
export const survival = (k, nd, t) => Math.exp(-k * 1e-6 * nd * t);

/** Residence time of a (thermalised) ion of mass m in a cell of length L with axial drift energy Eax (eV). */
export function residenceTime(mU, L = 0.15, Eax = 1.0) {
  const v = Math.sqrt((2 * Eax * E_CHARGE) / (mU * AMU));
  return L / v;
}
