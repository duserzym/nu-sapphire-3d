// Nu Sapphire / Nu Plasma specifications used by the model, with provenance.
// v: true = stated in the cited source; false = modelling assumption (shown in the UI).

const deg = Math.PI / 180;

export const SOURCES = {
  sapphire: { label: 'Nu Instruments: Sapphire product page', url: 'https://www.nu-ins.com/products/hr-mc-icp-ms/sapphire' },
  sapphirePubs: { label: 'Nu: Sapphire publications', url: 'https://www.nu-ins.com/products/hr-mc-icp-ms/sapphire/sapphire-publications' },
  plasma3: { label: 'Nu Instruments: Plasma 3 product page', url: 'https://www.nu-ins.com/Products/MC-ICP-MS/Introduction-to-MC-ICP-MS/Plasma3' },
  plasma1700: { label: 'Nu Instruments: Plasma/Sapphire 1700', url: 'https://www.nu-ins.com/products/hr-mc-icp-ms/plasma-1700' },
  specEurope: { label: 'Spectroscopy Europe: Nu Sapphire', url: 'https://spectroscopyeurope.com/node/3135' },
  harvard: { label: 'Goldschmidt 2023 abstract 20550 (Harvard Sapphire)', url: 'https://goldschmidtabstracts.info/2023/20550.pdf' },
  belshaw: { label: 'Belshaw et al. (1998) Nu Plasma design', url: 'https://www.geomar.de/fileadmin/personal/fb1/p-oz/mfrank/Belshaw_et_al_1998.pdf' },
  gchron2020: { label: 'Geochronology 2:343 (2020): Nu Plasma 3D LA U–Pb detector layout', url: 'https://gchron.copernicus.org/articles/2/343/2020/' },
  jaas2025: { label: 'JAAS 2025, d5ja00189g (K isotopes; Sapphire comparison)', url: 'https://pubs.rsc.org/en/content/articlehtml/2025/ja/d5ja00189g' },
};

export const SAPPHIRE = {
  name: 'Nu Sapphire',
  vendor: 'Nu Instruments',
  optics: { L1: 0.35, a: 0.35, phiE: 90 * deg, R: 0.25, phiM: 70 * deg },
  accelKV: 6,
  cupPitch: 0.0025,
  nFaraday: 16,
  nIC: 3,
  specs: [
    ['Dual path', 'Conventional (high-energy) path or hexapole collision/reaction-cell (low-energy) path, switchable; CRC bypassed in conventional mode', true, 'sapphire'],
    ['Path energies', 'Extracted at 6 kV, deflected off-axis and decelerated into the cell, re-accelerated to 6 kV and returned to the main path', true, 'harvard'],
    ['Cell', 'Hexapole ion guide; 2 or 4 mass-flow controllers (He, H₂)', true, 'sapphire'],
    ['Resolution modes', 'Low, medium and high resolution (standard)', true, 'sapphire'],
    ['Collectors', '16 Faradays (standard) with software-switchable dual-resistor pre-amplifiers; 10¹⁰, 10¹², 10¹³ Ω optional', true, 'sapphire'],
    ['Ion counting', 'Up to 6 SEMs, or 3 SEMs + 3 Daly detectors (optional); up to 3 energy (deceleration) filters', true, 'sapphire'],
    ['Zoom optics', 'Fast, reproducible peak alignment onto a static multicollector array', true, 'sapphire'],
    ['Sensitivity claim', '> 10× gain for K, Ca, Fe in low-resolution CRC mode', true, 'sapphire'],
    ['K/Ca performance', '~1000–1300 V/ppm; δ⁴¹K, δ⁴⁴Ca reproducibility 0.02–0.03 ‰ (2RSE)', true, 'harvard'],
    ['Nu Plasma optics (heritage)', 'Nier–Johnson double focusing: 35 cm ESA, 25 cm laminated magnet, quadrupole zoom pair', true, 'belshaw'],
    ['Sector angles & drifts', 'ESA 90°, magnet 70°, L′ = 35 cm; L₂, L₃ solved for an achromatic focus (model)', false, null],
    ['Cup spacing', '2.5 mm fixed spacing on the focal plane (Nu Plasma, Belshaw et al. 1998; assumed unchanged)', true, 'belshaw'],
    ['Zoom factor', 'Chosen so isotopes land on every 1st or 2nd cup (model)', false, null],
    ['Split low/high-mass zones (U–Pb)', 'Independent zoom/steering for a low-mass (Hg–Pb) and a high-mass (Th–U) collector zone → static simultaneous Pb + U collection. User/lab knowledge — confirm with Nu documentation', false, 'user'],
    ['U–Pb detector layout (Nu Plasma 3D)', '6 Dalys (5 low-mass side: ²⁰², ²⁰⁴, ²⁰⁶, ²⁰⁷, ²⁰⁸; 1 high-mass side), 14 Faradays between; ²³²Th, ²³⁸U on Faradays', true, 'gchron2020'],
  ],
};
