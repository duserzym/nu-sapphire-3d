// ICP ionization and instrumental mass bias.
//
// Saha equation in the plasma (local thermodynamic equilibrium approximation):
//   n⁺·n_e / n⁰ = 2·(Z⁺/Z⁰)·(2π m_e k T / h²)^{3/2} · exp(−IE / kT)
// With T ≈ 7500 K and n_e ≈ 10¹⁵ cm⁻³ (typical Ar ICP), elements with IE < ~8 eV are
// > 90 % ionised; Zn, As, Se, Hg (IE > 9 eV) are only partly ionised — one reason their
// sensitivities are low. Partition-function ratios are set to 1 (first-order).
//
// Instrumental mass bias in MC-ICP-MS (light isotopes discriminated, mostly by space
// charge in the interface/extraction region) follows approximately the exponential law
//   R_meas = R_true · (m_i / m_j)^β     (β ≈ 1.5–2.5 is typical; illustrative default 2)
// and is corrected by internal normalisation (a known ratio) or by standard–sample
// bracketing (SSB).

import { K_B_EV } from './constants.js';

const SAHA_CONST = 2.4147e21; // (2π m_e k / h²)^{3/2} in m⁻³ K^{-3/2}

/** Fraction of an element present as singly charged ions in the ICP. */
export function icpIonFraction(IE, { T = 7500, ne = 1e21, zRatio = 1 } = {}) {
  const S = (2 * zRatio * SAHA_CONST * Math.pow(T, 1.5) * Math.exp(-IE / (K_B_EV * T))) / ne;
  return S / (1 + S);
}

/** Exponential-law fractionation: measured ratio from true ratio. */
export const expLawMeasured = (Rtrue, mi, mj, beta) => Rtrue * Math.pow(mi / mj, beta);
/** β from a measured vs true reference ratio of masses m1/m2. */
export const betaFrom = (Rmeas, Rtrue, m1, m2) => Math.log(Rmeas / Rtrue) / Math.log(m1 / m2);
/** Correct a ratio with a known β. */
export const expLawCorrect = (Rmeas, mi, mj, beta) => Rmeas * Math.pow(mi / mj, -beta);

/** δ-value (‰) by standard–sample bracketing. */
export const ssbDelta = (Rsample, RstdBefore, RstdAfter) => (Rsample / (0.5 * (RstdBefore + RstdAfter)) - 1) * 1000;

/**
 * Illustrative space-charge transmission model: relative transmission ∝ m^s, with s
 * chosen so the implied exponential-law β is reproduced (s ≈ β for a ratio of
 * neighbouring masses). Returns per-amu bias in % at mass m.
 */
export const biasPerAmuPercent = (m, beta) => (beta / m) * 100;
