// Multicollection: fixed Faraday array + zoom, amplifier noise, mass-bias correction,
// interference correction.
import * as THREE from 'three';
import { Exploder } from '../core/explode.js';
import { Chart } from '../core/chart.js';
import { IonBeam } from '../core/beam.js';
import { ISOTOPE_COLORS } from '../core/materials.js';
import { buildFaradayLite, buildFaradayCup, buildIonCounterLite } from '../components/faraday.js';
import { registerParts } from '../components/parts.js';
import { AMPLIFIERS, johnsonCurrentNoise, shotCurrentNoise } from '../physics/noise.js';
import { expLawMeasured, expLawCorrect, betaFrom, ssbDelta } from '../physics/plasma.js';
import { SYSTEMS } from '../physics/isotopes.js';
import { sapphireDesign, zoomPlan } from '../instrument/build.js';
import { traceIon, lateralAtFocus } from '../physics/optics.js';
import { SOURCES } from '../instrument/specs.js';
import { RNG } from '../physics/rng.js';
import { section, segmented, slider, readouts, note, para, table, sources, debounce, h } from '../core/ui.js';

export default {
  id: 'multicollector',
  title: 'Multicollection & mass bias',
  group: 'Measurement',
  icon: '⫼',
  blurb: '16 fixed Faradays + zoom, amplifier noise, exponential law, SSB, interference corrections',
  async create(ctx) {
    const { app } = ctx;
    const root = new THREE.Group();
    const ex = new Exploder();
    const { d, L } = sapphireDesign();
    const pitch = 0.0025, nC = 16;
    const st = { sys: 'Sr', amp: 'R11', beta: 2.0, drift: 0.3, rb: 0.002 };

    // 3-D: array (enlarged ×4 for legibility) with one full-detail cup exploded out
    const S = 4;
    const arr = new THREE.Group();
    arr.scale.setScalar(S);
    root.add(arr);
    for (let i = 0; i < nC; i++) {
      const k = i - nC / 2;
      const c = buildFaradayLite({ width: pitch * 0.8, height: 0.018, depth: 0.028 });
      c.group.position.set(k * pitch, 0.05, 0);
      arr.add(c.group);
      ex.add(c.group, [k * pitch * 1.4, 0.004 * Math.abs(k), 0], { name: `Faraday ${k === 0 ? 'Ax' : k < 0 ? 'L' + -k : 'H' + k}`, info: 'Fixed-position Faraday cup (2.5 mm spacing).', order: 0.3 });
    }
    for (let j = 0; j < 3; j++) {
      const ic = buildIonCounterLite({ width: 0.007, height: 0.018, depth: 0.03 });
      ic.group.position.set(-(nC / 2 + 2 + j * 3) * pitch, 0.05, 0.01);
      arr.add(ic.group);
      ex.add(ic.group, [-0.01, 0.01, 0], { name: `Ion counter IC${j + 1}`, info: 'SEM or Daly behind an energy filter for small beams.', order: 0.4 });
    }
    const full = buildFaradayCup({ detail: 'full', resistorId: 'R11' });
    full.group.position.set(0.16, 0.05 * S, 0.02);
    root.add(full.group);
    registerParts(ex, full.parts, { orderScale: 0.7, scale: 1.2 });
    ctx.label(full.group, 'One cup in detail', { sub: 'slit · suppressor · graphite bucket · amplifier', offset: [0, 0.05, 0] });
    const beamG = new THREE.Group();
    root.add(beamG);

    // ---- panel ----
    const intro = section('Static multicollection', { icon: '⫼' });
    intro.body.append(para('All isotopes are measured <b>simultaneously</b> on separate Faraday cups, so plasma flicker cancels in the ratios — the reason MC-ICP-MS reaches ppm-level precision. The Sapphire array is <b>fixed</b> (16 Faradays); Zoom Optics stretch or shrink the dispersion so each element’s isotopes land in cups.'));
    const sysSeg = segmented({ options: Object.keys(SYSTEMS).map((k) => ({ value: k, label: k })), value: st.sys, onChange: (v) => { st.sys = v; beamsFor(); upd(); } });
    const roZ = readouts([{ id: 'z', label: 'Zoom factor' }, { id: 's', label: 'Cups per u' }]);
    intro.body.append(sysSeg.el, roZ.el);

    const noise = section('Amplifier noise & precision', { icon: '≈' });
    const ampSeg = segmented({ options: ['R10', 'R11', 'R12', 'R13'].map((id) => ({ value: id, label: AMPLIFIERS.find((a) => a.id === id).label.replace(' resistor', '') })), value: st.amp, onChange: (v) => { st.amp = v; upd(); } });
    const tS = slider({ label: 'Integration time', min: 0.1, max: 20, value: 4, log: true, unit: 's', onInput: () => upd() });
    noise.body.append(ampSeg.el, tS.el);
    const chN = new Chart(noise.body, { height: 170, xLabel: 'ion current (A)', yLabel: 'relative 1σ (ppm)', xLog: true, yLog: true, legendPos: 'tr' });
    noise.body.append(note('Johnson–Nyquist noise √(2kT/(Rt)) vs counting noise √(eI/t): low-intensity beams (²³⁴U, ⁴⁰K, ⁴⁶Ca) need 10¹² or 10¹³ Ω; intense beams (³⁹K at ~50 V) need 10¹⁰ Ω to stay below the amplifier limit. Same physics as the TIMS project.'));

    const mb = section('Mass bias: exponential law & bracketing', { icon: '⚖' });
    const bS = slider({ label: 'Instrumental β (exponential law)', min: 0.5, max: 3, step: 0.05, value: st.beta, onInput: (v) => { st.beta = v; upd(); } });
    const dS = slider({ label: 'β drift over the session', min: 0, max: 1, step: 0.02, value: st.drift, onInput: (v) => { st.drift = v; upd(); } });
    const rbS = slider({ label: '⁸⁷Rb/⁸⁶Sr in the sample (for Sr)', min: 0, max: 0.01, step: 0.0002, value: st.rb, fmt: (v) => v.toFixed(4), onInput: (v) => { st.rb = v; upd(); } });
    mb.body.append(bS.el, dS.el, rbS.el);
    const chB = new Chart(mb.body, { height: 180, title: 'Sequence of standards (S) and samples (X)', xLabel: 'run #', yLabel: 'δ (‰) or ratio offset', legendPos: 'tl' });
    const tbl = h('div');
    mb.body.append(tbl, note('Exponential law: R<sub>meas</sub> = R<sub>true</sub>(m<sub>i</sub>/m<sub>j</sub>)<sup>β</sup>. Sr: β from ⁸⁶Sr/⁸⁸Sr = 0.1194 (internal normalisation) after subtracting ⁸⁷Rb = 0.3857·⁸⁵Rb. Stable isotopes (K, Ca, Fe): no invariant ratio, so standard–sample bracketing (δ relative to the mean of the bracketing standards) cancels the drifting bias.'));
    const src = section('Sources', { icon: '☰', open: false });
    src.body.append(sources([SOURCES.sapphire, SOURCES.plasma3, SOURCES.belshaw, SOURCES.harvard]), para('<span class="src">Russell, Papanastassiou & Tombrello (1978) GCA 42:1075 (exponential law).</span>'));

    function beamsFor() {
      for (const c of [...beamG.children]) { beamG.remove(c); c.traverse((q) => { if (q.isCSS2DObject) q.element.remove(); }); c.dispose?.(); }
      const sys = SYSTEMS[st.sys];
      const ref = sys.isotopes.reduce((a, b) => (b.ab > a.ab ? b : a));
      const offs = sys.isotopes.map((I) => Math.round(I.m - ref.m));
      const ma = ref.m + (Math.max(...offs) + Math.min(...offs)) / 2;
      const nat = (m) => lateralAtFocus(L, traceIon(d, L, { mu: m / ma, ds: 0.003 }));
      const n0 = nat(ma);
      const np = Math.abs(nat(ma + 1) - n0);
      const plan = zoomPlan(np, pitch, sys.isotopes.map((I) => I.m - ma));
      roZ.z.set(plan.z.toFixed(3)); roZ.s.set(plan.s === 1 ? 'adjacent cups' : `every ${plan.s}nd cup`);
      const tot = sys.isotopes.reduce((a, b) => a + b.ab, 0);
      sys.isotopes.forEach((I, i) => {
        const x = (nat(I.m) - n0) * plan.z * S;
        const ab = I.ab / tot;
        const b = new IonBeam([new THREE.Vector3(x * 0.15, 0.05 * S, -0.45), new THREE.Vector3(x, 0.05 * S, -0.003 * S), new THREE.Vector3(x, 0.05 * S, 0.026 * S)], { color: ISOTOPE_COLORS[i % 8], radius: 0.0012 + 0.0025 * Math.cbrt(ab), particles: 10, speed: 0.3, size: 0.007, opacity: 0.3 + 0.5 * Math.cbrt(ab) });
        beamG.add(b);
        const t = new THREE.Object3D(); t.position.set(x, 0.05 * S + 0.06 + (i % 2) * 0.025, -0.01); beamG.add(t);
        ctx.label(t, I.name, { className: 'callout' });
      });
      app.applyBeams?.();
    }

    const rng = new RNG(9);
    function update() {
      // noise chart
      const T = 300, t = tS.get();
      const Is = Array.from({ length: 60 }, (_, i) => Math.pow(10, -16 + (i / 59) * 7.5));
      chN.setSeries(['R10', 'R11', 'R12', 'R13'].map((id, j) => {
        const a = AMPLIFIERS.find((q) => q.id === id);
        const imax = a.vMax / a.R;
        return { name: a.label.replace(' resistor', ''), color: ['#64748b', '#3b82f6', '#10b981', '#f59e0b'][j], width: id === st.amp ? 3 : 1.4, x: Is, y: Is.map((I) => (I > imax ? NaN : (Math.hypot(johnsonCurrentNoise(a.R, T, t), shotCurrentNoise(I, t)) / I) * 1e6)) };
      }).concat([{ name: 'counting limit', color: '#94a3b8', dash: [4, 3], x: Is, y: Is.map((I) => (shotCurrentNoise(I, t) / I) * 1e6) }]));
      // SSB session
      const sys = SYSTEMS[st.sys];
      const [ni, nj] = sys.ratio;
      const Ii = sys.isotopes.find((q) => q.name === ni), Ij = sys.isotopes.find((q) => q.name === nj);
      const Rt = Ii.ab / Ij.ab;
      const trueDelta = 0.5; // sample offset in ‰ (illustrative)
      const runs = 13, xs = [], raw = [], corr = [], kinds = [];
      let lastStd = null;
      const stdRs = [];
      for (let r = 0; r < runs; r++) {
        const isStd = r % 2 === 0;
        const b = st.beta + st.drift * (r / (runs - 1)) + rng.normal(0, 0.002);
        const Rtrue = isStd ? Rt : Rt * (1 + trueDelta / 1000);
        const Rm = expLawMeasured(Rtrue, Ii.m, Ij.m, b) * (1 + rng.normal(0, 15e-6));
        xs.push(r + 1); kinds.push(isStd ? 'S' : 'X');
        raw.push((Rm / Rt - 1) * 1000);
        stdRs[r] = Rm;
      }
      for (let r = 0; r < runs; r++) {
        if (kinds[r] === 'S') { corr.push(NaN); continue; }
        const before = stdRs[r - 1], after = stdRs[r + 1] ?? stdRs[r - 1];
        corr.push(ssbDelta(stdRs[r], before, after));
      }
      chB.setSeries([
        { name: 'raw ratio offset (‰)', color: '#ef4444', x: xs, y: raw, type: 'line', width: 1.5 },
        { name: 'sample δ by SSB (‰)', color: '#10b981', x: xs, y: corr, type: 'scatter', r: 4 },
      ]);
      chB.setMarks([{ y: trueDelta, color: '#10b981', label: `true δ = ${trueDelta} ‰` }]);
      // internal normalisation example for Sr
      const rows = [];
      if (st.sys === 'Sr') {
        const m = Object.fromEntries(SYSTEMS.Sr.isotopes.map((q) => [q.name, q.m]));
        const R86_88 = 0.1194, R87_86 = 0.7100;
        const b = st.beta;
        const r86_88m = expLawMeasured(R86_88, m['⁸⁶Sr'], m['⁸⁸Sr'], b);
        const r87_86m = expLawMeasured(R87_86, m['⁸⁷Sr'], m['⁸⁶Sr'], b) + st.rb * Math.pow(86.909 / 85.909, b);
        const bEst = betaFrom(r86_88m, R86_88, m['⁸⁶Sr'], m['⁸⁸Sr']);
        const noRb = expLawCorrect(r87_86m, m['⁸⁷Sr'], m['⁸⁶Sr'], bEst);
        const withRb = expLawCorrect(r87_86m - st.rb * Math.pow(86.909 / 85.909, b), m['⁸⁷Sr'], m['⁸⁶Sr'], bEst);
        rows.push(['⁸⁷Sr/⁸⁶Sr measured', r87_86m.toFixed(6)], ['β from ⁸⁶Sr/⁸⁸Sr', bEst.toFixed(4)], ['corrected, no Rb correction', noRb.toFixed(6)], ['corrected, Rb subtracted', withRb.toFixed(6)], ['true (model)', R87_86.toFixed(6)]);
      } else {
        rows.push(['ratio', `${ni}/${nj}`], ['true (natural)', Rt.toPrecision(6)], ['raw bias at β', `${(((Math.pow(Ii.m / Ij.m, st.beta)) - 1) * 1000).toFixed(1)} ‰`], ['SSB result (mean)', `${(corr.filter(isFinite).reduce((a, b) => a + b, 0) / corr.filter(isFinite).length).toFixed(3)} ‰`]);
      }
      tbl.replaceChildren(table(['Quantity', 'Value'], rows, { numCols: [1] }));
    }
    const upd = debounce(update, 40);
    beamsFor(); update();

    return {
      root, exploder: ex, panel: [intro.el, noise.el, mb.el, src.el],
      camera: { position: [0.04, 0.52, 0.36], target: [0.03, 0.2, -0.02] }, scale: 0.6, defaults: { xray: true },
      dispose() { chN.dispose(); chB.dispose(); },
    };
  },
};
