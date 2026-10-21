// Cylindrical electrostatic analyser (ESA) in the sector frame of the optics module:
// the reference ion enters at the local origin travelling +x and bends counter-clockwise
// about C = (0, a) through φ. 2-D (x, y) → local (x, beamY, −y), like geom.toWorld.
import * as THREE from 'three';
import { M } from '../core/materials.js';
import { mesh, slabFromOutline, toWorld, plateWithSlit, yawFromDir2D, rod } from '../core/geom.js';
import { part } from './parts.js';

function ring(C, r0, r1, th0, th1, n = 64) {
  const pt = (r, th) => [C[0] + r * Math.sin(th), C[1] - r * Math.cos(th)];
  const a = [], b = [];
  for (let i = 0; i <= n; i++) { const th = th0 + ((th1 - th0) * i) / n; a.push(pt(r1, th)); b.push(pt(r0, th)); }
  return [...a, ...b.reverse()];
}

/**
 * @param {{a:number, phi:number, gap?:number, height?:number, beamY?:number}} o
 * @returns {{group, parts, platesV:(V:number)=>void}}
 */
export function buildESA({ a, phi, gap = 0.02, height = 0.07, beamY = 0, Vplate = 0 }) {
  const group = new THREE.Group();
  group.name = 'electrostatic analyser';
  const parts = [];
  const C = [0, a];
  const t = 0.006;
  const y0 = beamY - height / 2;
  const mk = (r0, r1, name, mat) => {
    const m = mesh(slabFromOutline(ring(C, r0, r1, 0, phi), height), mat, { name });
    m.position.y = y0;
    return m;
  };
  const outer = mk(a + gap / 2, a + gap / 2 + t, 'outer ESA plate (+)', M.steelPolished());
  const inner = mk(a - gap / 2 - t, a - gap / 2, 'inner ESA plate (−)', M.steelPolished());
  group.add(outer, inner);
  // ceramic spacers and support plates
  const sup = new THREE.Group();
  const base = mesh(slabFromOutline(ring(C, a - gap / 2 - 0.03, a + gap / 2 + 0.03, -0.02, phi + 0.02), 0.008), M.steelBrushed(), { name: 'ESA base plate' });
  base.position.y = y0 - 0.012;
  sup.add(base);
  for (let i = 0; i <= 4; i++) {
    const th = (phi * i) / 4;
    for (const r of [a - gap / 2 - t - 0.008, a + gap / 2 + t + 0.008]) {
      const p = [C[0] + r * Math.sin(th), C[1] - r * Math.cos(th)];
      const pos = toWorld(p, y0 - 0.004);
      sup.add(rod(pos, pos.clone().add(new THREE.Vector3(0, 0.008, 0)), 0.004, M.alumina()));
    }
  }
  group.add(sup);
  // housing (shell)
  const hous = new THREE.Group();
  const hb = mesh(slabFromOutline(ring(C, a - gap / 2 - 0.06, a + gap / 2 + 0.06, -0.03, phi + 0.03), height + 0.06), M.steelBrushed(), { name: 'ESA vacuum housing' });
  hb.position.y = y0 - 0.03;
  hous.add(hb);
  group.add(hous);
  // entrance / exit slits
  const P2 = [a * Math.sin(phi), a - a * Math.cos(phi)];
  const d2 = [Math.cos(phi), Math.sin(phi)];
  const slits = new THREE.Group();
  for (const [p, d, nm] of [[[-0.012, 0], [1, 0], 'ESA entrance slit'], [[P2[0] + d2[0] * 0.012, P2[1] + d2[1] * 0.012], d2, 'energy (ESA exit) slit']]) {
    const s = mesh(plateWithSlit(0.05, height * 0.8, 0.0015, 0.0012, height * 0.4), M.steel(), { name: nm });
    s.position.copy(toWorld(p, beamY));
    s.rotation.y = yawFromDir2D(d);
    slits.add(s);
  }
  group.add(slits);

  const mid = phi / 2;
  const outw = [Math.sin(mid), -Math.cos(mid)];
  parts.push(part(hous, [outw[0] * 0.1, 0.35, -outw[1] * 0.1], 'ESA housing', 'UHV chamber around the electrostatic analyser.', { order: 0.05, shell: true }));
  parts.push(part(outer, [outw[0] * 0.08, 0.12, -outw[1] * 0.08], 'Outer ESA plate (positive)',
    `Cylindrical plate at a + g/2 = ${((a + gap / 2) * 100).toFixed(1)} cm. With ±V on the plates the field is E = 2V/(a·ln(r₂/r₁))·(a/r); the reference ion circles at r = 2K/(qE) — independent of mass, so the ESA disperses by kinetic energy only.`, { order: 0.4 }));
  parts.push(part(inner, [-outw[0] * 0.08, 0.12, outw[1] * 0.08], 'Inner ESA plate (negative)', 'Inner cylindrical electrode. Cylindrical ESAs focus radially at φ = π/√2 ≈ 127° for an object at the entrance.', { order: 0.45 }));
  parts.push(part(sup, [0, -0.12, 0], 'ESA base & ceramic spacers', 'Alumina insulators hold the plates at a precise gap.', { order: 0.3 }));
  parts.push(part(slits, [0, 0.2, 0], 'ESA entrance & energy slits', 'The energy slit at the ESA exit limits the accepted energy band and blocks scattered ions.', { order: 0.5 }));
  return { group, parts };
}
