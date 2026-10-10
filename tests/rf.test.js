// Unit tests for js/rf.js against reference values. Run: node tests/rf.test.js
const RF = require("../js/rf.js");
let pass = 0, fail = 0;
function near(name, got, want, tol) {
  const ok = got === want || Math.abs(got - want) <= tol;
  ok ? pass++ : fail++;
  console.log((ok ? "PASS " : "FAIL ") + name + ": got " + (+got).toPrecision(6) + ", want " + want + " ±" + tol);
}
function rel(name, got, want, pct) { near(name, got, want, Math.abs(want) * pct / 100); }

// --- FSPL / link
near("FSPL 1 km @ 2.4 GHz", RF.fsplDb(1, 2400), 100.05, 0.02);
near("FSPL 10 km @ 5.8 GHz", RF.fsplDb(10, 5800), 127.72, 0.03);   // 20+75.27+32.45
const lb = RF.linkBudget({ txDbm: 20, txLoss: 1, txGain: 10, fMHz: 2400, dKm: 1, extraLoss: 0, rxGain: 10, rxLoss: 1, bwHz: 1e6, nfDb: 5, snrReq: 10 });
near("link EIRP", lb.eirpDbm, 29, 1e-9);
near("link Prx", lb.prxDbm, 29 - 100.05 + 9, 0.02);
near("link noise floor 1MHz NF5", lb.noiseFloorDbm, -108.98, 0.02);
near("link margin", lb.marginDb, (29 - 100.05 + 9) - (-108.98 + 10), 0.03);
near("max range (0 dB margin) consistent", RF.fsplDb(lb.maxRangeKm, 2400) - RF.fsplDb(1, 2400), lb.marginDb, 1e-9);
near("Fresnel r1 midpoint 1 km 2.4 GHz (17.32·sqrt(d/4f))", lb.fresnelMidM, 17.32 * Math.sqrt(1 / (4 * 2.4)), 0.01);
near("Fresnel 60%", lb.fresnel60M, 0.6 * lb.fresnelMidM, 1e-12);

// --- noise
near("kT0 dBm/Hz", RF.KT0_DBM_HZ, -173.98, 0.01);
near("kTB 1 MHz", RF.thermalNoiseDbm(1e6), -114, 0.03);
near("NF 3 dB -> T", RF.nfToTemp(3), 288.6, 0.1);
near("T 290 K -> NF", RF.tempToNf(290), 3.0103, 1e-3);
near("NF 1 dB -> T 75.1 K", RF.nfToTemp(1), 75.09, 0.02);
near("Eb/N0 from SNR (BW 1 MHz, 2 Mb/s)", RF.ebn0FromSnr(10, 1e6, 2e6), 6.99, 0.01);
rel("Shannon 1 MHz @ 30 dB", RF.shannonCapacity(1e6, 30), 9.967e6, 0.05);

