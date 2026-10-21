import { describe, it, expect } from 'vitest';
import { esaMatrix, magnetMatrix, designAchromat, coefficients, layout, traceIon, lateralAtFocus, slitOverlap, matMul, drift } from '../src/physics/optics.js';
import { icpIonFraction, expLawMeasured, betaFrom, expLawCorrect, ssbDelta } from '../src/physics/plasma.js';
import { hexapoleWellDepth, meanRetained, survival, coolingMC, cellPressure, numberDensity } from '../src/physics/cell.js';
import { requiredResolution, SYSTEMS, IE } from '../src/physics/isotopes.js';
import { johnsonCurrentNoise } from '../src/physics/noise.js';
import { zoomPlan, sapphireDesign } from '../src/instrument/build.js';

const deg = Math.PI / 180;

describe('Electrostatic analyser', () => {
  it('cylindrical ESA focuses a point object at φ = π/√2 (127.3°)', () => {
    const M = matMul(esaMatrix(0.35, Math.PI / Math.SQRT2), drift(0));
    expect(Math.abs(M[0][1])).toBeLessThan(1e-9);
  });
  it('equilibrium shift for an off-energy ion is a·δK/2 (r = 2K/qE)', () => {
    const M = esaMatrix(0.35, 1e3); // long sector averages to equilibrium only via formula: test the coefficient directly
    const a = 0.35, phi = 0.5;
    const E = esaMatrix(a, phi);
    const w = Math.SQRT2 / a, s = a * phi;
    expect(E[0][2]).toBeCloseTo((a / 2) * (1 - Math.cos(w * s)), 12);
    expect(M[3][3]).toBe(1);
  });
  it('magnet energy and mass dispersion are equal (both via δp = δ/2)', () => {
    const Mg = magnetMatrix(0.25, 70 * deg);
    expect(Mg[0][2]).toBeCloseTo(Mg[0][3], 12);
  });
});

describe('Double focusing (Nier–Johnson)', () => {
  const d = designAchromat({ L1: 0.35, a: 0.35, phiE: 90 * deg, R: 0.25, phiM: 70 * deg });
  it('solves an achromatic, angle-focusing design', () => {
    expect(d).not.toBeNull();
    const c = coefficients(d);
    expect(Math.abs(c.xa)).toBeLessThan(1e-9);
    expect(Math.abs(c.xK)).toBeLessThan(1e-9);
    expect(c.xm).toBeGreaterThan(0.1);
  });
  it('RK4 field trace reproduces the matrix design (angle, energy and mass terms)', () => {
    const L = layout(d);
    const lat = (o) => lateralAtFocus(L, traceIon(d, L, { ds: 0.0015, ...o }));
    const xa = (lat({ alpha: 0.001 }) - lat({ alpha: -0.001 })) / 0.002;
    const xK = (lat({ kappa: 1.001 }) - lat({ kappa: 0.999 })) / 0.002;
    const xm = (lat({ mu: 1.001 }) - lat({ mu: 0.999 })) / 0.002;
    expect(Math.abs(xa)).toBeLessThan(2e-3);
    expect(Math.abs(xK)).toBeLessThan(2e-3);
    expect(xm).toBeCloseTo(coefficients(d).xm, 2);
  });
  it('zoom plan puts isotopes on adjacent or alternate cups', () => {
    const p = zoomPlan(0.0057, 0.0025, [-1, 0, 1]);
    expect([1, 2]).toContain(p.s);
    expect(p.z).toBeGreaterThan(0.3);
    expect(sapphireDesign().D).toBeGreaterThan(0.1);
  });
});

describe('Plasma & mass bias', () => {
  it('Saha: low-IE elements fully ionised, Se/Hg partly, Ar barely', () => {
    expect(icpIonFraction(IE.K)).toBeGreaterThan(0.99);
    expect(icpIonFraction(IE.Se)).toBeLessThan(0.8);
    expect(icpIonFraction(IE.Ar)).toBeLessThan(0.01);
  });
  it('exponential law round-trips and SSB cancels a common bias', () => {
    const R = 0.0721, mi = 40.9618, mj = 38.9637;
    const Rm = expLawMeasured(R, mi, mj, 2.1);
    expect(betaFrom(Rm, R, mi, mj)).toBeCloseTo(2.1, 10);
    expect(expLawCorrect(Rm, mi, mj, 2.1)).toBeCloseTo(R, 12);
    const s = expLawMeasured(R * 1.0005, mi, mj, 2.1);
    expect(ssbDelta(s, Rm, Rm)).toBeCloseTo(0.5, 6);
  });
});

