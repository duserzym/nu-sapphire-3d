// Double-focusing optics: ESA + magnet vs magnet only; energy focusing, mass resolution,
// flat-topped peaks and pseudo-high resolution.
import * as THREE from 'three';
import { toWorld, mesh, plateWithSlit, yawFromDir2D } from '../core/geom.js';
import { M } from '../core/materials.js';
import { Exploder } from '../core/explode.js';
import { Chart } from '../core/chart.js';
import { buildESA } from '../components/esa.js';
import { buildSectorMagnet } from '../components/magnet.js';
import { registerParts } from '../components/parts.js';
import { makeSector } from '../physics/sector.js';
import { sapphireDesign } from '../instrument/build.js';
import { traceIon, lateralAtFocus, layout, coefficients, systemMatrix, peakScan, imageWidth } from '../physics/optics.js';
import { SYSTEMS, requiredResolution } from '../physics/isotopes.js';
import { SOURCES } from '../instrument/specs.js';
import { section, segmented, slider, readouts, note, para, sources, h, debounce } from '../core/ui.js';

const ang = (d) => Math.atan2(d[1], d[0]);

export default {
  id: 'optics',
  title: 'Double focusing: ESA + magnet',
  group: 'Ion optics',
  icon: '∿',
  blurb: 'Energy focusing, mass dispersion, flat-top peaks and pseudo-high resolution',
  async create(ctx) {
    const { app } = ctx;
    const Hb = 0.2;
    const { d, L, D } = sapphireDesign();
    // magnet-only comparison: same magnet and image, ESA replaced by a drift
    const dm = { ...d, phiE: 1e-6, L2: 0.25 };
    { const M0 = systemMatrix({ ...dm, L3: 0 }); dm.L3 = -M0[0][1] / M0[1][1]; }
    const Lm = layout(dm, { esaGap: 0.02 });
    const cA = coefficients(d), cM = coefficients(dm);

    const st = { mode: 'achromat', dK: 0.004, alpha: 0.003 };
    const root = new THREE.Group();
    const ex = new Exploder();
    const hw = new THREE.Group();
    root.add(hw);
    const beams = new THREE.Group();
    root.add(beams);
    let parts = { esa: null, mag: null };

    function buildHardware() {
      ex.removeUnder(hw);
      for (const c of [...hw.children]) { hw.remove(c); c.traverse((q) => { if (q.isCSS2DObject) q.element.remove(); }); }
      const des = st.mode === 'achromat' ? d : dm, Ld = st.mode === 'achromat' ? L : Lm;
      if (st.mode === 'achromat') {
        const esa = buildESA({ a: d.a, phi: d.phiE, beamY: Hb });
        hw.add(esa.group);
        registerParts(ex, esa.parts, { orderScale: 0.6 });
        const t = new THREE.Object3D(); t.position.copy(toWorld([d.a * 0.75, d.a * 0.35], Hb + 0.07)); esa.group.add(t);
        ctx.label(t, 'ESA', { sub: 'r = 2K/(qE): energy dispersion' });
      }
      const sector = makeSector({ R0: des.R, phi: des.phiM });
      const mag = buildSectorMagnet(sector, { beamY: Hb, gap: 0.014, poleThickness: 0.04 });
      const mg = new THREE.Group(); mg.add(mag.group);
      mg.position.set(Ld.M1[0], 0, -Ld.M1[1]); mg.rotation.y = ang(Ld.dE2);
      hw.add(mg);
      registerParts(ex, mag.parts, { orderScale: 0.6 });
      const t2 = new THREE.Object3D(); t2.position.copy(toWorld([des.R * 0.6, des.R * 0.3], Hb + 0.12)); mag.halves.top.add(t2);
      ctx.label(t2, 'Magnet', { sub: 'r ∝ √(mK): momentum dispersion' });
      // object slit & focal plane
      const s1 = mesh(plateWithSlit(0.05, 0.05, 0.002, 0.0006, 0.01), M.steel(), { name: 'object slit' });
      s1.position.copy(toWorld(Ld.S, Hb)); s1.rotation.y = Math.PI / 2; hw.add(s1);
      s1.userData.part = { name: 'Object (source) slit', info: 'Width × magnification sets the image width and hence the resolving power.' };
      const fp = mesh(new THREE.BoxGeometry(0.09, 0.05, 0.002), new THREE.MeshPhysicalMaterial({ color: 0x9fd3ff, transparent: true, opacity: 0.18, roughness: 0.2, depthWrite: false }), { name: 'focal plane' });
      fp.position.copy(toWorld(Ld.F, Hb)); fp.rotation.y = yawFromDir2D(Ld.dM2); hw.add(fp);
      fp.userData.part = { name: 'Image (focal) plane', info: 'Where the collector slits sit. For the achromat every ray of a given mass meets here regardless of angle and energy (first order).' };
      ctx.label(fp, st.mode === 'achromat' ? 'Achromatic focus' : 'Focus (energy-smeared)', { offset: [0, 0.04, 0] });
      ex.set(ex.t);
    }

    const mats = {};
    const col = (k) => (mats[k] ??= new THREE.LineBasicMaterial({ color: k, transparent: true, opacity: 0.9, toneMapped: false }));
    function buildBeams() {
      for (const c of [...beams.children]) { beams.remove(c); c.geometry?.dispose(); }
      const des = st.mode === 'achromat' ? d : dm, Ld = st.mode === 'achromat' ? L : Lm;
      const energies = [[1 - st.dK, 0xff6b6b], [1, 0xffffff], [1 + st.dK, 0x5ab0ff]];
      for (const [kappa, c] of energies) for (const a of [-st.alpha, 0, st.alpha]) {
        const r = traceIon(des, Ld, { alpha: a, kappa, ds: 0.002, after: 0.03 });
        const g = new THREE.BufferGeometry().setFromPoints(r.pts.map((p) => toWorld(p, Hb)));
        const line = new THREE.Line(g, col(c));
        line.userData.beam = true;
        beams.add(line);
      }
    }
    buildHardware(); buildBeams();

    // ---- panel ----
    const intro = section('Why double focusing?', { icon: '∿' });
    intro.body.append(para('Ions from the ICP carry a kinetic-energy spread of a few eV. A magnet bends by <b>momentum</b> (r ∝ √(mK)), so an energy spread blurs every mass peak exactly like a mass difference would. The cylindrical <b>ESA</b> bends by <b>energy only</b> (r = 2K/qE, independent of mass). Placed in front of the magnet with the right drift lengths, its energy dispersion cancels the magnet’s: the image is <b>achromatic</b> (energy-independent) but still <b>mass-dispersive</b> — the Nier–Johnson geometry used in Nu MC-ICP-MS (35 cm ESA, 25 cm magnet; Belshaw et al. 1998).'));
    const modeSeg = segmented({ options: [{ value: 'achromat', label: 'ESA + magnet (achromat)' }, { value: 'magnet', label: 'Magnet only' }], value: st.mode, onChange: (v) => { st.mode = v; buildHardware(); buildBeams(); app.applyXray(); app.applyBeams(); updatePanel(); } });
    const dkS = slider({ label: 'Drawn energy spread ±ΔK/K (exaggerated)', min: 0.0005, max: 0.02, step: 0.0005, value: st.dK, fmt: (v) => `± ${(v * 100).toFixed(2)} %  (± ${(v * 6000).toFixed(0)} eV)`, onInput: debounce((v) => { st.dK = v; buildBeams(); app.applyBeams(); }, 80) });
    const aS = slider({ label: 'Drawn angular spread ±α', min: 0.0005, max: 0.008, step: 0.0005, value: st.alpha, fmt: (v) => `± ${(v * 1000).toFixed(1)} mrad`, onInput: debounce((v) => { st.alpha = v; buildBeams(); app.applyBeams(); }, 80) });
    const ro = readouts([
      { id: 'xa', label: '(x|α) image' }, { id: 'xK', label: '(x|δK) energy dispersion' },
      { id: 'D', label: '(x|δm) mass dispersion' }, { id: 'mag', label: 'Magnification (x|x)' },
      { id: 'geo', label: 'Drifts L′ · L₂ · L″', wide: true },
    ]);
    intro.body.append(modeSeg.el, dkS.el, aS.el, ro.el, note('Red / white / blue rays: −ΔK, nominal, +ΔK. The first-order matrix design is verified by an RK4 trace through explicit fields (1/r ESA field with the boundary potential step; uniform magnet).'));

    const chartCard = section('Focal-plane position vs ion energy', { icon: '⌖' });
    const chE = new Chart(chartCard.body, { height: 170, xLabel: 'ΔK (eV at 6 keV)', yLabel: 'image shift (µm)', legendPos: 'tl' });

    const res = section('Resolution, flat tops & pseudo-high resolution', { icon: '⊓' });
    const elSeg = segmented({ options: ['K', 'Ca', 'Fe', 'Se'].map((k) => ({ value: k, label: k })), value: 'Fe', onChange: () => updatePanel() });
    const slitS = slider({ label: 'Source slit (LR ↔ HR)', min: 0.02, max: 0.3, step: 0.005, value: 0.25, unit: 'mm', onInput: debounce(() => updatePanel(), 60) });
    const cupS = slider({ label: 'Collector slit width', min: 0.1, max: 1.5, step: 0.05, value: 0.8, unit: 'mm', onInput: debounce(() => updatePanel(), 60) });
    const eS = slider({ label: 'Real ion energy spread (FWHM)', min: 1, max: 20, step: 0.5, value: 5, unit: 'eV', onInput: debounce(() => updatePanel(), 60) });
    const zS = slider({ label: 'Zoom (dispersion magnification)', min: 0.5, max: 3, step: 0.05, value: 1.6, fmt: (v) => `× ${v.toFixed(2)}`, onInput: debounce(() => updatePanel(), 60) });
    const ro2 = readouts([{ id: 'wb', label: 'Image width (FWHM)' }, { id: 'R', label: 'Resolving power (5–95 % edge)' }, { id: 'need', label: 'Needed to resolve', wide: true }]);
    res.body.append(elSeg.el, slitS.el, cupS.el, eS.el, zS.el, ro2.el);
    const chP = new Chart(res.body, { height: 190, xLabel: 'magnet scan (mm at the collector)', yLabel: 'signal', legendPos: 'tr', yMin: 0 });
    res.body.append(note('A narrow source slit (MR/HR) makes a narrow image; with a wider collector slit the analyte and the heavier molecular interference form a combined peak whose low-mass <b>shoulder</b> contains the analyte only. Measuring on that shoulder is “pseudo-high resolution” — standard practice for Fe (ArO⁺, ArN⁺) and K (ArH⁺) without a cell.'));

    const src = section('Sources', { icon: '☰', open: false });
    src.body.append(sources([SOURCES.belshaw, SOURCES.sapphire, SOURCES.plasma3]), para('<span class="src">Wollnik, H. (1987) <i>Optics of Charged Particles</i> — transfer matrices of electric and magnetic sectors.</span>'));

    function updatePanel() {
      const c = st.mode === 'achromat' ? cA : cM, des = st.mode === 'achromat' ? d : dm;
      ro.xa.set(`${(c.xa * 1000).toFixed(3)} mm/mrad`);
      ro.xK.set(`${(c.xK * 1000).toFixed(1)} mm per 100 %`, Math.abs(c.xK) < 1e-6 ? 'good' : 'warn');
      ro.D.set(`${(c.xm * 100).toFixed(1)} cm per 100 %`);
      ro.mag.set(c.xx.toFixed(3));
      ro.geo.set(`${(des.L1 * 100).toFixed(1)} · ${(des.L2 * 100).toFixed(1)} · ${(des.L3 * 100).toFixed(1)} cm`);
      // focal plane position vs energy (traced) for both systems
      const dKs = [-12, -8, -4, 0, 4, 8, 12];
      const tr = (dd, LL) => dKs.map((e) => lateralAtFocus(LL, traceIon(dd, LL, { kappa: 1 + e / 6000, ds: 0.002 })) * 1e6);
      chE.setSeries([
        { name: 'ESA + magnet', color: '#10b981', x: dKs, y: tr(d, L), width: 2.2 },
        { name: 'magnet only', color: '#ef4444', x: dKs, y: tr(dm, Lm), width: 2.2 },
      ]);
      // peak shapes for analyte + strongest interference
      const sys = SYSTEMS[elSeg.get()];
      const f = sys.interferences.filter((q) => q.kind !== 'isobar' && q.kind !== 'tail')[0];
      const I = sys.isotopes.find((i) => i.name === f.on);
      const z = zS.get();
      const Dz = D * z;
      const wb = imageWidth({ slit: slitS.get() * 1e-3, mag: cA.xx * z, xK: st.mode === 'achromat' ? 0 : cM.xK * z, dKrel: eS.get() / 6000, aberr: 0.02e-3 });
      const dx = Dz * (f.m - I.m) / I.m;
      const sc = peakScan([{ x: 0, I: 1, wb }, { x: dx, I: 0.6, wb }], cupS.get() * 1e-3, { span: Math.max(1.5e-3, Math.abs(dx) * 3 + cupS.get() * 1e-3) });
      chP.setSeries([
        { name: 'total', color: '#94a3b8', x: sc.xs.map((v) => v * 1e3), y: sc.ys, width: 2.4 },
        { name: I.name, color: '#3b82f6', x: sc.xs.map((v) => v * 1e3), y: sc.parts[0], dash: [4, 3] },
        { name: f.name, color: '#ef4444', x: sc.xs.map((v) => v * 1e3), y: sc.parts[1], dash: [4, 3] },
      ]);
      ro2.wb.set(`${(wb * 1e6).toFixed(0)} µm`);
      ro2.R.set(`${Math.round(Dz / (2 * 1.645 * wb / 2.3548)).toLocaleString()}`);
      ro2.need.set(`${f.name} on ${I.name}: m/Δm ≈ ${Math.round(requiredResolution(I.m, f.m)).toLocaleString()} · separation ${(dx * 1e6).toFixed(0)} µm`);
    }
    updatePanel();

    return {
      root, exploder: ex, panel: [intro.el, chartCard.el, res.el, src.el],
      camera: (() => { const b = new THREE.Box3().setFromObject(root); const c = b.getCenter(new THREE.Vector3()); return { position: [c.x + 0.1, c.y + 1.25, c.z + 0.95], target: [c.x, c.y, c.z] }; })(), scale: 1.4, defaults: { xray: true },
      dispose() { chE.dispose(); chP.dispose(); },
    };
  },
};