// --- cascade (Friis): LNA G=20 NF=1 | filter -2 dB | mixer G=-7 NF=7 | IF amp G=20 NF=4
// F = 1.2589 + (1.5849-1)/100 + (5.0119-1)/(100*0.6310) + (2.5119-1)/(100*0.6310*0.1995)
//   = 1.2589 + 0.005849 + 0.063580 + 0.120079 = 1.448408 -> 1.6089 dB
const cas = RF.cascade([
  { name: "LNA", gain: 20, nf: 1, ip3: 30, ip3Type: "OIP3", p1db: 20 },
  { name: "BPF", gain: -2, nf: 2 },
  { name: "Mixer", gain: -7, nf: 7, ip3: 15, ip3Type: "IIP3" },
  { name: "IF amp", gain: 20, nf: 4, ip3: 35, ip3Type: "OIP3" }
], { bwHz: 1e6 });
near("cascade gain", cas.gainDb, 31, 1e-9);
near("cascade NF (Friis)", cas.nfDb, 1.6089, 0.002);
near("cascade Te", cas.tempK, 290 * 0.448408, 0.1);
// IIP3: stage IIP3s (dBm): LNA 10, mixer 15 (after G=18 dB), IF amp 15 (after G=11 dB)
// 1/IIP3 = 1/10 + 63.096/31.623 + 12.589/31.623 = 0.1 + 1.99526 + 0.39811 = 2.49337 mW^-1 -> -3.968 dBm
near("cascade IIP3", cas.iip3Dbm, -3.968, 0.005);
near("cascade OIP3", cas.oip3Dbm, -3.968 + 31, 0.005);
near("cascade input P1dB (only LNA limits: OP1 20 -> IP1 1 dBm)", cas.ip1dbDbm, 1, 1e-9);
near("NF contributions sum to 100%", cas.rows.reduce((a, r) => a + r.nfContribPct, 0), 100, 1e-9);
near("cascade noise floor in (1 MHz)", cas.noiseFloorInDbm, -113.98 + 1.6089, 0.01);
near("SFDR = 2/3(IIP3 - floor)", cas.sfdrDb, (2 / 3) * (-3.968 - (-113.98 + 1.6089)), 0.01);
// simple two-stage textbook check: G1=10 dB NF=2 dB, NF2=6 dB -> F = 1.5849 + 2.9811/10 = 1.8830 -> 2.749 dB
near("two-stage Friis", RF.cascade([{ gain: 10, nf: 2 }, { gain: 20, nf: 6 }]).nfDb, 2.749, 0.002);
near("two-stage IIP3 (10 dBm, then 10 dB gain, 20 dBm) = 6.99", RF.cascade([{ gain: 10, nf: 2, ip3: 10, ip3Type: "IIP3" }, { gain: 10, nf: 6, ip3: 20, ip3Type: "IIP3" }]).iip3Dbm, 6.99, 0.01);
near("passive loss NF = loss: 3 dB pad then NF 2 dB amp -> 5 dB", RF.cascade([{ gain: -3, nf: 3 }, { gain: 20, nf: 2 }]).nfDb, 5, 0.01);

// --- dish
near("1.2 m dish 12 GHz 65%", RF.dishGain(1.2, 12e9, 0.65), 41.7, 0.15);
const d = RF.dish({ dM: 1.2, fHz: 12e9, eff: 0.65, fd: 0.4 });
near("dish 3 dB BW ~70λ/D", d.bw3dBDeg, 70 * 0.0249827 / 1.2, 0.001);
near("dish focal length", d.focalM, 0.48, 1e-9);
near("dish depth D²/16f", d.depthM, 1.44 / 7.68, 1e-9);
near("dish far field 2D²/λ", d.farFieldM, 115.28, 0.05);
near("F/D 0.25 edge half-angle = 90°", RF.dish({ dM: 1, fHz: 1e9, eff: 0.6, fd: 0.25 }).edgeHalfAngleDeg, 90, 1e-9);
near("dish reverse: diameter for 41.7 dBi", RF.dishDiameterForGain(RF.dishGain(1.2, 12e9, 0.65), 12e9, 0.65), 1.2, 1e-9);

// --- antennas
near("Ae of 0 dBi at 300 MHz = 1/(4π)", RF.effectiveAperture(0, 299792458), 1 / (4 * Math.PI), 1e-9);
near("gain from aperture inverse", RF.gainFromAperture(RF.effectiveAperture(17, 2.4e9), 2.4e9), 17, 1e-9);
near("dBi->dBd", RF.dbiToDbd(2.15), 0, 1e-12);
near("half-wave 14.2 MHz k=0.95 (≈468/f ft)", RF.wireLengths(14.2e6, 0.951).halfWaveM / 0.3048, 468 / 14.2, 0.05);
near("beamwidth gain 10°×10° eff 1 -> 26.15 dBi", RF.gainFromBeamwidths(10, 10, 1), 26.15, 0.01);

