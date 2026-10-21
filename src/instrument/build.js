// Assemble the Sapphire-type MC-ICP-MS from components + the traced double-focusing optics.
// 2-D optics frame (optics.js layout) → world (x, Hb, −y) via geom.toWorld.
import * as THREE from 'three';
import { M, ISOTOPE_COLORS } from '../core/materials.js';
import { mesh, roundedBox, toWorld, yawFromDir2D, tubeShell, wire, plateWithSlit } from '../core/geom.js';
import { Exploder } from '../core/explode.js';
import { IonBeam } from '../core/beam.js';
import { designAchromat, layout, traceIon, lateralAtFocus, coefficients, v2 } from '../physics/optics.js';
import { makeSector } from '../physics/sector.js';
import { SYSTEMS } from '../physics/isotopes.js';
import { buildESA } from '../components/esa.js';
import { buildICP, buildHexapole } from '../components/plasma.js';
import { buildSectorMagnet } from '../components/magnet.js';
import { buildFaradayLite, buildIonCounterLite } from '../components/faraday.js';
import { buildTurboPump, buildIonPump, buildScrollPump } from '../components/vacuum.js';
import { registerParts } from '../components/parts.js';
import { SAPPHIRE } from './specs.js';

const { add, sub, mul, dot, len } = v2;
const ang = (d) => Math.atan2(d[1], d[0]);

let _design = null;
export function sapphireDesign() {
  if (_design) return _design;
  const d = designAchromat(SAPPHIRE.optics);
  const L = layout(d, { esaGap: 0.02 });
  const c = coefficients(d);
  _design = { d, L, D: c.xm, mag: c.xx };
  return _design;
}

/** Choose cups-per-amu s and zoom z for a fixed-pitch array. */
export function zoomPlan(naturalPitch, pitch, isoOffsets, nCups = 16) {
  let best = null;
  for (const s of [1, 2, 3]) {
    const span = Math.max(...isoOffsets.map((o) => Math.abs(o))) * s;
    if (span > nCups / 2) continue;
    const z = (s * pitch) / naturalPitch;
    const score = Math.abs(Math.log(z));
    if (!best || score < best.score) best = { s, z, score };
  }
  return best ?? { s: 1, z: pitch / naturalPitch };
}

