// ICP torch, load coil, plasma, cones and interface. Local frame: ions travel +X;
// the sampler-cone orifice sits at the local origin; +Y up.
import * as THREE from 'three';
import { M } from '../core/materials.js';
import { mesh, tubeShell, rod, roundedBox, cfFlange, wire } from '../core/geom.js';
import { part } from './parts.js';

const mm = 1e-3;

/** Cone (sampler/skimmer) as a lathe around +X with orifice at x = 0. */
function coneGeo(baseR, height, orificeR, thick = 1.2 * mm, flangeR = null) {
  const pts = [
    new THREE.Vector2(orificeR, 0), new THREE.Vector2(baseR, height),
  ];
  if (flangeR) { pts.push(new THREE.Vector2(flangeR, height)); pts.push(new THREE.Vector2(flangeR, height + thick * 3)); pts.push(new THREE.Vector2(baseR - thick, height + thick * 3)); }
  pts.push(new THREE.Vector2(baseR - thick, height + thick), new THREE.Vector2(orificeR + thick * 0.4, thick * 0.6), new THREE.Vector2(orificeR, 0));
  const g = new THREE.LatheGeometry(pts, 48);
  g.rotateZ(-Math.PI / 2); // lathe axis +Y → +X: orifice at x = 0 points towards the plasma (−X)
  return g;
}

/** Plasma: nested glowing teardrops coloured by temperature zone. */
function plasmaMesh() {
  const g = new THREE.Group();
  const zones = [
    { r: 9 * mm, L: 34 * mm, color: 0xff7a3d, op: 0.45, name: 'initial radiation zone (~10 000 K)' },
    { r: 7 * mm, L: 26 * mm, color: 0xffd27a, op: 0.6, name: 'normal analytical zone (~6500–7500 K)' },
    { r: 2.2 * mm, L: 40 * mm, color: 0x9ad8ff, op: 0.8, name: 'central (aerosol) channel' },
  ];
  for (const z of zones) {
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const u = i / 24;
      pts.push(new THREE.Vector2(z.r * Math.sin(Math.PI * Math.min(1, u * 1.15)) * (1 - 0.35 * u), u * z.L));
    }
    const geo = new THREE.LatheGeometry(pts, 40);
    geo.rotateZ(-Math.PI / 2);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: z.color, transparent: true, opacity: z.op, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    m.name = z.name;
    m.renderOrder = 20;
    g.add(m);
  }
  {
    const light = new THREE.PointLight(0xffa860, 0.35, 0.25, 2);
    light.position.set(0.02, 0, 0);
    g.add(light);
  }
  return g;
}

export function buildICP({ samplerX = 0, box: withBox = true } = {}) {
  const group = new THREE.Group();
  group.name = 'ICP source & interface';
  const parts = [];
  // torch: three concentric quartz tubes along +X, ending ~12 mm before the sampler
  const torch = new THREE.Group();
  const tEnd = -12 * mm;
  const tubes = [
    { ro: 9 * mm, ri: 8 * mm, L: 100 * mm, name: 'outer (plasma) tube' },
    { ro: 6.5 * mm, ri: 5.6 * mm, L: 80 * mm, name: 'auxiliary tube' },
    { ro: 1.5 * mm, ri: 0.75 * mm, L: 95 * mm, name: 'injector' },
  ];
  // simple transparent glass (no transmission pass) so the plasma glow shows through
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xe6f3ff, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0, depthWrite: false, name: 'fused quartz' });
  for (const tb of tubes) {
    const m = mesh(tubeShell(tb.ro, tb.ri, tb.L, 40), glass, { name: tb.name });
    m.rotation.z = Math.PI / 2;
    m.position.x = tEnd - tb.L / 2 - (tb.name === 'auxiliary tube' ? 18 * mm : tb.name === 'injector' ? 8 * mm : 0);
    torch.add(m);
  }
  group.add(torch);
  // load coil: 3-turn copper helix around the torch end
  const coilPts = [];
  for (let i = 0; i <= 120; i++) {
    const th = (i / 120) * Math.PI * 2 * 3;
    coilPts.push(new THREE.Vector3(tEnd - 26 * mm + (i / 120) * 18 * mm, 13 * mm * Math.cos(th), 13 * mm * Math.sin(th)));
  }
  const coil = wire(coilPts, 1.6 * mm, M.copper(), { seg: 360 });
  coil.name = 'RF load coil';
  group.add(coil);
  const plasma = plasmaMesh();
  plasma.position.x = tEnd - 30 * mm;
  group.add(plasma);
  // torch box (shell)
  const box = mesh(roundedBox(0.22, 0.2, 0.2, 0.01), M.panel(0xe8ebef), { name: 'torch box' });
  box.position.set(-0.09, 0, 0);
  const boxG = new THREE.Group(); boxG.add(box);
  if (withBox) group.add(boxG);
  // cones
  const sampler = mesh(coneGeo(16 * mm, 12 * mm, 0.5 * mm, 1.2 * mm, 22 * mm), M.platinum(), { name: 'sampler cone' });
  sampler.position.x = samplerX;
  const skimmer = mesh(coneGeo(9 * mm, 10 * mm, 0.4 * mm, 1.0 * mm, 14 * mm), M.platinum(), { name: 'skimmer cone' });
  skimmer.position.x = samplerX + 8 * mm;
  group.add(sampler, skimmer);
  // interface block (water-cooled) and expansion chamber
  const iface = new THREE.Group();
  const ifb = cfFlange(0.12, 0.016, 0.045, 8, M.copper(), M.steelPolished());
  ifb.rotation.y = Math.PI / 2;
  ifb.position.x = samplerX + 13 * mm;
  iface.add(ifb);
  const exp = mesh(tubeShell(0.04, 0.036, 0.06, 40), M.steelBrushed(), { name: 'expansion chamber' });
  exp.rotation.z = Math.PI / 2;
  exp.position.x = samplerX + 0.05;
  iface.add(exp);
  group.add(iface);
  // extraction lens (negative, accelerates ions to the analyser potential)
  const lens = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const r = mesh(tubeShell(0.012, 0.004, 0.004, 32), M.steelPolished(), { name: 'extraction lens element' });
    r.rotation.z = Math.PI / 2;
    r.position.x = samplerX + 0.035 + i * 0.012;
    lens.add(r);
  }
  group.add(lens);

  if (withBox) parts.push(part(boxG, [-0.05, 0.3, 0], 'Torch box', 'Shielded enclosure (RF and UV) around the torch.', { shell: true, order: 0 }));
  parts.push(part(torch, [-0.16, 0, 0.1], 'ICP torch (quartz)', 'Three concentric quartz tubes: plasma gas (~13–16 L/min Ar), auxiliary gas, and the injector carrying the sample aerosol (or laser-ablation aerosol) into the central channel.', { order: 0.3 }));
  parts.push(part(coil, [-0.08, 0.08, 0], 'RF load coil', 'Water-cooled copper coil driven at ~27 MHz, ~1.2–1.5 kW: inductively heats the Ar plasma to ~6000–10 000 K.', { order: 0.35 }));
  parts.push(part(plasma, [-0.12, 0, 0.1], 'Argon plasma', 'Toroidal ICP; the sample travels through the cooler central channel where it is desolvated, atomised and ionised (Saha: >90 % for IE < ~8 eV).', { order: 0.4 }));
  parts.push(part(sampler, [-0.04, 0, 0], 'Sampler cone (Ni/Pt)', '~1 mm orifice: extracts plasma into the first vacuum stage (~1–3 mbar); a supersonic expansion forms behind it.', { order: 0.5 }));
  parts.push(part(skimmer, [0.03, 0.05, 0], 'Skimmer cone', 'Samples the centre of the supersonic jet into the high vacuum. Space charge in the beam behind the skimmer favours heavy ions → instrumental mass bias.', { order: 0.55 }));
  parts.push(part(iface, [0.05, -0.1, 0], 'Interface & expansion chamber', 'Water-cooled interface and rotary/scroll-pumped expansion stage.', { order: 0.2, shell: true }));
  parts.push(part(lens, [0.1, 0.06, 0], 'Extraction lens', 'Accelerates and focuses the ions to the analyser energy (6 kV on the Sapphire).', { order: 0.6 }));
  return { group, parts, plasma };
}

