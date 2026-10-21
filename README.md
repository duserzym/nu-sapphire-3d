# MC-ICP-MS 3D — Nu Sapphire dual-path collision-cell multicollector

Interactive, explodable three.js models of a **dual-path collision/reaction-cell MC-ICP-MS** of the Nu Sapphire type.
The physics underneath the visuals is computed, not drawn by hand: the ion optics are a solved and traced double-focusing design, and the cell, plasma and mass-bias behaviour come from small physics modules. The app shell, controls and styling are shared with the companion **TIMS 3D** project.

> **Live site:** <https://duserzym.github.io/nu-sapphire-3d/>

| Scene | What it shows |
|---|---|
| **Nu Sapphire MC-ICP-MS** | The full instrument: ICP torch and cones, extraction, path-switch deflectors, the hexapole **collision/reaction cell** (low-energy path) or the **bypass** (6 keV high-energy path), source slit, **ESA**, laminated **magnet**, **zoom optics**, 16 fixed Faradays and ion counters, pumps and a cabinet. Each element's isotope beams are traced through the ESA and magnet. Interferences (red) reach the cups on the bypass path and die in the cell on the low-energy path. |
| **U–Pb: split low/high-mass zones** | The collector end set up for LA U–Pb, with ²⁰²Hg, ²⁰⁴Pb, ²⁰⁶Pb, ²⁰⁷Pb and ²⁰⁸Pb on ion counters and ²³²Th, ²³⁵U and ²³⁸U on Faradays.<br>• **Linked mode** (one zoom and steering setting): because 1 u at Pb is ~17 % wider than 1 u at U, a single setting leaves beams up to ~0.9 mm off their detectors. That is outside the flat top, so signal is lost.<br>• **Independent zones** (separate zoom and steering for each zone): each zone is centred to within ~45 µm, inside the flat top. Pb and U are then collected statically and simultaneously, with no peak hopping.<br>• The scene also has peak-coincidence scans and a workflow note (Hg on 204, IC/Faraday gain, Pb/U fractionation).<br>• *Provenance: the split-zone control is user/lab knowledge; confirm with Nu documentation.* |
| **Plasma & interface** | Torch, load coil, plasma zones, sampler and skimmer. Saha ionization fraction vs first ionization energy (adjustable T and n<sub>e</sub>), and the space-charge mass bias (β/m per u). |
| **Collision/reaction cell** | The hexapole r⁴ pseudo-potential, Monte-Carlo collisional cooling with He (energy along the cell, exit energy spread), interference survival vs H₂ flow (exp(−k·n·t)), and animated ions, gas and reactions. |
| **Double focusing: ESA + magnet** | Energy focusing vs magnet-only, with traced ray fans (energy and angle), focal-plane shift vs ΔK, resolving power from slit, magnification and zoom, and flat-top peaks with **pseudo-high-resolution** shoulders. |
| **Multicollection & mass bias** | A 16-cup fixed array with zoom planning per element and one cup in full detail. Covers Johnson vs counting noise for 10¹⁰–10¹³ Ω, the exponential law, Sr internal normalisation with Rb correction, and a standard–sample bracketing session with drifting β. |

Global controls: **Explode** (<kbd>E</kbd>), **X-ray** (<kbd>X</kbd>), labels (<kbd>L</kbd>), beams (<kbd>B</kbd>), glow and PNG export. Click any part to see a short explanation. Deep links work, for example `#scene=instrument&element=Ca&path=he`.

