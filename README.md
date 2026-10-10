# RF Toolbox

**Live app: https://theriotcoder.github.io/rf-toolbox/**

Quick RF engineering calculators in an installable web app. It works offline on Android, iPhone, Windows, Mac and Linux.

## Install on your phone

**iPhone / iPad (Safari)**
1. Open https://theriotcoder.github.io/rf-toolbox/ in **Safari**.
2. Tap **Share** (the square with the up arrow).
3. Tap **Add to Home Screen**, then **Add**.

**Android (Chrome)**
1. Open https://theriotcoder.github.io/rf-toolbox/ in **Chrome**.
2. Tap **Install** when the banner appears, or use **⋮ → Install app** (or **Add to Home screen**).

**Desktop (Chrome / Edge)**: click the install icon in the address bar.

After the first visit, everything works without a connection.

## Tools

1. **Link budget**: EIRP, FSPL, extra losses, Rx power, noise floor, SNR, link margin (pass/fail colours), max range at 0 dB margin, 1st Fresnel radius and 60% clearance.
2. **Cascade analysis**: editable stage list (add/remove/reorder, LNA/filter/mixer/amp/cable presets, passive NF = loss). Gives cascaded gain, NF (Friis), noise temperature, IIP3/OIP3, input/output P1dB, per-stage contribution table, noise floor, MDS, SFDR.
3. **Parabolic dish**: gain, 3 dB beamwidth, first null, focal length, depth, effective aperture, far field, edge/illumination angle. Also the reverse: diameter needed for a target gain.
4. **Antenna tools**: ½λ, ¼λ, ⅝λ and 1λ lengths with shortening factor; gain ↔ effective aperture; dBi ↔ dBd; EIRP/ERP; horn gain; gain from beamwidths.
5. **Unit converters**: dBm/dBW/W/mW/µW/dBµV/dBmV/Vrms/Vpk/Vpp at any impedance (shows 50 Ω and 75 Ω dBµV); frequency ↔ wavelength with velocity factor; dB ratios for power and voltage.
6. **VSWR / mismatch**: from VSWR, return loss, |Γ|, forward/reflected power or load R+jX. Gives all the others plus mismatch loss and % reflected.
7. **Coax loss**: RG-58/U, RG-58A/U, RG-8X, RG-213, RG-6 (fitted to Belden datasheets), LMR-195/240/400/600/900 (Times formulas), LDF4-50A and LDF5-50A (fitted to CommScope datasheets), or custom k1/k2. Shows loss, power out, velocity factor and a comparison table.
8. **Noise**: noise floor for any source/antenna temperature (N = k·(Tₛ+Tₑ)·B), NF ↔ noise temperature ↔ noise factor, Eb/N0 ↔ SNR, Shannon capacity.
9. **Propagation**: radio horizon (k-factor), earth bulge and Fresnel clearance at any point, two-ray path loss, near/far field distances.
10. **Pads & matching**: Pi and T attenuator resistors; L-network (low-pass and high-pass) for Rs → RL.
11. **LC, skin depth & microstrip**: LC resonance (solve f, L or C), reactance, skin depth for common metals, microstrip Z₀/εeff (Hammerstad/Wheeler) and width for a target Z₀.

Each tool has unit selectors, live results, inline errors for impossible inputs (e.g. negative return loss, efficiency over 100%), Copy/Share buttons and a short formula section. Your last inputs are saved on the device.

> ⚠️ **Disclaimer:** results are engineering estimates from standard textbook formulas and typical published data. Cable coefficients are fits to one manufacturer's datasheet per type; other brands of the same RG type can differ by 10–20%. Verify critical designs with measurements and manufacturer data.

## Development

Plain HTML/CSS/vanilla JS, no build step and no external dependencies. All maths lives in `js/rf.js` (UMD, so Node can import it).

```sh
node tests/rf.test.js                                    # formula tests vs reference values
node --experimental-websocket tests/browser-smoke.js     # headless Chrome smoke + offline test (needs google-chrome, python3)
python3 -m http.server 8000                              # then open http://localhost:8000/
python3 tools/make_icons.py                              # regenerate icons (needs Pillow)
```

Bump `VERSION` in `sw.js` when you change files so installed copies update.
