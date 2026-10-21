// Hexapole collision/reaction cell: RF confinement, collisional cooling, reactions.
import * as THREE from 'three';
import { Exploder } from '../core/explode.js';
import { Chart } from '../core/chart.js';
import { Sparks } from '../core/beam.js';
import { buildHexapole } from '../components/plasma.js';
import { registerParts } from '../components/parts.js';
import { hexapoleWellDepth, pseudoPotential, coolingMC, REACTIONS, survival, numberDensity, cellPressure, residenceTime, meanRetained } from '../physics/cell.js';
import { SYSTEMS } from '../physics/isotopes.js';
import { SOURCES } from '../instrument/specs.js';
import { RNG } from '../physics/rng.js';
import { section, segmented, slider, readouts, note, para, table, sources, debounce, h } from '../core/ui.js';

export default {
  id: 'cell',
  title: 'Collision/reaction cell',
  group: 'Ion optics',
  icon: '⬡',
  blurb: 'Hexapole RF well, collisional cooling with He, ArH⁺/Ar⁺ removal with H₂',
  async create(ctx) {
    const { app } = ctx;
    const root = new THREE.Group();
    const ex = new Exploder();
    const Lc = 0.16;
    const cell = buildHexapole({ L: Lc, r0: 0.004, rodR: 0.002 }); // ideal hexapole: r_rod ≈ r0/2
    cell.group.position.y = 0.12;
    root.add(cell.group);
    registerParts(ex, cell.parts, { orderScale: 0.7, scale: 0.45 });
    ctx.label(cell.group, 'Hexapole collision/reaction cell', { sub: 'RF on 6 rods · He + H₂', offset: [0, 0.075, 0] });

    // animated ions & gas
    const ionsA = new Sparks({ color: 0x5ab0ff, max: 300, size: 0.0045 });
    const ionsX = new Sparks({ color: 0xff4d4d, max: 300, size: 0.0045 });
    const gasP = new Sparks({ color: 0xcfd6df, max: 400, size: 0.0022 });
    const flash = new Sparks({ color: 0xffe08a, max: 80, size: 0.006 });
    [ionsA, ionsX, gasP, flash].forEach((s) => { s.position.y = 0.12; root.add(s); });
    const rng = new RNG(4);

    const st = { He: 4, H2: 4, V: 100, f: 5, mIon: 39, E0: 20, sys: 'K' };

    // ---- panel ----
    const intro = section('Why a cell in a multicollector?', { icon: '⬡' });
    intro.body.append(para('Argon plasma makes molecular ions — ArH⁺ on ³⁹K/⁴¹K, Ar⁺ on ⁴⁰Ca, ArO⁺/ArN⁺ on ⁵⁶Fe/⁵⁴Fe, Ar₂⁺ on ⁷⁶⁻⁸⁰Se — that need resolving powers of 2 500 to >10⁵ or simply cannot be resolved. In the Sapphire’s low-energy path the 6 keV beam is decelerated into a hexapole filled with He and H₂: <b>H₂ reacts</b> with the argon species (e.g. ArH⁺ + H₂ → H₃⁺ + Ar) while K⁺, Ca⁺, Fe⁺ do not, and <b>He collisions cool</b> the ions so the energy spread collapses before re-acceleration. Result: low-resolution, flat-topped, high-transmission measurements of these isotopes.'));
    const ctl = section('Cell conditions', { icon: '⚙' });
    const sysSeg = segmented({ options: ['K', 'Ca', 'Fe', 'Se'].map((k) => ({ value: k, label: k })), value: st.sys, onChange: (v) => { st.sys = v; st.mIon = SYSTEMS[v].isotopes[0].m; update(); } });
    const heS = slider({ label: 'He flow', min: 0, max: 10, step: 0.1, value: st.He, unit: 'mL/min', onInput: (v) => { st.He = v; upd(); } });
    const h2S = slider({ label: 'H₂ flow', min: 0, max: 10, step: 0.1, value: st.H2, unit: 'mL/min', onInput: (v) => { st.H2 = v; upd(); } });
    const vS = slider({ label: 'RF amplitude (0-peak)', min: 20, max: 300, step: 5, value: st.V, unit: 'V', onInput: (v) => { st.V = v; upd(); } });
    const eS = slider({ label: 'Ion energy entering the cell', min: 2, max: 60, step: 1, value: st.E0, unit: 'eV', onInput: (v) => { st.E0 = v; upd(); } });
    const ro = readouts([
      { id: 'P', label: 'Cell pressure (model)' }, { id: 'n', label: 'Gas density' },
      { id: 'coll', label: 'Collisions per ion' }, { id: 'Eout', label: 'Exit energy (mean ± sd)' },
      { id: 'depth', label: 'Pseudo-potential depth' }, { id: 'keep', label: 'Energy kept per He collision' },
    ]);
    ctl.body.append(sysSeg.el, heS.el, h2S.el, vS.el, eS.el, ro.el);
    const chartCard = section('Cooling & removal', { icon: '📉' });
    const chCool = new Chart(chartCard.body, { height: 160, title: 'Mean ion energy along the cell (Monte Carlo)', xLabel: 'position (cm)', yLabel: 'energy (eV)', yLog: true });
    const chRem = new Chart(chartCard.body, { height: 170, title: 'Surviving fraction vs H₂ flow', xLabel: 'H₂ flow (mL/min)', yLabel: 'I / I₀', yLog: true, yMin: 1e-9, yMax: 2 });
    const chPot = new Chart(chartCard.body, { height: 150, title: 'Hexapole pseudo-potential (∝ r⁴)', xLabel: 'r / r₀', yLabel: 'V* (V)', legendPos: 'tl' });
    const tbl = h('div');
    chartCard.body.append(tbl, note('Pressure from flow uses an assumed exit conductance (8 L/s); Ar⁺/ArH⁺ rate coefficients are representative literature values (Anicich 1993); Ar₂⁺/ArX⁺ values and the analyte upper bound are illustrative. Real cells are tuned empirically.', 'warn'));
    const src = section('Sources', { icon: '☰', open: false });
    src.body.append(sources([SOURCES.sapphire, SOURCES.harvard, SOURCES.jaas2025, SOURCES.specEurope]), para('<span class="src">Gerlich (1992) Adv. Chem. Phys. 82:1 (multipole ion guides); Anicich (1993) J. Phys. Chem. Ref. Data 22:1469 (ion–molecule rate coefficients).</span>'));

    let sim = null;
    function update() {
      const Ptot = cellPressure(st.He + st.H2);
      const nd = numberDensity(Ptot);
      const nH2 = numberDensity(cellPressure(st.H2));
      const mGasAvg = st.He + st.H2 > 0 ? (4 * st.He + 2 * st.H2) / (st.He + st.H2) : 4;
      sim = coolingMC({ mIon: st.mIon, mGas: mGasAvg, E0: st.E0, dE0: Math.max(0.5, st.E0 * 0.15), P: Math.max(1e-4, Ptot), L: Lc, n: 400 });
      ro.P.set(`${(Ptot / 100).toExponential(2)} mbar`);
      ro.n.set(`${(nd * 1e-6).toExponential(2)} cm⁻³`);
      ro.coll.set(sim.collisions.toFixed(1));
      const m = sim.exitE.reduce((a, b) => a + b, 0) / sim.exitE.length;
      const sd = Math.sqrt(sim.exitE.reduce((a, b) => a + (b - m) ** 2, 0) / sim.exitE.length);
      ro.Eout.set(`${m.toFixed(2)} ± ${sd.toFixed(2)} eV`, m < 1 ? 'good' : '');
      const depth = hexapoleWellDepth({ V: st.V, mU: st.mIon });
      ro.depth.set(`${depth.toFixed(2)} V @ r₀ (m = ${Math.round(st.mIon)})`);
      ro.keep.set(`${(meanRetained(st.mIon, 4) * 100).toFixed(1)} %`);
      chCool.setSeries([
        { name: 'mean', color: '#3b82f6', x: sim.x.map((v) => v * 100), y: sim.meanE, width: 2.2 },
        { name: '+1σ', color: '#93c5fd', x: sim.x.map((v) => v * 100), y: sim.meanE.map((e, i) => e + sim.sdE[i]), dash: [4, 3] },
      ]);
      // removal vs H2 flow for the interferences of this system
      const sys = SYSTEMS[st.sys];
      const flows = Array.from({ length: 41 }, (_, i) => i * 0.25);
      const tRes = residenceTime(st.mIon, Lc, 1.0);
      const kinds = [...new Set(sys.interferences.map((f) => f.kind).filter((k) => REACTIONS[k]))];
      const series = kinds.map((k, j) => ({ name: REACTIONS[k].label.split('→')[0].trim(), color: ['#ef4444', '#f59e0b', '#8b5cf6'][j % 3], x: flows, y: flows.map((q) => survival(REACTIONS[k].k, numberDensity(cellPressure(q)), tRes)), width: 2 }));
      series.push({ name: 'analyte (≤ upper bound)', color: '#10b981', x: flows, y: flows.map((q) => survival(REACTIONS.analyte.k, numberDensity(cellPressure(q)), tRes)), width: 2 });
      chRem.setSeries(series);
      chRem.setMarks([{ x: st.H2, color: '#64748b', label: 'now' }]);
      const rs = [];
      for (let i = 0; i <= 50; i++) rs.push(i / 50);
      chPot.setSeries([
        { name: 'm = 39', color: '#3b82f6', x: rs, y: rs.map((r) => pseudoPotential(r * 0.004, { V: st.V, mU: 39 })) },
        { name: 'm = 80', color: '#f59e0b', x: rs, y: rs.map((r) => pseudoPotential(r * 0.004, { V: st.V, mU: 80 })) },
        { name: 'm = 238', color: '#8b5cf6', x: rs, y: rs.map((r) => pseudoPotential(r * 0.004, { V: st.V, mU: 238 })) },
      ]);
      tbl.replaceChildren(table(['Interference', 'Reaction', 'k (cm³/s)', 'Survives now'], sys.interferences.filter((f) => REACTIONS[f.kind]).map((f) => [f.name, REACTIONS[f.kind].label, REACTIONS[f.kind].k.toExponential(1) + (REACTIONS[f.kind].illustrative ? ' *' : ''), survival(REACTIONS[f.kind].k, nH2, tRes).toExponential(1)]), { numCols: [2, 3] }));
      st.surv = sys.interferences.filter((f) => REACTIONS[f.kind]).map((f) => survival(REACTIONS[f.kind].k, nH2, tRes));
    }
    const upd = debounce(update, 60);
    update();

    // animation: ions enter at −L/2 with transverse oscillation, lose speed via collisions
    let tAcc = 0;
    const R0 = 0.004;
    function spawnIon(sparks, interfering) {
      const r = R0 * 0.7 * Math.sqrt(rng.u()), th = rng.u() * Math.PI * 2;
      const p = new THREE.Vector3(-Lc / 2 - 0.02, r * Math.cos(th), r * Math.sin(th));
      const v = new THREE.Vector3(0.22, rng.normal(0, 0.02), rng.normal(0, 0.02));
      const pColl = Math.min(0.9, (sim?.collisions ?? 5) / 120);
      const surv = interfering ? Math.max(1e-6, (st.surv?.[0] ?? 1)) : 1;
      const dieAt = interfering && rng.u() > surv ? -Lc / 2 + rng.u() * Lc * 0.8 : Infinity;
      sparks.spawn(p, v, 4, (pp, vv, age, dt) => {
        // r⁴ well: restoring force grows steeply near the rods
        const rr = Math.hypot(pp.y, pp.z);
        const K = 400 * (st.V / 100) ** 2 * Math.pow(Math.max(rr, 0.3 * R0) / R0, 2); // r⁴ well → force ∝ r³
        vv.y -= K * pp.y * dt; vv.z -= K * pp.z * dt;
        if (pp.x > -Lc / 2 && pp.x < Lc / 2 && rng.u() < pColl * dt * 60) {
          vv.multiplyScalar(0.86); vv.x = Math.max(0.05, vv.x);
          vv.y += rng.normal(0, 0.006); vv.z += rng.normal(0, 0.006);
        }
        if (pp.x > dieAt) {
          flash.spawn(pp, new THREE.Vector3(), 0.25);
          pp.set(99, 99, 99); vv.set(0, 0, 0);
        }
        if (pp.x > Lc / 2 + 0.03) { pp.set(99, 99, 99); vv.set(0, 0, 0); }
      });
    }
    function update3D(dt) {
      tAcc += dt;
      while (tAcc > 0.05) {
        tAcc -= 0.05;
        spawnIon(ionsA, false);
        spawnIon(ionsX, true);
        const gN = Math.round(((st.He + st.H2) / 10) * 3);
        for (let i = 0; i < gN; i++) {
          gasP.spawn(new THREE.Vector3((rng.u() - 0.5) * Lc, (rng.u() - 0.5) * 0.008, (rng.u() - 0.5) * 0.008), new THREE.Vector3(rng.normal(0, 0.012), rng.normal(0, 0.004), rng.normal(0, 0.004)), 1.0);
        }
      }
      for (const s of [ionsA, ionsX, gasP, flash]) s.update(dt);
    }

    for (let i = 0; i < 180; i++) update3D(1 / 60); // pre-fill the cell so the first frame is representative

    const legend = h('div', {}, h('div', { class: 'row' }, h('span', { class: 'sw', style: 'background:#5ab0ff' }), 'analyte ions (K⁺, Ca⁺, Fe⁺…)'),
      h('div', { class: 'row' }, h('span', { class: 'sw', style: 'background:#ff4d4d' }), 'Ar-based interferences (react with H₂)'),
      h('div', { class: 'row' }, h('span', { class: 'sw', style: 'background:#cfd6df' }), 'He / H₂ gas'));
    ctx.overlay(legend);

    return {
      root, exploder: ex, panel: [intro.el, ctl.el, chartCard.el, src.el],
      camera: { position: [0.08, 0.215, 0.235], target: [0, 0.12, 0] }, scale: 0.3, defaults: { xray: true },
      update: update3D,
      dispose() { chCool.dispose(); chRem.dispose(); chPot.dispose(); },
    };
  },
};
