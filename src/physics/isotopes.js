// Isotope systems and their plasma-based isobaric interferences for MC-ICP-MS.
// Masses: AME2020 atomic masses (u, rounded to 5 dp); abundances: IUPAC representative
// values (%). Interferer masses are sums of the constituent atomic masses.

export const ATOM = { H: 1.00783, N: 14.00307, O: 15.99491, Ar36: 35.96755, Ar38: 37.96273, Ar40: 39.96238, Ni58: 57.93534, Kr84: 83.91150, Kr86: 85.91061, Rb87: 86.90918, Hg204: 203.97349 };

/** Resolving power needed to separate two masses: m/Δm. */
export const requiredResolution = (m1, m2) => Math.max(m1, m2) / Math.abs(m1 - m2);

export const SYSTEMS = {
  K: {
    label: 'K (39, 41)', ratio: ['⁴¹K', '³⁹K'],
    isotopes: [
      { name: '³⁹K', m: 38.96371, ab: 93.2581 }, { name: '⁴⁰K', m: 39.96400, ab: 0.0117 }, { name: '⁴¹K', m: 40.96183, ab: 6.7302 },
    ],
    interferences: [
      { on: '³⁹K', name: '³⁸ArH⁺', m: ATOM.Ar38 + ATOM.H, kind: 'ArH', note: 'From ³⁸Ar + H in the plasma; removed in the cell by H₂ (proton transfer → H₃⁺).' },
      { on: '⁴¹K', name: '⁴⁰ArH⁺', m: ATOM.Ar40 + ATOM.H, kind: 'ArH', note: 'Huge ArH⁺ tail on ⁴¹K is the classic K-isotope problem; cell removes it so LR can be used.' },
      { on: '⁴⁰K', name: '⁴⁰Ar⁺', m: ATOM.Ar40, kind: 'Ar', note: 'Needs m/Δm ≈ 2.5×10⁴ — beyond MC-ICP-MS high resolution; removed in the cell.' },
    ],
    showcase: 'Nu Sapphire application note SP02 (K isotopes in low resolution through the cell).',
  },
  Ca: {
    label: 'Ca (40–48)', ratio: ['⁴⁴Ca', '⁴⁰Ca'],
    isotopes: [
      { name: '⁴⁰Ca', m: 39.96259, ab: 96.941 }, { name: '⁴²Ca', m: 41.95862, ab: 0.647 }, { name: '⁴³Ca', m: 42.95877, ab: 0.135 },
      { name: '⁴⁴Ca', m: 43.95548, ab: 2.086 }, { name: '⁴⁶Ca', m: 45.95369, ab: 0.004 }, { name: '⁴⁸Ca', m: 47.95252, ab: 0.187 },
    ],
    interferences: [
      { on: '⁴⁰Ca', name: '⁴⁰Ar⁺', m: ATOM.Ar40, kind: 'Ar', note: 'm/Δm ≈ 1.9×10⁵ — no MC-ICP-MS can resolve it; the cell converts Ar⁺ (charge transfer/reaction with H₂).' },
      { on: '⁴²Ca', name: '⁴⁰ArH₂⁺', m: ATOM.Ar40 + 2 * ATOM.H, kind: 'ArH', note: 'Argide hydride.' },
      { on: '⁴⁴Ca', name: '¹²C¹⁶O₂⁺', m: 12 + 2 * ATOM.O, kind: 'CO2', note: 'From dissolved CO₂ / organics.' },
    ],
    showcase: 'Nu Sapphire application note SP01 (Ca including ⁴⁰Ca in low resolution).',
  },
  Fe: {
    label: 'Fe (54–58)', ratio: ['⁵⁶Fe', '⁵⁴Fe'],
    isotopes: [
      { name: '⁵⁴Fe', m: 53.93961, ab: 5.845 }, { name: '⁵⁶Fe', m: 55.93494, ab: 91.754 }, { name: '⁵⁷Fe', m: 56.93539, ab: 2.119 }, { name: '⁵⁸Fe', m: 57.93327, ab: 0.282 },
    ],
    interferences: [
      { on: '⁵⁴Fe', name: '⁴⁰Ar¹⁴N⁺', m: ATOM.Ar40 + ATOM.N, kind: 'ArX', note: 'Resolvable in MR/HR (m/Δm ≈ 2100).' },
      { on: '⁵⁶Fe', name: '⁴⁰Ar¹⁶O⁺', m: ATOM.Ar40 + ATOM.O, kind: 'ArX', note: 'Resolvable in MR/HR (m/Δm ≈ 2500) or removed in the cell.' },
      { on: '⁵⁷Fe', name: '⁴⁰Ar¹⁶OH⁺', m: ATOM.Ar40 + ATOM.O + ATOM.H, kind: 'ArX', note: 'Argide hydroxide.' },
      { on: '⁵⁸Fe', name: '⁵⁸Ni⁺', m: ATOM.Ni58, kind: 'isobar', note: 'True isobar: correct via ⁶⁰Ni monitor.' },
    ],
    showcase: 'Fe in low resolution through the cell (Nu Sapphire product page).',
  },
  Se: {
    label: 'Se (74–82)', ratio: ['⁸²Se', '⁷⁸Se'],
    isotopes: [
      { name: '⁷⁴Se', m: 73.92248, ab: 0.86 }, { name: '⁷⁶Se', m: 75.91921, ab: 9.23 }, { name: '⁷⁷Se', m: 76.91991, ab: 7.60 },
      { name: '⁷⁸Se', m: 77.91731, ab: 23.69 }, { name: '⁸⁰Se', m: 79.91652, ab: 49.80 }, { name: '⁸²Se', m: 81.91670, ab: 8.82 },
    ],
    interferences: [
      { on: '⁷⁶Se', name: '³⁶Ar⁴⁰Ar⁺', m: ATOM.Ar36 + ATOM.Ar40, kind: 'Ar2', note: 'Argon dimers dominate masses 76–80.' },
      { on: '⁷⁸Se', name: '³⁸Ar⁴⁰Ar⁺', m: ATOM.Ar38 + ATOM.Ar40, kind: 'Ar2', note: 'Argon dimer.' },
      { on: '⁸⁰Se', name: '⁴⁰Ar₂⁺', m: 2 * ATOM.Ar40, kind: 'Ar2', note: 'm/Δm ≈ 9700: removed in the cell instead.' },
    ],
    showcase: 'Nu Sapphire application note SP06 (Se).',
  },
  Sr: {
    label: 'Sr (84–88)', ratio: ['⁸⁷Sr', '⁸⁶Sr'],
    isotopes: [
      { name: '⁸⁴Sr', m: 83.91342, ab: 0.56 }, { name: '⁸⁶Sr', m: 85.90926, ab: 9.86 }, { name: '⁸⁷Sr', m: 86.90888, ab: 7.0 }, { name: '⁸⁸Sr', m: 87.90561, ab: 82.58 },
    ],
    interferences: [
      { on: '⁸⁴Sr', name: '⁸⁴Kr⁺', m: ATOM.Kr84, kind: 'isobar', note: 'Kr impurity in Ar gas; the cell reduces Kr (application note SP04).' },
      { on: '⁸⁶Sr', name: '⁸⁶Kr⁺', m: ATOM.Kr86, kind: 'isobar', note: 'Corrected from ⁸³Kr or removed in the cell.' },
      { on: '⁸⁷Sr', name: '⁸⁷Rb⁺', m: ATOM.Rb87, kind: 'isobar', note: 'Corrected from ⁸⁵Rb (⁸⁷Rb/⁸⁵Rb = 0.3857), ideally removed by chemistry.' },
    ],
    showcase: 'Nu Sapphire application note SP04 (Sr with Kr interference reduction).',
  },
  Nd: {
    label: 'Nd (142–150)', ratio: ['¹⁴³Nd', '¹⁴⁴Nd'],
    isotopes: [
      { name: '¹⁴²Nd', m: 141.90773, ab: 27.15 }, { name: '¹⁴³Nd', m: 142.90982, ab: 12.17 }, { name: '¹⁴⁴Nd', m: 143.91009, ab: 23.80 },
      { name: '¹⁴⁵Nd', m: 144.91258, ab: 8.29 }, { name: '¹⁴⁶Nd', m: 145.91312, ab: 17.19 }, { name: '¹⁴⁸Nd', m: 147.91690, ab: 5.76 }, { name: '¹⁵⁰Nd', m: 149.92090, ab: 5.64 },
    ],
    interferences: [
      { on: '¹⁴²Nd', name: '¹⁴²Ce⁺', m: 141.90925, kind: 'isobar', note: 'Removed by chemistry; monitored on ¹⁴⁰Ce.' },
      { on: '¹⁴⁴Nd', name: '¹⁴⁴Sm⁺', m: 143.91201, kind: 'isobar', note: 'Corrected from ¹⁴⁷Sm.' },
    ],
    showcase: 'Routine radiogenic system (Nu product pages).',
  },
  Pb: {
    label: 'Pb (204–208)', ratio: ['²⁰⁷Pb', '²⁰⁶Pb'],
    isotopes: [
      { name: '²⁰⁴Pb', m: 203.97304, ab: 1.4 }, { name: '²⁰⁶Pb', m: 205.97447, ab: 24.1 }, { name: '²⁰⁷Pb', m: 206.97590, ab: 22.1 }, { name: '²⁰⁸Pb', m: 207.97665, ab: 52.4 },
    ],
    interferences: [
      { on: '²⁰⁴Pb', name: '²⁰⁴Hg⁺', m: ATOM.Hg204, kind: 'isobar', note: 'Corrected from ²⁰²Hg; Tl (²⁰³Tl/²⁰⁵Tl) added for mass-bias correction.' },
    ],
    showcase: 'Pb isotopes with Tl normalisation; U–Pb by laser ablation.',
  },
  U: {
    label: 'U (234–238)', ratio: ['²³⁵U', '²³⁸U'],
    isotopes: [
      { name: '²³⁴U', m: 234.04095, ab: 0.0054 }, { name: '²³⁵U', m: 235.04393, ab: 0.7204 }, { name: '²³⁸U', m: 238.05079, ab: 99.2742 },
    ],
    interferences: [
      { on: '²³⁴U', name: '²³⁸U tail', m: 238.05079, kind: 'tail', note: 'Abundance sensitivity: scattered ²³⁸U ions; energy (deceleration) filters on ion counters.' },
    ],
    showcase: 'U-series and actinides with energy filters (Nu product page).',
  },
};

/** First ionization energies (eV, NIST ASD) for the plasma scene. */
export const IE = {
  Li: 5.392, B: 8.298, Na: 5.139, Mg: 7.646, Al: 5.986, Si: 8.152, K: 4.341, Ca: 6.113, Ti: 6.828, V: 6.746, Cr: 6.767,
  Fe: 7.902, Ni: 7.640, Cu: 7.726, Zn: 9.394, Ga: 5.999, Ge: 7.899, As: 9.789, Se: 9.752, Rb: 4.177, Sr: 5.695, Zr: 6.634,
  Mo: 7.092, Cd: 8.994, Sn: 7.344, Te: 9.010, Cs: 3.894, Ba: 5.212, Nd: 5.525, Sm: 5.644, Hf: 6.825, W: 7.864, Os: 8.438,
  Pt: 8.959, Hg: 10.438, Tl: 6.108, Pb: 7.417, Th: 6.307, U: 6.194, Ar: 15.760,
};