/** Hexapole collision/reaction cell along local +X, centred at the origin. */
export function buildHexapole({ L = 0.15, r0 = 0.004, rodR = 0.002 } = {}) {
  const group = new THREE.Group();
  group.name = 'hexapole collision/reaction cell';
  const parts = [];
  const rods = new THREE.Group();
  const R = r0 + rodR;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const m = rod(new THREE.Vector3(-L / 2, R * Math.cos(a), R * Math.sin(a)), new THREE.Vector3(L / 2, R * Math.cos(a), R * Math.sin(a)), rodR, i % 2 ? M.gold() : M.steelPolished(), 24);
    m.name = `hexapole rod ${i + 1} (${i % 2 ? '+' : '−'} RF phase)`;
    rods.add(m);
  }
  // insulating collars
  for (const x of [-L / 2 + 0.01, L / 2 - 0.01]) {
    const c = mesh(tubeShell(R + rodR + 0.004, R + rodR + 0.001, 0.008, 32), M.alumina(), { name: 'ceramic rod collar' });
    c.rotation.z = Math.PI / 2; c.position.x = x;
    rods.add(c);
  }
  group.add(rods);
  const can = mesh(tubeShell(0.024, 0.022, L + 0.02, 40), M.steelBrushed(), { name: 'cell enclosure' });
  can.rotation.z = Math.PI / 2;
  const canG = new THREE.Group(); canG.add(can);
  const gas = rod(new THREE.Vector3(0, 0.024, 0), new THREE.Vector3(0, 0.07, 0), 0.003, M.steelPolished());
  gas.name = 'gas inlet (He / H₂)';
  canG.add(gas);
  group.add(canG);
  const apertures = new THREE.Group();
  for (const x of [-L / 2 - 0.016, L / 2 + 0.016]) {
    for (let k = 0; k < 2; k++) {
      const ap = mesh(tubeShell(0.02, 0.002, 0.002, 32), M.steelPolished(), { name: x < 0 ? 'deceleration lens' : 're-acceleration lens' });
      ap.rotation.z = Math.PI / 2; ap.position.x = x + (x < 0 ? -1 : 1) * k * 0.008;
      apertures.add(ap);
    }
  }
  group.add(apertures);
  parts.push(part(canG, [0, 0.12, 0], 'Cell enclosure + gas inlet', 'Gas-tight can around the hexapole, fed with He and/or H₂ through mass-flow controllers (2 or 4 MFCs optional on the Sapphire).', { shell: true, order: 0 }));
  parts.push(part(rods, [0, -0.08, 0.06], 'Hexapole ion guide (6 rods)', 'RF on alternate rods confines ions in an effective potential ∝ r⁴ (flat-bottomed well) while they collide and react with the gas.', { order: 0.4 }));
  parts.push(part(apertures, [0, 0, 0.1], 'Deceleration / re-acceleration lenses', 'Ions are slowed from 6 keV to a few eV to enter the cell, then re-accelerated to 6 keV and steered back onto the analyser axis.', { order: 0.6 }));
  return { group, parts, rods };
}