// --- units
near("0 dBm = 1 mW", RF.dbmToW(0), 1e-3, 1e-15);
near("0 dBm in 50Ω = 107.0 dBµV", RF.powerAll(0, 50).dBuV, 106.99, 0.01);
near("0 dBm in 75Ω = 108.75 dBµV", RF.powerAll(0, 75).dBuV, 108.75, 0.01);
near("0 dBm 50Ω Vrms", RF.powerAll(0, 50).Vrms, 0.2236, 1e-4);
near("round trip Vpp->dBm", RF.toDbm(RF.powerAll(13, 50).Vpp, "Vpp", 50), 13, 1e-9);
near("round trip dBuV 75Ω", RF.toDbm(60, "dBuV", 75), 60 - 108.75, 0.01);
near("λ at 146 MHz", RF.wavelength(146e6), 2.0534, 1e-3);
near("voltage ratio 2 -> 6.02 dB", RF.dbRatio(2, "voltage"), 6.0206, 1e-4);

// --- VSWR
const v2 = RF.vswrFromVswr(2);
near("VSWR 2 -> Γ", v2.gamma, 1 / 3, 1e-9);
near("VSWR 2 -> RL", v2.returnLossDb, 9.542, 0.001);
near("VSWR 2 -> ML", v2.mismatchLossDb, 0.512, 0.001);
near("VSWR 2 -> reflected 11.1%", v2.reflectedPct, 11.111, 0.001);
near("RL 20 dB -> VSWR 1.222", RF.vswrFromRL(20).vswr, 1.2222, 1e-4);
near("Z=100Ω on 50 -> VSWR 2", RF.vswrFromZ(100, 0, 50).vswr, 2, 1e-9);
near("Z=50+j50 on 50 -> VSWR 2.618", RF.vswrFromZ(50, 50, 50).vswr, 2.618, 0.001);
near("100 W fwd / 11.11 W refl -> VSWR 2", RF.vswrFromPower(100, 100 / 9).vswr, 2, 1e-9);

// --- coax (Times LMR-400 datasheet: 3.9 dB/100ft @ 900 MHz, 6.8 @ 2500)
const lmr400 = RF.CABLES.find(c => c.id === "lmr400");
near("LMR-400 @ 900 MHz /100ft", RF.cableLossPer100ft(lmr400.k1, lmr400.k2, 900), 3.9, 0.1);
near("LMR-400 @ 2500 MHz /100ft", RF.cableLossPer100ft(lmr400.k1, lmr400.k2, 2500), 6.8, 0.15);
// Datasheet-anchored checks for every cable (dB/100 ft, matched). Sources: Belden tech data sheets 8240/8259/9258/8267/1694A,
// Times Microwave LMR datasheets, CommScope LDF4-50A / LDF5-50A product specifications.
const SHEET = {
  rg58:   [[10, 1.1], [100, 3.8], [400, 8.4], [1000, 14.5]],            // Belden 8240
  rg58a:  [[10, 1.5], [100, 5.4], [400, 12.4], [1000, 22.8]],           // Belden 8259
  rg8x:   [[10, 0.9], [100, 3.1], [400, 6.6], [1000, 11.2]],            // Belden 9258
  rg213:  [[10, 0.55], [100, 1.9], [1000, 8.0], [4000, 21.5]],          // Belden 8267
  lmr195: [[150, 4.4], [900, 11.1], [2500, 19.0]],                       // Times LMR-195
  lmr240: [[150, 3.0], [900, 7.6], [2500, 12.9]],                        // Times LMR-240
  lmr400: [[150, 1.5], [900, 3.9], [2500, 6.8]],                         // Times LMR-400
  lmr600: [[150, 1.0], [900, 2.5], [2500, 4.4]],                         // Times LMR-600
  lmr900: [[900, 1.7]],                                                  // Times LMR-900 formula value
  ldf4:   [[10, 0.205], [100, 0.661], [1000, 2.22], [2500, 3.685], [6000, 6.113]], // CommScope LDF4-50A
  ldf5:   [[10, 0.112], [100, 0.364], [1000, 1.254], [2500, 2.124], [5000, 3.228]], // CommScope LDF5-50A
  rg6:    [[10, 0.71], [100, 1.95], [1000, 6.3], [3000, 11.5], [6000, 17.7]]        // Belden 1694A
};
for (const c of RF.CABLES) {
  const pts = SHEET[c.id];
  if (!pts) { fail++; console.log("FAIL no datasheet test for " + c.id); continue; }
  for (const [f, want] of pts) rel(`${c.name} @ ${f} MHz vs datasheet (±${c.id === "rg213" ? 7 : 6}%)`, RF.cableLossPer100ft(c.k1, c.k2, f, c.k0), want, c.id === "rg213" ? 7 : 6);
}
const vf = id => RF.CABLES.find(c => c.id === id).vf;
near("RG-8X VF 0.82 (Belden 9258)", vf("rg8x"), 0.82, 1e-9);
near("RG-6 VF 0.82 (Belden 1694A)", vf("rg6"), 0.82, 1e-9);
near("RG-58 VF 0.66 (Belden 8240)", vf("rg58"), 0.66, 1e-9);
near("RG-213 VF 0.66 (Belden 8267)", vf("rg213"), 0.66, 1e-9);
const cl = RF.coaxLoss(lmr400, 30.48, 900, 100);
near("LMR-400 100 ft 900 MHz total", cl.totalDb, 3.9, 0.1);
near("power out", cl.poutW, 100 * Math.pow(10, -cl.totalDb / 10), 1e-9);