export function buildSapphire(o = {}) {
  const { label = () => {}, Hb = 1.1 } = o;
  const { d, L, D } = sapphireDesign();
  const root = new THREE.Group();
  root.name = 'Nu Sapphire (model)';
  const ex = new Exploder();
  const features = {};
  const state = { element: o.element || 'K', path: o.path || 'cell', zoomManual: null };

  // ---- dual-path transfer region (2-D) ----
  const xS = L.S[0];
  const xSampler = xS - 0.8;
  const xA = xS - 0.62, xB = xS - 0.14; // deflection points
  const yCell = -0.14; // CRC branch offset (2-D y) → world +z
  const cellA = [xA + 0.1, yCell], cellB = [xB - 0.1, yCell];
  const hePath = [[xSampler + 0.06, 0], [xS, 0]];
  const crcPath = [[xSampler + 0.06, 0], [xA, 0], cellA, cellB, [xB, 0], [xS, 0]];

  // ---- plasma source ----
  const icp = buildICP();
  icp.group.position.copy(toWorld([xSampler, 0], Hb));
  root.add(icp.group);
  registerParts(ex, icp.parts, { orderOffset: 0.2, orderScale: 0.6 });
  ex.add(icp.group, [-0.25, 0, 0], { name: 'ICP source & interface', info: 'Ar ICP at atmospheric pressure, sampler and skimmer cones, extraction to 6 kV.', order: 0.15 });
  label(icp.group, 'ICP source', { sub: 'torch · cones · extraction', offset: [-0.06, 0.13, 0] });
  features.icp = icp.group;

  // ---- transfer optics housing + deflectors ----
  const tr = new THREE.Group();
  const trBox = mesh(roundedBox(xB - xA + 0.16, 0.16, 0.3, 0.012), M.steelBrushed(), { name: 'transfer optics chamber' });
  trBox.position.copy(toWorld([(xA + xB) / 2, yCell / 2], Hb));
  tr.add(trBox);
  root.add(tr);
  ex.add(tr, [0, 0.45, 0], { name: 'Transfer-optics chamber', info: 'Houses the path-switching deflectors, the hexapole cell and the lenses that bring ions back onto the analyser axis.', shell: true, order: 0.1 });
  const defl = new THREE.Group();
  for (const [x, nm] of [[xA, 'Path-switch deflector 1'], [xB, 'Path-switch deflector 2']]) {
    for (const s of [-1, 1]) {
      const p = mesh(new THREE.BoxGeometry(0.05, 0.03, 0.003), M.steelPolished(), { name: nm });
      p.position.copy(toWorld([x, s * 0.012 + (x === xA ? -0.01 : -0.01)], Hb));
      p.rotation.y = 0.45 * (x === xA ? 1 : -1);
      defl.add(p);
    }
  }
  root.add(defl);
  ex.add(defl, [0, 0.18, 0], { name: 'Path-switch deflectors', info: 'Electrostatic deflectors that either let the 6 keV beam continue on the conventional (high-energy) path or steer it off-axis into the low-energy collision/reaction-cell path (Nu Sapphire “dual path”).', order: 0.5 });
  features.deflectors = defl;

  const cell = buildHexapole({ L: 0.16 });
  cell.group.position.copy(toWorld([(cellA[0] + cellB[0]) / 2, yCell], Hb));
  root.add(cell.group);
  registerParts(ex, cell.parts, { orderOffset: 0.4, orderScale: 0.5 });
  ex.add(cell.group, [0, 0.25, 0.25], { name: 'Hexapole collision/reaction cell', info: 'Low-energy path: ions are decelerated to a few eV, collide/react with He and H₂ (removing ArH⁺, Ar⁺, Ar₂⁺, ArO⁺…), are thermalised (small energy spread) and re-accelerated to 6 keV. See the “Collision/reaction cell” scene.', order: 0.3 });
  label(cell.group, 'Hexapole CRC', { sub: 'He / H₂', offset: [0, 0.06, 0] });
  features.cell = cell.group;

  // source slit plate
  const sl = mesh(plateWithSlit(0.06, 0.06, 0.002, 0.0003, 0.008), M.steel(), { name: 'source slit' });
  sl.position.copy(toWorld([xS, 0], Hb));
  sl.rotation.y = Math.PI / 2;
  root.add(sl);
  ex.add(sl, [0, 0.1, 0], { name: 'Source (object) slit', info: 'Defines the object of the double-focusing analyser. Narrow slit positions select LR / MR / HR (Sapphire: LR, MR, HR standard).', order: 0.6 });

  // ---- flight tubes ----
  const mkTube = (a2, b2, name, r = 0.02) => {
    const a = toWorld(a2, Hb), b = toWorld(b2, Hb);
    const m = mesh(tubeShell(r, r - 0.0015, a.distanceTo(b), 32), M.steelBrushed(), { name });
    m.position.copy(a).lerp(b, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    m.userData.shell = true;
    m.userData.part = { name, info: 'Field-free drift region in UHV.' };
    root.add(m);
    return m;
  };
  mkTube([xS + 0.01, 0], [-0.03, 0], 'drift: source slit → ESA');
  mkTube(add(L.E2, mul(L.dE2, 0.03)), add(L.M1, mul(L.dE2, -0.15)), 'drift: ESA → magnet');
  mkTube(add(L.M2, mul(L.dM2, 0.15)), add(L.F, mul(L.dM2, -0.06)), 'drift: magnet → collector', 0.03);

  // ---- ESA ----
  const esa = buildESA({ a: d.a, phi: d.phiE, beamY: Hb });
  root.add(esa.group);
  registerParts(ex, esa.parts, { orderOffset: 0.1, orderScale: 0.6 });
  features.esa = esa.group;
  {
    const t = new THREE.Object3D();
    t.position.copy(toWorld([d.a * Math.sin(d.phiE / 2), d.a - d.a * Math.cos(d.phiE / 2)], Hb + 0.1));
    esa.group.add(t);
    label(t, `ESA ${(d.phiE * 180 / Math.PI).toFixed(0)}°, a = ${(d.a * 100).toFixed(0)} cm`, { sub: 'energy focusing' });
  }

  // ---- magnet ----
  const sector = makeSector({ R0: d.R, phi: d.phiM });
  const mag = buildSectorMagnet(sector, { beamY: Hb, gap: 0.014, poleThickness: 0.04 });
  const mg = new THREE.Group();
  mg.add(mag.group);
  mg.position.set(L.M1[0], 0, -L.M1[1]);
  mg.rotation.y = ang(L.dE2);
  root.add(mg);
  registerParts(ex, mag.parts, { orderOffset: 0.15, orderScale: 0.5 });
  features.magnet = mg;
  {
    const t = new THREE.Object3D();
    t.position.copy(toWorld([d.R * Math.sin(d.phiM / 2), d.R - d.R * Math.cos(d.phiM / 2)], Hb + 0.12));
    mag.halves.top.add(t);
    label(t, `Magnet ${(d.phiM * 180 / Math.PI).toFixed(0)}°, R = ${(d.R * 100).toFixed(0)} cm`, { sub: 'laminated · mass dispersion' });
  }

  // ---- zoom lens ----
  const zPos = add(L.M2, mul(L.dM2, d.L3 * 0.55));
  const zoom = new THREE.Group();
  for (let q = 0; q < 2; q++) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const r = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.03, 16), M.steelPolished(), { name: 'zoom quadrupole rod' });
      r.position.set(Math.cos(a) * 0.017, (q - 0.5) * 0.045, Math.sin(a) * 0.017);
      zoom.add(r);
    }
  }
  zoom.add(mesh(tubeShell(0.035, 0.032, 0.1, 40), M.steel(), { name: 'zoom lens housing' }));
  zoom.position.copy(toWorld(zPos, Hb));
  zoom.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), toWorld(L.dM2, 0).normalize());
  root.add(zoom);
  ex.add(zoom, [0, 0.22, 0], { name: 'Zoom optics (quadrupole pair)', info: 'Two quadrupole lenses after the magnet change the effective dispersion so that the isotopes of each element land on the fixed collector array (Belshaw et al. 1998; Nu “zoom optics”).', order: 0.45 });
  label(zoom, 'Zoom optics', { offset: [0, 0.06, 0] });
  features.zoom = zoom;

  // ---- collector housing ----
  const coll = new THREE.Group();
  const cbox = mesh(roundedBox(0.16, 0.18, 0.22, 0.012), M.steelBrushed(), { name: 'collector housing' });
  coll.add(cbox);
  coll.position.copy(toWorld(add(L.F, mul(L.dM2, 0.06)), Hb));
  coll.rotation.y = yawFromDir2D(L.dM2);
  root.add(coll);
  ex.add(coll, [0, 0.4, 0], { name: 'Multicollector housing', info: '16 fixed Faraday cups (standard) plus optional ion counters with energy filters (Nu Sapphire).', shell: true, order: 0.1 });
  label(coll, '16 Faraday + ICs', { offset: [0, 0.12, 0] });
  features.collector = coll;
  const amp = mesh(roundedBox(0.14, 0.2, 0.26, 0.01), M.panel(0x6c7684), { name: 'amplifier housing' });
  const outward = [L.dM2[1], -L.dM2[0]];
  amp.position.copy(toWorld(add(add(L.F, mul(L.dM2, 0.06)), mul(outward, 0.2)), Hb));
  amp.rotation.y = yawFromDir2D(L.dM2);
  root.add(amp);
  ex.add(amp, [toWorld(mul(outward, 0.3), 0).x, 0.05, toWorld(mul(outward, 0.3), 0).z], { name: 'Faraday amplifier housing', info: 'Software-switchable dual-resistor pre-amplifiers; 10¹⁰, 10¹² and 10¹³ Ω optional (Nu Sapphire).', order: 0.2 });

  // ---- pumps ----
  const pumpAt = (builder, opts, p2, y, name, info, off) => {
    const pmp = builder(opts);
    pmp.group.position.copy(toWorld(p2, y));
    root.add(pmp.group);
    registerParts(ex, pmp.parts, { orderOffset: 0.4, orderScale: 0.3 });
    ex.add(pmp.group, off, { name, info, order: 0.2 });
    return pmp;
  };
  const t1 = pumpAt(buildTurboPump, { speed: 300 }, [(xA + xB) / 2, yCell / 2], Hb - 0.08, 'Transfer-region turbo pump', 'Differential pumping of the transfer optics and cell region.', [0, -0.3, 0]);
  pumpAt(buildIonPump, { speed: 75 }, add(L.E2, mul(L.dE2, 0.15)), Hb - 0.02, 'Analyser ion pump', 'UHV for the ESA–magnet section.', [0, -0.3, 0]);
  pumpAt(buildIonPump, { speed: 75 }, add(L.F, mul(L.dM2, 0.1)), Hb - 0.09, 'Collector ion pump', 'UHV at the collectors (low scattering → abundance sensitivity).', [0, -0.3, 0]);
  const sc = buildScrollPump();
  sc.group.position.set(xSampler + 0.1, 0.12, 0.25);
  root.add(sc.group);
  registerParts(ex, sc.parts);
  ex.add(sc.group, [0, 0, 0.3], { name: 'Interface rotary/scroll pump', info: 'Pumps the expansion stage behind the sampler (~1–3 mbar).', order: 0.2 });
  features.turbo = t1.group;

  // ---- dynamic: cups, beams ----
  const dyn = new THREE.Group();
  root.add(dyn);
  let readout = {};

  function rebuildDynamic() {
    ex.removeUnder(dyn);
    for (const c of [...dyn.children]) { dyn.remove(c); c.traverse((q) => { if (q.isCSS2DObject) q.element.remove(); q.geometry?.dispose?.(); }); }
    const sys = SYSTEMS[state.element];
    const iso = sys.isotopes;
    const ref = iso.reduce((a, b) => (b.ab > a.ab ? b : a));
    const offs = iso.map((I) => Math.round(I.m - ref.m));
    const ma = ref.m + (Math.max(...offs) + Math.min(...offs)) / 2; // centre the set on the axis
    const natural = (m) => lateralAtFocus(L, traceIon(d, L, { mu: m / ma, ds: 0.002 }));
    const natPitch = Math.abs(natural(ma + 1) - natural(ma));
    const offsC = iso.map((I) => I.m - ma);
    const plan = state.zoomManual ? { s: zoomPlan(natPitch, SAPPHIRE.cupPitch, offsC).s, z: state.zoomManual } : zoomPlan(natPitch, SAPPHIRE.cupPitch, offsC);
    readout = { natPitch, plan, ma, D };
    // 16 cups centred on the axis
    const pitch = SAPPHIRE.cupPitch;
    const nC = SAPPHIRE.nFaraday;
    const cups = [];
    for (let i = 0; i < nC; i++) {
      const k = i - nC / 2;
      const lat = k * pitch;
      const p = add(L.F, mul(outward, lat));
      const cup = buildFaradayLite({ width: pitch * 0.8, height: 0.018, depth: 0.028 });
      cup.group.position.copy(toWorld(p, Hb));
      cup.group.rotation.y = yawFromDir2D(L.dM2);
      dyn.add(cup.group);
      const name = k === 0 ? 'Ax' : k < 0 ? `L${-k}` : `H${k}`;
      cups.push({ k, lat, name, group: cup.group });
      ex.add(cup.group, [toWorld(mul(outward, lat * 6), 0).x, 0.06, toWorld(mul(outward, lat * 6), 0).z], { name: `Faraday ${name}`, info: `Fixed cup at ${(lat * 1000).toFixed(1)} mm from the array centre (2.5 mm spacing).`, order: 0.55 });
    }
    // ion counters on the low-mass side behind energy filters
    for (let j = 0; j < SAPPHIRE.nIC; j++) {
      const lat = -(nC / 2 + 1.8 + j * 1.8) * pitch;
      const ic = buildIonCounterLite({ width: 0.007, height: 0.018, depth: 0.03 });
      ic.group.position.copy(toWorld(add(add(L.F, mul(outward, lat - j * 0.004)), mul(L.dM2, 0.015)), Hb));
      ic.group.rotation.y = yawFromDir2D(L.dM2);
      dyn.add(ic.group);
      ex.add(ic.group, [toWorld(mul(outward, -0.08), 0).x, 0.1, toWorld(mul(outward, -0.08), 0).z], { name: `Ion counter IC${j + 1} (+ energy filter)`, info: 'Discrete-dynode SEM (or Daly) behind a deceleration filter for low-abundance isotopes (²³⁴U, ²³⁰Th…).', order: 0.6 });
    }
    // beams: trunk along the selected path, then traced isotopes through ESA + magnet
    const path = state.path === 'cell' ? crcPath : hePath;
    const trunk = new IonBeam(path.map((p) => toWorld(p, Hb)), { color: state.path === 'cell' ? 0x9ad8ff : 0xffffff, radius: 0.0022, particles: 30, speed: 0.4, opacity: 0.5, size: 0.007 });
    dyn.add(trunk);
    const total = iso.reduce((a, b) => a + b.ab, 0);
    const zStart = dot(sub(zPos, L.M2), L.dM2);
    const zoomed = (pts) => pts.map((p) => {
      const s = dot(sub(p, L.M2), L.dM2);
      if (s <= zStart) return p;
      const ramp = Math.min(1, (s - zStart) / Math.max(1e-6, d.L3 - zStart));
      const lat = dot(sub(p, L.F), outward) - dot(sub(L.M2, L.F), outward) * 0; // lateral wrt axis line
      const axisLat = dot(sub(add(L.M2, mul(L.dM2, s)), L.F), outward);
      const rel = lat - axisLat;
      return add(p, mul(outward, rel * (plan.z - 1) * ramp));
    });
    iso.forEach((I, idx) => {
      const r = traceIon(d, L, { mu: I.m / ma, ds: 0.002, after: 0.02 });
      const pts = zoomed(r.pts).map((p) => toWorld(p, Hb));
      const ab = I.ab / total;
      const b = new IonBeam(pts, { color: ISOTOPE_COLORS[idx % ISOTOPE_COLORS.length], radius: 0.0007 + 0.0016 * Math.cbrt(ab), particles: Math.max(6, Math.round(24 * Math.cbrt(ab))), speed: 0.45, opacity: 0.25 + 0.5 * Math.cbrt(ab), size: 0.0055 });
      dyn.add(b);
      const tip = new THREE.Object3D();
      tip.position.copy(pts[pts.length - 1].clone().add(new THREE.Vector3(0, 0.014 + idx * 0.012, 0)));
      dyn.add(tip);
      label(tip, I.name, { className: 'callout' });
    });
    // interference beams (only survive on the high-energy path)
    if (state.path !== 'cell') {
      sys.interferences.filter((f) => f.kind !== 'tail' && f.kind !== 'isobar').forEach((f) => {
        const r = traceIon(d, L, { mu: f.m / ma, ds: 0.002, after: 0.02 });
        const b = new IonBeam([...[...hePath].map((p) => toWorld(p, Hb + 0.002)), ...zoomed(r.pts).map((p) => toWorld(p, Hb + 0.002))], { color: 0xff4d4d, radius: 0.0012, particles: 14, speed: 0.4, opacity: 0.55, size: 0.005 });
        dyn.add(b);
      });
    } else {
      // interferences die in the cell: short red stubs ending inside the hexapole
      sys.interferences.filter((f) => f.kind !== 'tail' && f.kind !== 'isobar').forEach(() => {
        const b = new IonBeam([...crcPath.slice(0, 3), [cellA[0] + 0.07, yCell]].map((p) => toWorld(p, Hb + 0.003)), { color: 0xff4d4d, radius: 0.0012, particles: 10, speed: 0.4, opacity: 0.55, size: 0.005 });
        dyn.add(b);
      });
    }
    ex.set(ex.t);
  }
  rebuildDynamic();

  // ---- cabinet ----
  const bb = new THREE.Box3().setFromObject(root);
  const tableTop = Hb - 0.3, mrg = 0.08;
  const fx0 = bb.min.x - mrg, fx1 = bb.max.x + mrg, fz0 = bb.min.z - mrg, fz1 = bb.max.z + mrg;
  const cxm = (fx0 + fx1) / 2, czm = (fz0 + fz1) / 2, W = fx1 - fx0, Dp = fz1 - fz0;
  const cab = new THREE.Group();
  root.add(cab);
  const panelMat = M.panel(0xeef0f2), trimMat = M.panel(0x4b5563);
  for (const P of [
    { w: W, d: 0.018, pos: [cxm, tableTop / 2, fz1], off: [0, 0, 0.8], name: 'Front panel' },
    { w: W, d: 0.018, pos: [cxm, tableTop / 2, fz0], off: [0, 0, -0.8], name: 'Rear panel' },
    { w: 0.018, d: Dp, pos: [fx0, tableTop / 2, czm], off: [-0.8, 0, 0], name: 'Left side panel' },
    { w: 0.018, d: Dp, pos: [fx1, tableTop / 2, czm], off: [0.8, 0, 0], name: 'Right side panel' },
  ]) {
    const g = new THREE.Group();
    g.add(mesh(roundedBox(P.w, tableTop - 0.02, P.d, 0.006), panelMat, { name: P.name }));
    const trm = mesh(new THREE.BoxGeometry(P.w + 0.002, 0.035, P.d + 0.002), trimMat, { name: 'trim' });
    trm.position.y = tableTop / 2 - 0.09;
    g.add(trm);
    g.position.set(...P.pos);
    cab.add(g);
    ex.add(g, P.off, { name: `Cabinet ${P.name.toLowerCase()}`, info: 'Instrument covers. Inside: RF generator, HV supplies, magnet supply, pumps and vacuum controllers.', shell: true, order: 0 });
  }
  {
    const sh = new THREE.Shape();
    sh.moveTo(-W / 2, -Dp / 2); sh.lineTo(W / 2, -Dp / 2); sh.lineTo(W / 2, Dp / 2); sh.lineTo(-W / 2, Dp / 2); sh.closePath();
    const hole = new THREE.Path(); const bw = 0.07;
    hole.moveTo(-W / 2 + bw, -Dp / 2 + bw); hole.lineTo(-W / 2 + bw, Dp / 2 - bw); hole.lineTo(W / 2 - bw, Dp / 2 - bw); hole.lineTo(W / 2 - bw, -Dp / 2 + bw); hole.closePath();
    sh.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.025, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    const rim = mesh(g, M.panel(0x8d96a2), { name: 'table frame' });
    rim.position.set(cxm, tableTop - 0.025, czm);
    cab.add(rim);
  }

  return {
    root, exploder: ex, features, state, design: { d, L, D },
    readout: () => readout,
    setElement(e) { state.element = e; state.zoomManual = null; rebuildDynamic(); },
    setPath(p) { state.path = p; rebuildDynamic(); },
    setZoom(z) { state.zoomManual = z; rebuildDynamic(); },
    update(dt) { t1.update(dt, true); },
    geometry: { xS, xA, xB, yCell, cellA, cellB, Hb },
  };
}