## Run

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # physics unit tests (vitest)
npm run build        # static site in dist/
npm run screenshots  # headless smoke test + PNGs of every scene
```

## Physics notes and honesty

- **Double-focusing optics** (`src/physics/optics.js`): first-order transfer matrices for a cylindrical ESA (ω = √2/a, energy term only) and a homogeneous magnet (δp = (δK + δm)/2). The inter-sector drift and image distance are solved for (x|α) = (x|δK) = 0, giving an achromatic but mass-dispersive focus.
  - The design is checked by an **RK4 trace through explicit fields**: a 1/r ESA field with the boundary potential step, and a uniform magnet, with boundary crossings found by bisection. The two agree to better than 10⁻³, and a test covers this.
  - **Assumed:** the ESA radius (35 cm) and magnet radius (25 cm) come from the Nu Plasma design paper (Belshaw et al. 1998). The sector angles (90°/70°) and the object distance are not published and are modelling assumptions.
- **Collision/reaction cell** (`src/physics/cell.js`):
  - The pseudo-potential follows Gerlich (1992).
  - Elastic-collision energy loss is computed with isotropic centre-of-mass scattering.
  - Ar⁺ and ArH⁺ + H₂ rate coefficients are representative literature values (Anicich 1993). The Ar₂⁺/ArX⁺ values and the analyte bound are illustrative.
  - Cell pressure is derived from flow with an assumed conductance.
- **Plasma** (`src/physics/plasma.js`): LTE Saha with partition-function ratios set to 1, plus the exponential mass-bias law and SSB.
- **Interferences** (`src/physics/isotopes.js`): AME2020 masses and IUPAC abundances. Required resolving powers are computed from these masses.
- **Split zones (U–Pb):** independent low- and high-mass zone control on the Sapphire is user/lab-reported and not stated on public Nu pages. Those pages mention ion counters “arranged in tailored configurations” with U–Pb as an application, and independently adjustable detector slits on the Plasma 1700. The uniform 2.5 mm/u detector pitch in the model is an assumption. The published Nu Plasma 3D U–Pb detector layout (Geochronology 2020) is cited.
- **Vendor facts:** every spec row in `src/instrument/specs.js` is flagged as either *source* or *assumed*, and the UI shows the flag.

## Licence, trademarks and attribution

- **Code**: MIT (see `LICENSE`).
- **Bundled dependency**: three.js (MIT). Its licence ships with the site as `THIRD_PARTY_LICENSES.txt`.
- **Dev-only tools**: Vite and Vitest (MIT) and Playwright (Apache-2.0) are not distributed with the site.
- **Trademarks**: Nu Instruments, Nu Sapphire, Nu Plasma and AMETEK are trademarks of their owners. They are used only to identify the instrument being modelled (nominative use). No logos, trade dress or vendor artwork are reproduced. This project is independent and not affiliated with or endorsed by Nu Instruments/AMETEK.
- **Vendor documents** are cited and linked. Technical facts are restated in our own words. The 3-D models are original, schematic constructions; they are not CAD.

## Sources

- Nu Instruments, *Sapphire* product page — <https://www.nu-ins.com/products/hr-mc-icp-ms/sapphire>
- Nu Instruments, *Sapphire publications* — <https://www.nu-ins.com/products/hr-mc-icp-ms/sapphire/sapphire-publications>
- Nu Instruments, *Plasma 3* — <https://www.nu-ins.com/Products/MC-ICP-MS/Introduction-to-MC-ICP-MS/Plasma3>; *Plasma/Sapphire 1700* — <https://www.nu-ins.com/products/hr-mc-icp-ms/plasma-1700>
- Spectroscopy Europe, *Nu Sapphire* — <https://spectroscopyeurope.com/node/3135>
- Goldschmidt 2023 abstract 20550 (Harvard Sapphire: 6 kV dual path, He/H₂, K and Ca performance) — <https://goldschmidtabstracts.info/2023/20550.pdf>
- Belshaw et al. (1998) *Int. J. Mass Spectrom.* 181:51 (Nu Plasma design) — <https://www.geomar.de/fileadmin/personal/fb1/p-oz/mfrank/Belshaw_et_al_1998.pdf>
- Geochronology 2:343 (2020), Nu Plasma 3D LA U–Pb detector layout — <https://gchron.copernicus.org/articles/2/343/2020/>
- JAAS 2025 d5ja00189g (K isotopes; Sapphire comparison) — <https://pubs.rsc.org/en/content/articlehtml/2025/ja/d5ja00189g>
- Wollnik (1987) *Optics of Charged Particles*; Gerlich (1992) *Adv. Chem. Phys.* 82:1; Anicich (1993) *J. Phys. Chem. Ref. Data* 22:1469; Russell et al. (1978) *GCA* 42:1075; Houk (1986) *Anal. Chem.* 58:97A