// --- propagation
near("radio horizon 10 m (4/3 earth) ≈ 13.0 km", RF.radioHorizonKm(10), 13.03, 0.05);
near("earth bulge midpoint 50 km path, k=4/3 (d1·d2/12.74k)", RF.earthBulgeM(25, 25), 625 / (12.742 * 4 / 3), 0.05);
near("two-ray 10 km, 30 m & 2 m", RF.twoRayLossDb(10000, 30, 2), 160 - 20 * Math.log10(60), 1e-9);

// --- pads / matching
const pi10 = RF.piPad(10, 50);
near("50Ω 10 dB Pi shunt", pi10.shunt, 96.25, 0.05);
near("50Ω 10 dB Pi series", pi10.series, 71.15, 0.05);
const t10 = RF.tPad(10, 50);
near("50Ω 10 dB T series", t10.series, 25.97, 0.02);
near("50Ω 10 dB T shunt", t10.shunt, 35.14, 0.02);
const ln = RF.lNetwork(50, 200, 10e6);
near("L-net Q 50->200", ln.q, Math.sqrt(3), 1e-12);
near("L-net series L (lowpass)", ln.lowpass.seriesL * 1e9, 86.6025 / (2 * Math.PI * 1e7) * 1e9, 1e-3);

// --- misc
near("LC 10 µH + 100 pF -> 5.033 MHz", RF.resonantFreq(10e-6, 100e-12) / 1e6, 5.0329, 1e-3);
near("XL 1 µH @ 10 MHz", RF.reactanceL(10e6, 1e-6), 62.83, 0.01);
near("XC 100 pF @ 10 MHz", RF.reactanceC(10e6, 100e-12), 159.15, 0.01);
near("skin depth Cu 1 MHz ≈ 65.2 µm", RF.skinDepth(1e6, RF.METALS.copper) * 1e6, 65.2, 0.3);
near("skin depth Cu 60 Hz ≈ 8.4 mm", RF.skinDepth(60, RF.METALS.copper) * 1e3, 8.42, 0.05);
const ms = RF.microstrip(3.0e-3, 1.6e-3, 4.4);
rel("microstrip FR-4 W=3.0 H=1.6 εr4.4 ≈ 50 Ω", ms.z0, 50, 3);
near("microstrip εeff", ms.eeff, 3.33, 0.03);
rel("microstrip Rogers 4350B εr3.66 H=0.508 W=1.10 ≈ 50 Ω", RF.microstrip(1.10e-3, 0.508e-3, 3.66).z0, 50, 3);
rel("microstrip synthesis round trip 50Ω FR-4", RF.microstrip(RF.microstripWidth(50, 4.4) * 1.6e-3, 1.6e-3, 4.4).z0, 50, 2);
rel("microstrip narrow line u<1 (W/H 0.5, εr 10) ≈ 65 Ω", RF.microstrip(0.5, 1, 10).z0, 65, 5);


