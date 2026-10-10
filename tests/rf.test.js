// Unit tests for js/rf.js against reference values. Run: node tests/rf.test.js
const RF = require("../js/rf.js");
let pass = 0, fail = 0;
function near(name, got, want, tol) {
  const ok = Math.abs(got - want) <= tol;
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
const rg213 = RF.CABLES.find(c => c.id === "rg213");
rel("RG-213 @ 146 MHz ≈2.8 dB/100ft (typ.)", RF.cableLossPer100ft(rg213.k1, rg213.k2, 146), 2.8, 12);
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
