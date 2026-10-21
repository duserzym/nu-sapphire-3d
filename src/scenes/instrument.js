// Full Sapphire-type MC-ICP-MS with switchable high-energy / collision-cell paths.
import * as THREE from 'three';
import { buildSapphire, sapphireDesign } from '../instrument/build.js';
import { SAPPHIRE, SOURCES } from '../instrument/specs.js';
import { SYSTEMS, requiredResolution } from '../physics/isotopes.js';
import { section, segmented, slider, readouts, note, para, table, sources, h, buttons } from '../core/ui.js';

const hashParam = (k) => new URLSearchParams(location.hash.slice(1)).get(k);

export default {
  id: 'instrument',
  title: 'Nu Sapphire MC-ICP-MS',
  group: 'Instrument',
  icon: '⌬',
  blurb: 'Dual-path MC-ICP-MS: plasma → cell or bypass → ESA + magnet → zoom → 16 Faradays',
  async create(ctx) {
    const { app } = ctx;
    let element = SYSTEMS[hashParam('element')] ? hashParam('element') : 'K';
    const path0 = hashParam('path') === 'he' ? 'he' : 'cell';
    const inst = buildSapphire({ label: ctx.label, element, path: path0 });
    const root = new THREE.Group();
    root.add(inst.root);
    const { d, D } = sapphireDesign();

    const intro = section('Nu Sapphire (model)', { icon: '⌬' });
    intro.body.append(para('A multicollector ICP-MS whose ion beam can either take the conventional <b>high-energy path</b> (6 keV, straight to the analyser) or be deflected into a <b>low-energy path</b> through a hexapole <b>collision/reaction cell</b> that strips plasma-based molecular interferences (ArH⁺, Ar⁺, Ar₂⁺, ArO⁺) before the ions are re-accelerated. A Nier–Johnson ESA + magnet then focuses in both angle and energy, zoom optics set the dispersion, and 16 fixed Faradays collect the isotopes simultaneously.'));

    const ctl = section('Beam path & element', { icon: '⚙' });
    const pathSeg = segmented({ options: [{ value: 'cell', label: 'Low-energy · collision cell' }, { value: 'he', label: 'High-energy · bypass' }], value: path0, onChange: (v) => { inst.setPath(v); refresh(); app.applyBeams(); } });
    const elSeg = segmented({ options: Object.keys(SYSTEMS).map((k) => ({ value: k, label: k })), value: element, onChange: (v) => { element = v; inst.setElement(v); zoomS.set(inst.readout().plan.z); refresh(); app.applyBeams(); } });
    const zoomS = slider({ label: 'Zoom factor (dispersion magnification)', min: 0.4, max: 3.2, step: 0.005, value: 1, fmt: (v) => `× ${v.toFixed(3)}`, onInput: (v) => { inst.setZoom(v); refresh(); app.applyBeams(); } });
    const ro = readouts([
      { id: 'D', label: 'Mass dispersion D (traced)' }, { id: 'pitch', label: '1 u at the array (natural)' },
      { id: 'plan', label: 'Zoom plan' }, { id: 'mode', label: 'Path' },
      { id: 'res', label: 'Resolution needed (worst interference)', wide: true },
    ]);
    const intTable = h('div');
    ctl.body.append(pathSeg.el, h('div', { class: 'ctl' }, h('label', {}, 'Isotope system')), elSeg.el, zoomS.el, ro.el, intTable,
      note('Red beams are plasma-based interferences. On the high-energy path they reach the cups at essentially the same position as the analyte (low resolution cannot separate them); through the cell they are removed by reaction with H₂ / collisions with He.'));

    const tour = section('Guided tour', { icon: '➜', open: false });
    const stops = [['Plasma', 'icp'], ['Cell', 'cell'], ['ESA', 'esa'], ['Magnet', 'magnet'], ['Zoom', 'zoom'], ['Collector', 'collector']];
    tour.body.append(buttons(stops.map(([lbl, key]) => ({ label: lbl, onClick: () => {
      const b = new THREE.Box3().setFromObject(inst.features[key]); const c = b.getCenter(new THREE.Vector3()); const r = Math.max(0.3, b.getSize(new THREE.Vector3()).length() * 1.4);
      app.flyTo([c.x + r * 0.4, c.y + r * 0.7, c.z + r * 0.9], c.toArray());
    } }))).el);

    const specCard = section('Specifications & provenance', { icon: '☰', open: false });
    specCard.body.append(
      table(['Item', 'Value', ''], SAPPHIRE.specs.map(([k, v, ok, src]) => [k, v, ok ? `<a class="tag v" href="${SOURCES[src].url}" target="_blank" rel="noopener">source</a>` : '<span class="tag a">assumed</span>'])),
      sources(Object.values(SOURCES)),
    );

    function refresh() {
      const r = inst.readout();
      const sys = SYSTEMS[element];
      ro.D.set(`${(D * 100).toFixed(1)} cm per unit Δm/m`);
      ro.pitch.set(`${(r.natPitch * 1000).toFixed(2)} mm`);
      ro.plan.set(`every ${r.plan.s === 1 ? '' : r.plan.s + 'nd '}cup · z = ${r.plan.z.toFixed(2)}`);
      ro.mode.set(inst.state.path === 'cell' ? 'CRC (low energy)' : 'Conventional (6 keV)');
      const worst = sys.interferences.filter((f) => f.kind !== 'tail').map((f) => {
        const I = sys.isotopes.find((i) => i.name === f.on);
        return { f, R: requiredResolution(I.m, f.m) };
      });
      const w = worst.reduce((a, b) => (b.R > (a?.R ?? 0) ? b : a), null);
      ro.res.set(w ? `${w.f.name} on ${w.f.on}: m/Δm ≈ ${Math.round(w.R).toLocaleString()}` : '—', w && w.R > 10000 ? 'warn' : '');
      intTable.replaceChildren(table(['On', 'Interference', 'm/Δm', 'Note'], worst.map((x) => [x.f.on, x.f.name, Math.round(x.R).toLocaleString(), x.f.note]), { numCols: [2] }), para(`<span class="src">${sys.showcase}</span>`));
    }
    zoomS.set(inst.readout().plan.z);
    refresh();

    const box = new THREE.Box3().setFromObject(root);
    const c = box.getCenter(new THREE.Vector3());
    return {
      root, exploder: { set: (t) => inst.exploder.set(t) },
      panel: [intro.el, ctl.el, tour.el, specCard.el],
      camera: { position: [c.x - 0.15, c.y + 2.75, c.z + 2.35], target: [c.x - 0.05, c.y + 0.2, c.z - 0.05] },
      scale: 2.6, defaults: { xray: true },
      update(dt) { inst.update(dt); },
    };
  },
};
