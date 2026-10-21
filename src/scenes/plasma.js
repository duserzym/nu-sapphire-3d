// ICP & interface: torch, plasma zones, cones; Saha ionization; space-charge mass bias.
import * as THREE from 'three';
import { Exploder } from '../core/explode.js';
import { Chart } from '../core/chart.js';
import { IonBeam } from '../core/beam.js';
import { buildICP } from '../components/plasma.js';
import { registerParts } from '../components/parts.js';
import { icpIonFraction, biasPerAmuPercent } from '../physics/plasma.js';
import { IE } from '../physics/isotopes.js';
import { SOURCES } from '../instrument/specs.js';
import { section, slider, readouts, note, para, sources, debounce, h } from '../core/ui.js';

export default {
  id: 'plasma',
  title: 'Plasma & interface',
  group: 'Measurement',
  icon: '☀',
  blurb: 'ICP torch, cones, Saha ionization vs IE, space-charge mass bias',
  async create(ctx) {
    const root = new THREE.Group();
    const ex = new Exploder();
    const icp = buildICP({ box: false });
    icp.group.position.set(0, 0.12, 0);
    root.add(icp.group);
    registerParts(ex, icp.parts, { orderScale: 0.8, scale: 0.7 });
    ctx.label(icp.parts.find((p) => /Argon plasma/.test(p.name)).obj, 'Ar plasma', { sub: '6 000–10 000 K', offset: [0, 0.03, 0] });
    ctx.label(icp.parts.find((p) => /Sampler/.test(p.name)).obj, 'Sampler', { offset: [0, 0.03, 0] });
    ctx.label(icp.parts.find((p) => /Skimmer/.test(p.name)).obj, 'Skimmer', { offset: [0.01, -0.02, 0] });
    const beam = new IonBeam([new THREE.Vector3(-0.06, 0.12, 0), new THREE.Vector3(0, 0.12, 0), new THREE.Vector3(0.12, 0.12, 0)], { color: 0x9ad8ff, radius: 0.0012, particles: 25, speed: 0.08, size: 0.003 });
    root.add(beam);

    const intro = section('From aerosol to ions', { icon: '☀' });
    intro.body.append(para('Sample aerosol (solution or laser-ablation particles) travels down the cooler <b>central channel</b> of the argon ICP, where it is desolvated, atomised and ionised. At ~7 500 K and n<sub>e</sub> ≈ 10¹⁵ cm⁻³ the Saha equation predicts nearly complete ionisation for elements with IE below ~8 eV. The plasma is sampled through a ~1 mm <b>sampler</b> into a supersonic expansion; the <b>skimmer</b> passes the jet’s core into high vacuum, where the dense ion beam suffers <b>space-charge</b> repulsion that preferentially loses light ions → the strong (≈ 1–2 %/u at low mass) instrumental mass bias of MC-ICP-MS.'));
    const ctl = section('Saha ionization in the ICP', { icon: '⚙' });
    const tS = slider({ label: 'Ionization temperature', min: 5500, max: 9500, step: 50, value: 7500, unit: 'K', onInput: debounce(() => update(), 40) });
    const nS = slider({ label: 'Electron density n_e', min: 1e14, max: 3e15, log: true, value: 1e15, fmt: (v) => `${v.toExponential(1)} cm⁻³`, onInput: debounce(() => update(), 40) });
    const ro = readouts([{ id: 'K', label: 'K' }, { id: 'Fe', label: 'Fe' }, { id: 'Se', label: 'Se' }, { id: 'Hg', label: 'Hg' }]);
    ctl.body.append(tS.el, nS.el, ro.el);
    const chS = new Chart(ctl.body, { height: 200, xLabel: 'first ionization energy (eV)', yLabel: 'ion fraction', yMin: 0, yMax: 1.05, legend: false });
    const lblBox = h('div', { class: 'src' });
    ctl.body.append(lblBox, note('LTE Saha with partition-function ratios set to 1; real ICPs deviate from LTE, so treat values as first-order.', 'warn'));
    const mb = section('Space-charge mass bias', { icon: '⚖' });
    const bS = slider({ label: 'Exponential-law β', min: 0.5, max: 3, step: 0.05, value: 2, onInput: debounce(() => update(), 40) });
    mb.body.append(bS.el);
    const chM = new Chart(mb.body, { height: 160, xLabel: 'mass (u)', yLabel: 'bias per u (%)', xLog: true, legend: false });
    mb.body.append(para('For a given β the per-mass-unit bias scales as β/m: ~5 % per u for Li, ~1 % for Fe, ~0.2 % for U — which is why light-element isotope ratios demand careful bracketing.'));
    const src = section('Sources', { icon: '☰', open: false });
    src.body.append(sources([SOURCES.belshaw, SOURCES.sapphire]), para('<span class="src">Houk (1986) Anal. Chem. 58:97A (ICP ionization); NIST ASD ionization energies.</span>'));

    function update() {
      const T = tS.get(), ne = nS.get() * 1e6;
      const els = Object.entries(IE).filter(([k]) => k !== 'Ar');
      chS.setSeries([
        { color: '#3b82f6', x: els.map(([, v]) => v), y: els.map(([, v]) => icpIonFraction(v, { T, ne })), type: 'scatter', r: 3.5 },
        { color: '#94a3b8', x: Array.from({ length: 60 }, (_, i) => 3.5 + i * 0.12), y: Array.from({ length: 60 }, (_, i) => icpIonFraction(3.5 + i * 0.12, { T, ne })), width: 1.5 },
      ]);
      for (const k of ['K', 'Fe', 'Se', 'Hg']) ro[k].set(`${(icpIonFraction(IE[k], { T, ne }) * 100).toFixed(1)} %`);
      lblBox.textContent = 'Points: ' + els.map(([k, v]) => `${k} ${(icpIonFraction(v, { T, ne }) * 100).toFixed(0)}%`).join(' · ');
      const ms = Array.from({ length: 60 }, (_, i) => Math.pow(10, Math.log10(6) + (i / 59) * Math.log10(240 / 6)));
      chM.setSeries([{ color: '#ef4444', x: ms, y: ms.map((m) => biasPerAmuPercent(m, bS.get())), width: 2 }]);
    }
    update();

    return {
      root, exploder: ex, panel: [intro.el, ctl.el, mb.el, src.el],
      camera: { position: [-0.02, 0.25, 0.34], target: [-0.04, 0.12, 0] }, scale: 0.4, defaults: { xray: true },
      dispose() { chS.dispose(); chM.dispose(); },
    };
  },
};