describe('Collision/reaction cell', () => {
  it('hexapole well depth scales as 1/m', () => {
    expect(hexapoleWellDepth({ mU: 40 }) / hexapoleWellDepth({ mU: 80 })).toBeCloseTo(2, 10);
  });
  it('collisions with light gas retain most energy; heavy gas removes more', () => {
    expect(meanRetained(40, 4)).toBeGreaterThan(meanRetained(40, 40));
    expect(meanRetained(40, 40)).toBeCloseTo(0.5, 10);
  });
  it('cooling thermalises ions at ~1 Pa He and attenuation is exponential', () => {
    const r = coolingMC({ P: 3, n: 200 });
    expect(r.meanE.at(-1)).toBeLessThan(r.meanE[0] / 5);
    const nd = numberDensity(cellPressure(4));
    expect(survival(6e-10, nd, 1e-4)).toBeCloseTo(Math.exp(-6e-16 * nd * 1e-4), 12);
  });
});

describe('Interferences & noise', () => {
  it('⁴⁰Ar⁺ on ⁴⁰Ca needs m/Δm > 10⁵; ⁴⁰ArH⁺ on ⁴¹K ≈ 4 900', () => {
    const Ca = SYSTEMS.Ca, K = SYSTEMS.K;
    expect(requiredResolution(Ca.isotopes[0].m, Ca.interferences[0].m)).toBeGreaterThan(1e5);
    expect(requiredResolution(K.isotopes[2].m, K.interferences[1].m)).toBeCloseTo(4889, -1);
  });
  it('Johnson noise of 10¹¹ Ω at 300 K, 1 s ≈ 2.9e-16 A', () => {
    expect(johnsonCurrentNoise(1e11, 300, 1)).toBeCloseTo(2.88e-16, 17);
  });
  it('flat-top: slit overlap ≈ 1 near the centre when beam < slit', () => {
    expect(slitOverlap(0, 0.1e-3, 0.8e-3)).toBeGreaterThan(0.999);
  });
});

import { analyseZones, fitZoomSteer, UPB } from '../src/physics/zones.js';

describe('U–Pb split zones', () => {
  const { d, L } = sapphireDesign();
  const nat = (m) => lateralAtFocus(L, traceIon(d, L, { mu: m / 220, ds: 0.002 }));
  const r = analyseZones(nat, { pitch: 2.5e-3, mRef: 220, wb: 0.25e-3, wc: 1e-3 });
  it('least-squares zoom/steer fit recovers an exact linear map', () => {
    const f = fitZoomSteer([0, 1, 2, 3], [0.5, 2.5, 4.5, 6.5]);
    expect(f.z).toBeCloseTo(2, 12);
    expect(f.s).toBeCloseTo(0.5, 12);
  });
  it('1 u spacing at Pb is ~15–20 % wider than at U (D/m scaling)', () => {
    const pb = Math.abs(nat(207) - nat(206)), u = Math.abs(nat(238) - nat(237));
    expect(pb / u).toBeGreaterThan(1.12);
    expect(pb / u).toBeLessThan(1.22);
  });
  it('a single zoom cannot centre Pb and U together; independent zones can', () => {
    expect(r.worstLinked).toBeGreaterThan(0.4e-3); // beams far outside the 0.375 mm flat-top half-width
    expect(r.minFLinked).toBeLessThan(0.5);
    expect(r.worstSplit).toBeLessThan(0.08e-3);
    expect(r.minFSplit).toBeGreaterThan(0.999);
    expect(r.fitH.z / r.fitL.z).toBeGreaterThan(1.1);
    expect(UPB.low.length + UPB.high.length).toBe(8);
  });
});
