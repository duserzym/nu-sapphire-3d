// U–Pb: split low-/high-mass collector zones with independent zoom & steering.
import * as THREE from 'three';
import { Exploder } from '../core/explode.js';
import { Chart } from '../core/chart.js';
import { IonBeam } from '../core/beam.js';
import { M } from '../core/materials.js';
import { mesh, roundedBox, tubeShell } from '../core/geom.js';
import { buildFaradayLite, buildIonCounterLite } from '../components/faraday.js';
import { sapphireDesign } from '../instrument/build.js';
import { traceIon, lateralAtFocus } from '../physics/optics.js';
import { UPB, analyseZones, zoneScan } from '../physics/zones.js';
import { SOURCES } from '../instrument/specs.js';
import { section, segmented, slider, readouts, note, para, table, sources, buttons, h, rafThrottle } from '../core/ui.js';

const COL = { '²⁰²Hg': 0x9aa5b4, '²⁰⁴Pb': 0xc59bff, '²⁰⁶Pb': 0x5ab0ff, '²⁰⁷Pb': 0x4fd6a1, '²⁰⁸Pb': 0xffb24a, '²³²Th': 0xff9966, '²³⁵U': 0xff6f91, '²³⁸U': 0xf5e663 };

export default {
  id: 'upb',
  title: 'U–Pb: split low/high-mass zones',
  group: 'Instrument',
  icon: '⇔',
  blurb: 'Independent zoom & steering for the Pb and U collector zones → static Pb + U',
  async create(ctx) {
    const { app } = ctx;
    const { d, L } = sapphireDesign();
    const mRef = 220, pitch = 2.5e-3;
    const nat = (() => { const cache = new Map(); return (m) => { if (!cache.has(m)) cache.set(m, lateralAtFocus(L, traceIon(d, L, { mu: m / mRef, ds: 0.002 }))); return cache.get(m); }; })();
    const base = analyseZones(nat, { pitch, mRef });
    const st = { mode: 'linked', lin: { ...base.fitAll }, low: { ...base.fitL }, high: { ...base.fitH }, wb: 0.25e-3, wc: 1.0e-3 };

    const S = 3; // drawing scale for the collector region (mm-scale hardware made legible)
    const root = new THREE.Group();
    const ex = new Exploder();
    const arr = new THREE.Group();
    arr.scale.setScalar(S);
    arr.position.y = 0.15;
    root.add(arr);
    const beams = [...UPB.low, ...UPB.high];
    const isIC_ = (b) => b.det.startsWith('IC');
    // detectors at their (uniform-pitch) positions
    const detGroup = new THREE.Group();
    arr.add(detGroup);
    const markers = {};
    beams.forEach((b, i) => {
      const x = pitch * (b.m - mRef);
      const mk = new THREE.Mesh(new THREE.SphereGeometry(0.0011, 16, 10), new THREE.MeshBasicMaterial({ color: 0x22c55e, toneMapped: false }));
      mk.position.set(x, 0.0105, isIC_(b) ? (i % 2) * 0.012 : 0);
      mk.userData.part = { name: `Alignment indicator (${b.name})`, info: 'Green: beam centred within the cup flat top. Red: beam off-centre (signal lost).' };
      detGroup.add(mk);
      markers[b.name] = mk;
      const isIC = b.det.startsWith('IC');
      const det = isIC ? buildIonCounterLite({ width: 2.2e-3, height: 0.016, depth: 0.026 }) : buildFaradayLite({ width: 2.0e-3, height: 0.016, depth: 0.026 });
      det.group.position.set(x, 0, isIC ? (i % 2) * 0.012 : 0);
      detGroup.add(det.group);
      ex.add(det.group, [0, 0.01 + 0.004 * (i % 3), 0.02], { name: `${isIC ? 'Ion counter' : 'Faraday'} for ${b.name}`, info: `${b.role}. Fixed position ${(x * 1000).toFixed(1)} mm from the array centre (uniform 2.5 mm/u pitch, model).`, order: 0.5 });
      const t = new THREE.Object3D(); t.position.set(x, 0.012 + (i % 2) * 0.006, -0.004); det.group.parent.add(t);
      ctx.label(t, b.name, { sub: isIC ? 'IC' : 'Faraday', className: 'callout' });
    });
    // filler Faradays between the zones (cf. 14 Faradays between Dalys on the Nu Plasma 3D)
    for (let k = 0; k < 14; k++) {
      const m = 211 + k * 1.5;
      const c = buildFaradayLite({ width: 2.0e-3, height: 0.016, depth: 0.026 });
      c.group.position.set(pitch * (m - mRef), 0, 0);
      detGroup.add(c.group);
      ex.add(c.group, [0, 0.006, 0.01], { name: 'Faraday (unused for U–Pb)', info: 'Middle of the array: idle during U–Pb, used for other isotope systems.', order: 0.55 });
    }
    // zone optics: two independent zoom (quad pair) + steering assemblies
    const mkZone = (name, x0, x1, color) => {
      const g = new THREE.Group();
      const w = x1 - x0 + 0.01;
      const box = mesh(roundedBox(w, 0.02, 0.03, 0.002), new THREE.MeshPhysicalMaterial({ color, transparent: true, opacity: 0.35, roughness: 0.3, depthWrite: false }), { name: `${name} housing` });
      g.add(box);
      for (const zz of [-0.008, 0.008]) for (const yy of [-0.006, 0.006]) {
        const r = mesh(new THREE.CylinderGeometry(0.0012, 0.0012, w, 12), M.steelPolished(), { name: 'zone quadrupole rod' });
        r.rotation.z = Math.PI / 2; r.position.set(0, yy, zz); g.add(r);
      }
      for (const yy of [-0.009, 0.009]) {
        const p = mesh(new THREE.BoxGeometry(w * 0.9, 0.0008, 0.012), M.gold(), { name: 'steering plate' });
        p.position.set(0, yy, 0.02); g.add(p);
      }
      g.position.set((x0 + x1) / 2, 0, -0.07);
      arr.add(g);
      return g;
    };
    const xL0 = pitch * (UPB.low[0].m - mRef) - 0.002, xL1 = pitch * (UPB.low.at(-1).m - mRef) + 0.002;
    const xH0 = pitch * (UPB.high[0].m - mRef) - 0.002, xH1 = pitch * (UPB.high.at(-1).m - mRef) + 0.002;
    const zL = mkZone('Low-mass zone optics', xL0, xL1, 0x4f8cff);
    const zH = mkZone('High-mass zone optics', xH0, xH1, 0xe8a33d);
    ex.add(zL, [0, 0.03, -0.02], { name: 'Low-mass zone: zoom + steering (Hg–Pb)', info: 'Independent dispersion (quadrupole) and steering for ²⁰²Hg–²⁰⁸Pb. User/lab-reported Sapphire capability — confirm with Nu documentation.', order: 0.3 });
    ex.add(zH, [0, 0.03, -0.02], { name: 'High-mass zone: zoom + steering (Th–U)', info: 'Independent dispersion and steering for ²³²Th–²³⁸U. User/lab-reported Sapphire capability — confirm with Nu documentation.', order: 0.3 });
    ctx.label(zL, 'Low-mass zone', { sub: 'zoom + steer', offset: [0, 0.016, 0] });
    ctx.label(zH, 'High-mass zone', { sub: 'zoom + steer', offset: [0, 0.016, 0] });
    // flight tube end
    const tube = mesh(tubeShell(0.06, 0.058, 0.25, 48), M.steelBrushed(), { name: 'flight tube to collector' });
    tube.rotation.x = Math.PI / 2; tube.position.set(0, 0, -0.2); tube.scale.set(1.2, 1, 0.35);
    const tubeG = new THREE.Group(); tubeG.add(tube); arr.add(tubeG);
    ex.add(tubeG, [0, 0.12, -0.05], { name: 'Flight tube (magnet exit → collector)', info: 'After the magnet the Pb and U beams are ~75 mm apart (≈36 u at m ≈ 220).', shell: true, order: 0 });

    const beamG = new THREE.Group();
    arr.add(beamG);
    function drawBeams() {
      for (const c of [...beamG.children]) { beamG.remove(c); c.dispose?.(); }
      const zone = (b) => (st.mode === 'linked' ? st.lin : b.zone === 'low' ? st.low : st.high);
      for (const b of res.beams) {
        const f = zone(b);
        const x0 = b.x * 1.6;
        const xEnd = f.z * b.x + f.s;
        const pts = [new THREE.Vector3(x0 * 0.7, 0, -0.32), new THREE.Vector3(b.x * 2.2, 0, -0.085), new THREE.Vector3(xEnd, 0, -0.06), new THREE.Vector3(xEnd, 0, 0.02)];
        const ok = Math.abs(f.z * b.x + f.s - b.cup) < (st.wc - st.wb) / 2;
        const beam = new IonBeam(pts, { color: COL[b.name] ?? 0xffffff, radius: 0.0006, particles: 10, speed: 0.12, size: 0.0028, opacity: ok ? 0.75 : 0.35 });
        beamG.add(beam);
      }
      app.applyBeams?.();
    }

    // ---- panel ----
    const intro = section('Static Pb + U on one array', { icon: '⇔' });
    intro.body.append(
      para('For LA–MC-ICP-MS U–Pb dating you want ²⁰²Hg, ²⁰⁴Pb, ²⁰⁶Pb, ²⁰⁷Pb, ²⁰⁸Pb <b>and</b> ²³²Th, ²³⁵U, ²³⁸U measured <b>simultaneously</b> — a laser pit changes on second time-scales, so peak hopping between Pb and U costs precision. But the Pb and U groups are ~30 u apart, and the image spacing per mass unit scales as D/m: 1 u at Pb is ~17 % wider than 1 u at U. With one dispersion (zoom) and steering setting, a fixed array cannot centre both groups.'),
      note('<b>Provenance:</b> independent low-mass/high-mass zone control on the Nu Sapphire is <b>user/lab knowledge — confirm with Nu documentation</b>. Public Nu pages state 16 Faradays, zoom optics and up to 6 ion counters “arranged in tailored configurations” with U–Pb dating as an application (Plasma 3/Sapphire), and independently adjustable detector slits (Plasma 1700). A published Nu Plasma 3D U–Pb set-up used five Dalys on the low-mass side (202–208), one on the high-mass side and 14 Faradays between, with ²³²Th and ²³⁸U on Faradays (Geochronology 2020).', 'warn'),
    );
    const ctl = section('Zone controls', { icon: '⚙' });
    const modeSeg = segmented({ options: [{ value: 'linked', label: 'Linked (single zoom)' }, { value: 'split', label: 'Independent zones' }], value: st.mode, onChange: (v) => { st.mode = v; syncSliders(); update(); } });
    const fmtZ = (v) => `× ${v.toFixed(4)}`, fmtS = (v) => `${(v * 1000).toFixed(3)} mm`;
    const mk = (label, get, set, min, max, step, fmt) => slider({ label, min, max, step, value: get(), fmt, onInput: (v) => { set(v); thr(); } });
    const linZ = mk('Zoom (whole array)', () => st.lin.z, (v) => (st.lin.z = v), base.fitAll.z * 0.85, base.fitAll.z * 1.15, 0.0005, fmtZ);
    const linS = mk('Steering (whole array)', () => st.lin.s, (v) => (st.lin.s = v), base.fitAll.s - 0.004, base.fitAll.s + 0.004, 0.00002, fmtS);
    const lowZ = mk('Low-mass zone zoom', () => st.low.z, (v) => (st.low.z = v), base.fitL.z * 0.85, base.fitL.z * 1.15, 0.0005, fmtZ);
    const lowS = mk('Low-mass zone steering', () => st.low.s, (v) => (st.low.s = v), base.fitL.s - 0.004, base.fitL.s + 0.004, 0.00002, fmtS);
    const highZ = mk('High-mass zone zoom', () => st.high.z, (v) => (st.high.z = v), base.fitH.z * 0.85, base.fitH.z * 1.15, 0.0005, fmtZ);
    const highS = mk('High-mass zone steering', () => st.high.s, (v) => (st.high.s = v), base.fitH.s - 0.004, base.fitH.s + 0.004, 0.00002, fmtS);
    const linBox = h('div', {}, linZ.el, linS.el), splitBox = h('div', {}, lowZ.el, lowS.el, highZ.el, highS.el);
    const btns = buttons([{ label: 'Auto-centre', primary: true, onClick: () => { st.lin = { ...base.fitAll }; st.low = { ...base.fitL }; st.high = { ...base.fitH }; syncSliders(); update(); } }]);
    const ro = readouts([
      { id: 'low', label: 'Worst offset, Pb zone' }, { id: 'high', label: 'Worst offset, U zone' },
      { id: 'sig', label: 'Lowest signal (flat-top)' }, { id: 'zr', label: 'Zone zoom ratio (fitted)' },
    ]);
    ctl.body.append(modeSeg.el, linBox, splitBox, btns.el, ro.el);
    function syncSliders() {
      linBox.style.display = st.mode === 'linked' ? '' : 'none';
      splitBox.style.display = st.mode === 'split' ? '' : 'none';
      linZ.set(st.lin.z); linS.set(st.lin.s); lowZ.set(st.low.z); lowS.set(st.low.s); highZ.set(st.high.z); highS.set(st.high.s);
    }

    const ch = section('Peak coincidence', { icon: '⊓' });
    const chL = new Chart(ch.body, { height: 160, title: 'Pb zone: signal vs common steering scan', xLabel: 'scan (mm)', yLabel: 'signal', yMin: 0, yMax: 1.05, legendPos: 'br' });
    const chH = new Chart(ch.body, { height: 160, title: 'U zone: signal vs common steering scan', xLabel: 'scan (mm)', yLabel: 'signal', yMin: 0, yMax: 1.05, legendPos: 'br' });
    const chR = new Chart(ch.body, { height: 170, title: 'Beam-to-cup offset per isotope (auto-centred)', xLabel: 'isotope # (202Hg … 238U)', yLabel: 'offset (µm)', legendPos: 'tl' });
    const tbl = h('div');
    ch.body.append(tbl);
    const wf = section('LA U–Pb workflow notes', { icon: '✎', open: true });
    wf.body.append(h('ul', { html: [
      '<b>²⁰⁴Hg on ²⁰⁴Pb:</b> Hg in the Ar/He gas makes ²⁰⁴Pb unusable without correction; monitor ²⁰²Hg and subtract ²⁰⁴Hg = ²⁰²Hg × (²⁰⁴Hg/²⁰²Hg ≈ 0.2299, mass-bias corrected).',
      '<b>Detector mix:</b> ²⁰⁴Pb and ²⁰⁷Pb (and often ²⁰⁶Pb in young or low-U grains) on ion counters; ²³²Th, ²³⁸U (and ²⁰⁶Pb when large) on Faradays. Static collection keeps every ratio in the same ablation time slice.',
      '<b>IC/Faraday gain:</b> cross-calibrate each ion counter against Faradays (e.g. by peak-switching a stable beam or with a standard), and correct IC dead time and yield drift.',
      '<b>Pb/U fractionation:</b> down-hole and elemental fractionation during ablation are corrected by standard–sample bracketing with matrix-matched zircon reference materials (e.g. 91500, Plešovice, GJ-1).',
      '<b>Precision payoff:</b> simultaneous Pb + U removes the plasma-flicker and transient-signal penalty of peak hopping → better ²⁰⁶Pb/²³⁸U and ²⁰⁷Pb/²⁰⁶Pb from the same pit.',
    ].map((x) => `<li>${x}</li>`).join('') }));
    const src = section('Sources', { icon: '☰', open: false });
    src.body.append(sources([SOURCES.gchron2020, SOURCES.plasma3, SOURCES.plasma1700, SOURCES.sapphire, SOURCES.belshaw]));

    let res = base;
    function update() {
      res = analyseZones(nat, { pitch, mRef, wb: st.wb, wc: st.wc, linked: st.lin, low: st.low, high: st.high });
      const key = st.mode === 'linked' ? 'dLinked' : 'dSplit';
      const fk = st.mode === 'linked' ? 'fLinked' : 'fSplit';
      const lw = Math.max(...res.beams.filter((b) => b.zone === 'low').map((b) => Math.abs(b[key])));
      const hw = Math.max(...res.beams.filter((b) => b.zone === 'high').map((b) => Math.abs(b[key])));
      const tol = (st.wc - st.wb) / 2;
      ro.low.set(`${(lw * 1e6).toFixed(0)} µm`, lw < tol ? 'good' : 'bad');
      ro.high.set(`${(hw * 1e6).toFixed(0)} µm`, hw < tol ? 'good' : 'bad');
      const fmin = Math.min(...res.beams.map((b) => b[fk]));
      ro.sig.set(`${(fmin * 100).toFixed(1)} %`, fmin > 0.995 ? 'good' : 'bad');
      ro.zr.set(`z_U / z_Pb = ${(base.fitH.z / base.fitL.z).toFixed(3)}`);
      const scans = zoneScan(res.beams, key, { wb: st.wb, wc: st.wc });
      const mkS = (zone) => scans.filter((s) => s.zone === zone).map((s) => ({ name: s.name, color: '#' + (COL[s.name] ?? 0xffffff).toString(16).padStart(6, '0'), x: s.x.map((v) => v * 1e3), y: s.y, width: 2 }));
      chL.setSeries(mkS('low'));
      chH.setSeries(mkS('high'));
      const auto = analyseZones(nat, { pitch, mRef, wb: st.wb, wc: st.wc });
      const xs = auto.beams.map((_, i) => i + 1);
      chR.setSeries([
        { name: 'linked (single zoom)', color: '#ef4444', x: xs, y: auto.beams.map((b) => b.dLinked * 1e6), type: 'line', width: 2 },
        { name: 'independent zones', color: '#10b981', x: xs, y: auto.beams.map((b) => b.dSplit * 1e6), type: 'line', width: 2 },
      ]);
      chR.setMarks([{ y: tol * 1e6, color: '#94a3b8', label: 'flat-top edge' }, { y: -tol * 1e6, color: '#94a3b8' }]);
      for (const b of res.beams) markers[b.name]?.material.color.set(b[fk] > 0.995 ? 0x22c55e : b[fk] > 0.5 ? 0xf59e0b : 0xef4444);
      tbl.replaceChildren(table(['Isotope', 'Detector', 'Offset now', 'Signal'], res.beams.map((b) => [b.name, b.det, `${(b[key] * 1e6).toFixed(0)} µm`, `${(b[fk] * 100).toFixed(1)} %`]), { numCols: [2, 3] }));
      drawBeams();
    }
    const thr = rafThrottle(update);
    syncSliders();
    update();

    return {
      root, exploder: ex, panel: [intro.el, ctl.el, ch.el, wf.el, src.el],
      camera: { position: [0.02, 0.62, 0.62], target: [0, 0.12, -0.12] }, scale: 0.7, defaults: { xray: true },
      dispose() { chL.dispose(); chH.dispose(); chR.dispose(); },
    };
  },
};