// ======================= review fixes (REVIEW.md) =======================
function throws(name, fn, re) {
  let ok = false, msg = "";
  try { fn(); msg = "no error"; } catch (e) { msg = e.message; ok = !re || re.test(e.message); }
  ok ? pass++ : fail++;
  console.log((ok ? "PASS " : "FAIL ") + name + " -> throws: " + msg);
}
// M3: noise floor with a non-290 K source: N = k(Ts+Te)B
near("M3 50 K source + 1 dB NF, 1 MHz = -117.63 dBm", RF.systemNoise(1e6, 1, 50).noiseDbm, -117.63, 0.01);
near("M3 Tsys = 50 + 75.09 K", RF.systemNoise(1e6, 1, 50).tsysK, 125.09, 0.02);
near("M3 at 290 K equals kT0B + NF", RF.systemNoise(1e6, 3, 290).noiseDbm, RF.noiseFloorDbm(1e6, 3), 1e-9);
near("M3 0 K source + 0 dB NF -> -Infinity (no noise)", RF.systemNoise(1e6, 0, 0).noiseDbm, -Infinity, 0);
near("M3 0 K source + NF 1 dB -> receiver noise only", RF.systemNoise(1e6, 1, 0).noiseDbm, RF.thermalNoiseDbm(1e6, 75.0866), 0.001);
// m6: 0 K handled explicitly (not replaced by 290 K); negative rejected
near("m6 kTB at 0 K = -Infinity (not the 290 K value)", RF.thermalNoiseDbm(1e6, 0), -Infinity, 0);
near("m6 kTB default temperature still 290 K", RF.thermalNoiseDbm(1e6), -113.98, 0.01);
throws("m6 negative temperature rejected", () => RF.thermalNoiseDbm(1e6, -5), /Temperature/);
throws("m6 k-factor 0 rejected (not silently 4/3)", () => RF.radioHorizonKm(10, 0), /k-factor/);
near("m6 k-factor default 4/3", RF.radioHorizonKm(10), 13.03, 0.05);
throws("m6 velocity factor 0 rejected", () => RF.wavelength(1e6, 0), /Velocity factor/);
throws("m6 impedance 0 rejected", () => RF.powerAll(0, 0), /Impedance/);
// M4: L-network bandwidth 2f/Q (exact |S21|² sweep in REVIEW: 50->1000 Ω @14.2 MHz ≈ 6.89 MHz; 50->5000 Ω ≈ 2.88 MHz)
const l1 = RF.lNetwork(50, 1000, 14.2e6), l2 = RF.lNetwork(50, 5000, 14.2e6);
near("M4 50->1000 Ω BW = 2f/Q", l1.bandwidthHz, 2 * 14.2e6 / Math.sqrt(19), 1);
rel("M4 50->1000 Ω BW within 6% of simulated 6.89 MHz", l1.bandwidthHz, 6.89e6, 6);
rel("M4 50->5000 Ω BW within 2% of simulated 2.88 MHz", l2.bandwidthHz, 2.88e6, 2);
near("M4 loaded Q = Q/2", l1.loadedQ, Math.sqrt(19) / 2, 1e-12);
near("M4 low-Q flag (Q 1.73 < 3 -> not valid)", RF.lNetwork(50, 200, 1e7).bandwidthValid ? 1 : 0, 0, 0);
throws("M4/M5 L-network R <= 0 rejected", () => RF.lNetwork(0, 50, 1e7), /Source resistance/);
// M5: impossible inputs rejected
throws("M5 negative return loss", () => RF.vswrFromRL(-3), /Return loss/);
throws("M5 |Γ| > 1", () => RF.fromGamma(1.2), /Γ/);
throws("M5 |Γ| < 0", () => RF.fromGamma(-0.1), /Γ/);
throws("M5 VSWR < 1", () => RF.vswrFromVswr(0.8), /VSWR/);
throws("M5 forward power 0", () => RF.vswrFromPower(0, 0), /Forward power/);
throws("M5 negative reflected power", () => RF.vswrFromPower(10, -1), /Reflected power/);
throws("M5 reflected > forward", () => RF.vswrFromPower(10, 20), /exceed/);
throws("M5 negative load R", () => RF.vswrFromZ(-50, 0, 50), /Load resistance/);
throws("M5 Z0 <= 0", () => RF.vswrFromZ(50, 0, 0), /Z₀/);
near("M5 short circuit R=0 -> |Γ| = 1", RF.vswrFromZ(0, 0, 50).gamma, 1, 1e-12);
throws("M5 dish efficiency 150%", () => RF.dish({ dM: 1, fHz: 1e10, eff: 1.5, fd: 0.4 }), /Efficiency/);
throws("M5 dish efficiency 0", () => RF.dishGain(1, 1e10, 0), /Efficiency/);
throws("M5 dish F/D 0", () => RF.dish({ dM: 1, fHz: 1e10, eff: 0.6, fd: 0 }), /F\/D/);
throws("M5 dish diameter 0", () => RF.dishGain(0, 1e10, 0.6), /Diameter/);
throws("M5 dish reverse efficiency > 100%", () => RF.dishDiameterForGain(30, 1e10, 1.2), /Efficiency/);
throws("M5 FSPL distance 0", () => RF.fsplDb(0, 2400), /Distance/);
throws("M5 FSPL negative frequency", () => RF.fsplDb(1, -5), /Frequency/);
throws("M5 link budget negative cable loss", () => RF.linkBudget({ txDbm: 30, txLoss: -1, fMHz: 2400, dKm: 1, bwHz: 1e6 }), /Tx loss/);
throws("M5 link budget bandwidth 0", () => RF.linkBudget({ txDbm: 30, fMHz: 2400, dKm: 1, bwHz: 0 }), /Bandwidth/);
throws("M5 coax frequency 0", () => RF.coaxLoss(RF.CABLES[0], 10, 0, 100), /Frequency/);
throws("M5 coax negative length", () => RF.coaxLoss(RF.CABLES[0], -1, 100, 100), /Length/);
throws("M5 wavelength frequency 0", () => RF.wavelength(0), /Frequency/);
throws("M5 radio horizon negative height", () => RF.radioHorizonKm(-1), /height/);
throws("M5 two-ray height 0", () => RF.twoRayLossDb(1000, 0, 2), /Tx height/);
throws("M5 skin depth µr 0", () => RF.skinDepth(1e6, RF.METALS.copper, 0), /µr/);
throws("M5 microstrip εr < 1", () => RF.microstrip(1, 1, 0.5), /εr/);
throws("M5 microstrip width 0", () => RF.microstrip(0, 1, 4.4), /Trace width/);
throws("M5 pad 0 dB", () => RF.piPad(0, 50), /Attenuation/);
throws("M5 LC negative C", () => RF.resonantFreq(1e-6, -1e-12), /Capacitance/);
throws("M5 power in W <= 0", () => RF.toDbm(0, "W"), /greater than 0/);
throws("M5 noise factor < 1", () => RF.factorToNf(0.5), /Noise factor/);
throws("M5 negative NF", () => RF.nfToTemp(-1), /Noise figure/);
throws("M5 beamwidth 0", () => RF.gainFromBeamwidths(0, 10, 0.6), /Beamwidths/);
throws("M5 Shannon bandwidth 0", () => RF.shannonCapacity(0, 10), /Bandwidth/);
// m4: dish first null consistent with tapered beamwidth, uniform shown separately
const dn = RF.dish({ dM: 1.2, fHz: 12e9, eff: 0.65, fd: 0.4 });
near("m4 first null (taper) 1.2 m 12 GHz = 1.95°", dn.firstNullDeg, 1.95, 0.01);
near("m4 first null (uniform) 1.2 m 12 GHz = 1.46°", dn.firstNullUniformDeg, 1.456, 0.01);
near("m4 null-to-null = 2× first null", dn.bwfnDeg, 2 * dn.firstNullDeg, 1e-12);
// m5: full-wave loop ≈ 1005/f ft, independent of dipole shortening factor
near("m5 loop 14.2 MHz = 1005/14.2 = 70.77 ft", RF.wireLengths(14.2e6, 0.95).loopM / 0.3048, 1005 / 14.2, 0.01);
near("m5 loop ignores shortening factor", RF.wireLengths(14.2e6, 0.8).loopM, RF.wireLengths(14.2e6, 1).loopM, 1e-12);
// m7: microstrip synthesis never returns negative widths
near("m7 synthesis 5 Ω FR-4 positive & round-trips (±5%)", Math.abs(RF.microstrip(RF.microstripWidth(5, 4.4), 1, 4.4).z0 / 5 - 1) < 0.05 ? 1 : 0, 1, 0);
const sweep = [2, 5, 7, 10, 20, 30, 50, 75, 100, 150, 200].map(z => RF.microstripWidth(z, 4.4));
near("m7 synthesis sweep 2–200 Ω all positive", sweep.every(w => w > 0 && isFinite(w)) ? 1 : 0, 1, 0);
near("m7 Pozar Ex. 3.7 (50 Ω, εr 2.2): W/d = 3.081", RF.microstripWidth(50, 2.2), 3.081, 0.005);
throws("m7 invalid target Z0 0", () => RF.microstripWidth(0, 4.4), /Target/);
// m8: cascade rejects invalid stage data
throws("m8 passive stage with positive gain", () => RF.cascade([{ name: "Pad", gain: 3, passive: true }]), /passive/);
throws("m8 negative NF", () => RF.cascade([{ name: "Amp", gain: 10, nf: -1 }]), /NF can't be negative/);
throws("m8 non-numeric IP3 text", () => RF.cascade([{ name: "Amp", gain: 10, nf: 2, ip3: "abc", ip3Type: "OIP3" }]), /not a number/);
throws("m8 blank gain", () => RF.cascade([{ name: "Amp", gain: "", nf: 2 }]), /gain is required/);
near("m8 blank IP3 = ideal", RF.cascade([{ gain: 10, nf: 2, ip3: "", ip3Type: "OIP3" }]).iip3Dbm, Infinity, 0);
near("m8 passive stage NF = loss", RF.cascade([{ gain: -3, nf: 0, passive: true }, { gain: 20, nf: 2 }]).nfDb, 5, 0.01);
near("S1 SFDR re MDS = SFDR - SNR", cas.sfdrDb - 0, RF.cascade([
  { name: "LNA", gain: 20, nf: 1, ip3: 30, ip3Type: "OIP3", p1db: 20 }, { name: "BPF", gain: -2, nf: 2 },
  { name: "Mixer", gain: -7, nf: 7, ip3: 15, ip3Type: "IIP3" }, { name: "IF amp", gain: 20, nf: 4, ip3: 35, ip3Type: "OIP3" }], { bwHz: 1e6, snrReq: 10 }).sfdrMdsDb + 10, 1e-9);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
