/* RF Toolbox – pure calculation library (no DOM). UMD: works in browsers (window.RF) and Node (require).
   Functions throw RangeError (message suitable for the UI) on physically impossible / out-of-domain inputs. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RF = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var C = 299792458;            // speed of light, m/s
  var K_B = 1.380649e-23;       // Boltzmann, J/K
  var T0 = 290;                 // IEEE reference temperature for noise figure, K
  var MU0 = 4e-7 * Math.PI;     // permeability of free space
  var EARTH_R = 6371e3;         // mean earth radius, m
  var ETA0 = 376.730313668;     // free-space impedance, ohm
  var log10 = function (x) { return Math.log(x) / Math.LN10; };
  var dB = function (x) { return 10 * log10(x); };
  var undB = function (x) { return Math.pow(10, x / 10); };
  var deg = function (r) { return r * 180 / Math.PI; };
  var KT0_DBM_HZ = dB(K_B * T0 * 1000); // -173.98 dBm/Hz

  /* ---------------- validation helpers ---------------- */
  function dflt(x, d) { return (x === undefined || x === null) ? d : x; }
  function isNum(x) { return typeof x === "number" && !isNaN(x); }
  function fail(msg) { throw new RangeError(msg); }
  function gt0(x, name) { if (!isNum(x) || !(x > 0) || x === Infinity) fail(name + " must be greater than 0"); return x; }
  function ge0(x, name) { if (!isNum(x) || x < 0 || x === Infinity) fail(name + " must be 0 or more"); return x; }
  function finite(x, name) { if (!isNum(x) || !isFinite(x)) fail(name + " must be a number"); return x; }
  function frac(x, name) { if (!isNum(x) || !(x > 0) || x > 1) fail(name + " must be more than 0 and at most 100%"); return x; }
  function vfChk(x) { if (!isNum(x) || !(x > 0) || x > 1) fail("Velocity factor must be more than 0 and at most 1"); return x; }

  /* ---------------- power / unit conversions ---------------- */
  function dbmToW(dbm) { return Math.pow(10, (dbm - 30) / 10); }
  function wToDbm(w) { return 10 * log10(w) + 30; }
  function powerAll(dbm, z) {
    z = gt0(dflt(z, 50), "Impedance"); finite(dbm, "Power");
    var w = dbmToW(dbm), vrms = Math.sqrt(w * z);
    return {
      dBm: dbm, dBW: dbm - 30, W: w, mW: w * 1e3, uW: w * 1e6,
      Vrms: vrms, Vpk: vrms * Math.SQRT2, Vpp: vrms * 2 * Math.SQRT2,
      dBuV: 20 * log10(vrms / 1e-6), dBmV: 20 * log10(vrms / 1e-3), Irms: vrms / z
    };
  }
  function toDbm(value, unit, z) {
    z = gt0(dflt(z, 50), "Impedance"); finite(value, "Value");
    var lin = { W: 1, mW: 1, uW: 1, kW: 1, Vrms: 1, Vpk: 1, Vpp: 1 };
    if (lin[unit] && !(value > 0)) fail("A " + (unit.charAt(0) === "V" ? "voltage" : "power") + " in " + unit + " must be greater than 0");
    switch (unit) {
      case "dBm": return value;
      case "dBW": return value + 30;
      case "W": return wToDbm(value);
      case "mW": return wToDbm(value / 1e3);
      case "uW": return wToDbm(value / 1e6);
      case "kW": return wToDbm(value * 1e3);
      case "dBuV": return wToDbm(Math.pow(Math.pow(10, value / 20) * 1e-6, 2) / z);
      case "dBmV": return wToDbm(Math.pow(Math.pow(10, value / 20) * 1e-3, 2) / z);
      case "Vrms": return wToDbm(value * value / z);
      case "Vpk": return wToDbm(Math.pow(value / Math.SQRT2, 2) / z);
      case "Vpp": return wToDbm(Math.pow(value / (2 * Math.SQRT2), 2) / z);
      default: throw new Error("unknown power unit " + unit);
    }
  }
  function wavelength(fHz, vf) { gt0(fHz, "Frequency"); return C * vfChk(dflt(vf, 1)) / fHz; }
  function frequencyFromWavelength(lambdaM, vf) { gt0(lambdaM, "Wavelength"); return C * vfChk(dflt(vf, 1)) / lambdaM; }
  function dbRatio(ratio, kind) { gt0(ratio, "Ratio"); return (kind === "voltage" ? 20 : 10) * log10(ratio); }
  function ratioFromDb(db, kind) { finite(db, "dB value"); return Math.pow(10, db / (kind === "voltage" ? 20 : 10)); }

  /* ---------------- noise ---------------- */
  // k·T·B in dBm. T = 0 K is valid and gives -Infinity; negative T is rejected.
  function thermalNoiseDbm(bwHz, tempK) { gt0(bwHz, "Bandwidth"); var t = ge0(dflt(tempK, T0), "Temperature"); return dB(K_B * t * bwHz * 1000); }
  // receiver noise floor with a 290 K source: kT0B + NF
  function noiseFloorDbm(bwHz, nfDb) { return thermalNoiseDbm(bwHz) + ge0(dflt(nfDb, 0), "Noise figure"); }
  // general case: source/antenna temperature Ts. N = k·(Ts + Te)·B with Te = 290·(F−1)
  function systemNoise(bwHz, nfDb, tSrcK) {
    gt0(bwHz, "Bandwidth"); var nf = ge0(dflt(nfDb, 0), "Noise figure"), ts = ge0(dflt(tSrcK, T0), "Source temperature");
    var te = nfToTemp(nf), tsys = ts + te;
    return { teK: te, tsysK: tsys, noiseDbm: dB(K_B * tsys * bwHz * 1000), ktsbDbm: dB(K_B * ts * bwHz * 1000), densityDbmHz: dB(K_B * tsys * 1000) };
  }
  function nfToTemp(nfDb) { ge0(nfDb, "Noise figure"); return T0 * (undB(nfDb) - 1); }
  function tempToNf(tK) { ge0(tK, "Noise temperature"); return dB(1 + tK / T0); }
  function nfToFactor(nfDb) { ge0(nfDb, "Noise figure"); return undB(nfDb); }
  function factorToNf(F) { if (!isNum(F) || F < 1) fail("Noise factor must be 1 or more"); return dB(F); }
  function ebn0FromSnr(snrDb, bwHz, bitRate) { gt0(bwHz, "Bandwidth"); gt0(bitRate, "Bit rate"); return snrDb + dB(bwHz / bitRate); }
  function snrFromEbn0(ebn0Db, bwHz, bitRate) { gt0(bwHz, "Bandwidth"); gt0(bitRate, "Bit rate"); return ebn0Db - dB(bwHz / bitRate); }
  function shannonCapacity(bwHz, snrDb) { gt0(bwHz, "Bandwidth"); finite(snrDb, "SNR"); return bwHz * Math.log2(1 + undB(snrDb)); }

  /* ---------------- link budget ---------------- */
  var FSPL_CONST = 20 * log10(4 * Math.PI * 1e3 * 1e6 / C); // 32.4478
  function fsplDb(dKm, fMHz) { gt0(dKm, "Distance"); gt0(fMHz, "Frequency"); return 20 * log10(dKm) + 20 * log10(fMHz) + FSPL_CONST; }
  function fresnelRadius(fHz, d1m, d2m, n) {
    gt0(fHz, "Frequency"); gt0(d1m, "Distance d1"); gt0(d2m, "Distance d2"); n = gt0(dflt(n, 1), "Zone number");
    return Math.sqrt(n * (C / fHz) * d1m * d2m / (d1m + d2m));
  }
  /* p: {txDbm, txLoss, txGain, fMHz, dKm, extraLoss, rxGain, rxLoss, bwHz, nfDb, snrReq, sensDbm (optional)} */
  function linkBudget(p) {
    finite(p.txDbm, "Tx power");
    var txL = ge0(dflt(p.txLoss, 0), "Tx loss"), rxL = ge0(dflt(p.rxLoss, 0), "Rx loss"), ex = ge0(dflt(p.extraLoss, 0), "Extra loss");
    var eirp = p.txDbm - txL + dflt(p.txGain, 0);
    var fspl = fsplDb(p.dKm, p.fMHz);
    var prx = eirp - fspl - ex + dflt(p.rxGain, 0) - rxL;
    var nf = noiseFloorDbm(p.bwHz, dflt(p.nfDb, 0));
    var useSens = p.sensDbm !== undefined && p.sensDbm !== null;
    var sens = useSens ? finite(p.sensDbm, "Sensitivity") : nf + dflt(p.snrReq, 0);
    var margin = prx - sens;
    var r1 = fresnelRadius(p.fMHz * 1e6, p.dKm * 500, p.dKm * 500, 1);
    return {
      eirpDbm: eirp, eirpW: dbmToW(eirp), erpDbm: eirp - 2.15, fsplDb: fspl, prxDbm: prx,
      noiseFloorDbm: nf, snrDb: prx - nf, sensDbm: sens, marginDb: margin,
      maxRangeKm: p.dKm * Math.pow(10, margin / 20),
      fresnelMidM: r1, fresnel60M: 0.6 * r1
    };
  }

  /* ---------------- cascade ---------------- */
  /* stages: [{name, gain, nf, ip3, ip3Type:'OIP3'|'IIP3', p1db (output P1dB), passive}]
     gain & nf are required numbers. ip3/p1db: blank ("" / null / undefined) = ideal (∞); anything else must be numeric. */
  function blank(x) { return x === "" || x === null || x === undefined || (typeof x === "string" && x.trim() === ""); }
  function stageNum(x, label, nm, required) {
    if (blank(x)) { if (required) fail(nm + ": " + label + " is required"); return null; }
    var n = typeof x === "number" ? x : Number(String(x).replace(",", ".").replace("\u2212", "-"));
    if (!isFinite(n)) fail(nm + ": " + label + " is not a number");
    return n;
  }
  function cascade(stages, opts) {
    opts = opts || {};
    if (!stages || !stages.length) fail("Add at least one stage");
    var gBefore = 1, Fsum = 0, ip3Inv = 0, p1Inv = 0, rows = [], nfTerms = [], ipTerms = [];
    stages.forEach(function (s, i) {
      var nm = s.name || ("Stage " + (i + 1));
      var g = stageNum(s.gain, "gain", nm, true);
      if (s.passive && g > 0) fail(nm + ": a passive stage can't have positive gain");
      var nf = s.passive ? -g : stageNum(s.nf, "NF", nm, true);
      if (nf < 0) fail(nm + ": NF can't be negative");
      var G = undB(g), F = undB(nf);
      var nfTerm = i === 0 ? F : (F - 1) / gBefore;
      Fsum += nfTerm;
      var ip3 = stageNum(s.ip3, s.ip3Type || "IP3", nm, false);
      var iip3 = ip3 === null ? Infinity : ((s.ip3Type === "IIP3") ? ip3 : ip3 - g);
      var ipTerm = isFinite(iip3) ? gBefore / (dbmToW(iip3) * 1000) : 0; // 1/mW
      ip3Inv += ipTerm;
      var p1 = stageNum(s.p1db, "OP1dB", nm, false), ip1 = p1 === null ? Infinity : p1 - g + 1;
      p1Inv += isFinite(ip1) ? gBefore / (dbmToW(ip1) * 1000) : 0;
      gBefore *= G;
      var cumG = dB(gBefore), cumIip3 = ip3Inv > 0 ? dB(1 / ip3Inv) : Infinity, cumIp1 = p1Inv > 0 ? dB(1 / p1Inv) : Infinity;
      nfTerms.push(i === 0 ? F - 1 : nfTerm); ipTerms.push(ipTerm);
      rows.push({
        name: nm, gain: g, nf: nf, iip3: iip3, oip3: iip3 + g, ip1dbInRef: ip1 - (cumG - g), // stage IP1 referred to cascade input
        cumGain: cumG, cumNf: dB(Fsum), cumTempK: T0 * (Fsum - 1), cumIip3: cumIip3, cumOip3: cumIip3 + cumG,
        cumIp1db: cumIp1, cumOp1db: cumIp1 + cumG - 1
      });
    });
    var nfTot = dB(Fsum), Gtot = dB(gBefore);
    var iip3Tot = ip3Inv > 0 ? dB(1 / ip3Inv) : Infinity, ip1Tot = p1Inv > 0 ? dB(1 / p1Inv) : Infinity;
    var totalNfExcess = Fsum - 1;
    rows.forEach(function (r, i) {
      r.nfContribPct = totalNfExcess > 0 ? 100 * nfTerms[i] / totalNfExcess : 0;
      r.ip3ContribPct = ip3Inv > 0 ? 100 * ipTerms[i] / ip3Inv : 0;
    });
    var res = {
      rows: rows, gainDb: Gtot, nfDb: nfTot, noiseFactor: Fsum, tempK: T0 * (Fsum - 1),
      iip3Dbm: iip3Tot, oip3Dbm: iip3Tot + Gtot, ip1dbDbm: ip1Tot, op1dbDbm: ip1Tot + Gtot - 1
    };
    if (opts.bwHz !== undefined && opts.bwHz !== null) {
      gt0(opts.bwHz, "Bandwidth");
      var snr = dflt(opts.snrReq, 0);
      res.noiseFloorInDbm = noiseFloorDbm(opts.bwHz, nfTot);
      res.noiseFloorOutDbm = res.noiseFloorInDbm + Gtot;
      res.mdsDbm = res.noiseFloorInDbm + snr;
      res.sfdrDb = isFinite(iip3Tot) ? (2 / 3) * (iip3Tot - res.noiseFloorInDbm) : Infinity;      // re noise floor (Pozar)
      res.sfdrMdsDb = isFinite(iip3Tot) ? res.sfdrDb - snr : Infinity;                              // re MDS (Razavi)
      res.cdrDb = isFinite(ip1Tot) ? ip1Tot - res.noiseFloorInDbm : Infinity;
    }
    return res;
  }

  /* ---------------- antennas ---------------- */
  function dishGain(dM, fHz, eff) { gt0(dM, "Diameter"); frac(eff, "Efficiency"); var l = wavelength(fHz); return dB(eff * Math.pow(Math.PI * dM / l, 2)); }
  function dish(p) { // {dM, fHz, eff (0..1], fd}
    var D = gt0(p.dM, "Diameter"), l = wavelength(p.fHz); frac(p.eff, "Efficiency"); gt0(p.fd, "F/D");
    var f = p.fd * D, psi0 = 2 * Math.atan(1 / (4 * p.fd));
    return {
      lambdaM: l, gainDbi: dishGain(D, p.fHz, p.eff), gainLinear: p.eff * Math.pow(Math.PI * D / l, 2),
      bw3dBDeg: 70 * l / D,                                  // typical edge taper
      firstNullDeg: deg(1.635 * l / D), bwfnDeg: 2 * deg(1.635 * l / D),   // (1−r²) taper, consistent with ~70λ/D HPBW
      firstNullUniformDeg: deg(1.22 * l / D),                // uniform illumination (minimum possible)
      focalM: f, depthM: D * D / (16 * f), apertureM2: Math.PI * D * D / 4, effApertureM2: p.eff * Math.PI * D * D / 4,
      farFieldM: 2 * D * D / l, edgeHalfAngleDeg: deg(psi0), illumAngleDeg: 2 * deg(psi0),
      spaceTaperDb: 20 * log10((1 + Math.cos(psi0)) / 2)
    };
  }
  function dishDiameterForGain(gDbi, fHz, eff) { finite(gDbi, "Gain"); frac(eff, "Efficiency"); var l = wavelength(fHz); return l / Math.PI * Math.sqrt(undB(gDbi) / eff); }
  function effectiveAperture(gDbi, fHz) { finite(gDbi, "Gain"); var l = wavelength(fHz); return undB(gDbi) * l * l / (4 * Math.PI); }
  function gainFromAperture(aeM2, fHz) { gt0(aeM2, "Effective aperture"); var l = wavelength(fHz); return dB(4 * Math.PI * aeM2 / (l * l)); }
  function dbiToDbd(x) { return x - 2.15; }
  function dbdToDbi(x) { return x + 2.15; }
  var LOOP_FACTOR = 1005 * 0.3048 / 299.792458; // ARRL: full-wave loop ≈ 1005/f_MHz ft = 1.0218 λ
  function wireLengths(fHz, k) { // k = velocity / shortening factor for dipoles/verticals
    var l = wavelength(fHz); k = dflt(k, 1); if (!(k > 0) || k > 1) fail("Shortening factor must be more than 0 and at most 1");
    return { lambdaM: l, halfWaveM: 0.5 * l * k, quarterWaveM: 0.25 * l * k, fiveEighthM: 0.625 * l * k, fullWaveM: l * k, loopM: LOOP_FACTOR * l };
  }
  function hornGain(aM, bM, fHz, eff) { gt0(aM, "Width A"); gt0(bM, "Height B"); var e = frac(dflt(eff, 0.51), "Efficiency"); var l = wavelength(fHz); return dB(e * 4 * Math.PI * aM * bM / (l * l)); }
  function gainFromBeamwidths(thetaEdeg, thetaHdeg, eff) {
    if (!(thetaEdeg > 0 && thetaEdeg <= 360 && thetaHdeg > 0 && thetaHdeg <= 360)) fail("Beamwidths must be between 0 and 360°");
    return dB(frac(dflt(eff, 1), "Efficiency") * 41253 / (thetaEdeg * thetaHdeg));
  }
  function eirp(pDbm, lossDb, gDbi) { finite(pDbm, "Power"); ge0(lossDb, "Loss"); var e = pDbm - lossDb + gDbi; return { eirpDbm: e, erpDbm: e - 2.15, eirpW: dbmToW(e), erpW: dbmToW(e - 2.15) }; }

  /* ---------------- VSWR / mismatch ---------------- */
  function fromGamma(g) {
    if (!isNum(g) || g < 0 || g > 1) fail("|Γ| must be between 0 and 1");
    return {
      gamma: g, vswr: g >= 1 ? Infinity : (1 + g) / (1 - g), returnLossDb: g > 0 ? -20 * log10(g) : Infinity,
      mismatchLossDb: g >= 1 ? Infinity : -10 * log10(1 - g * g), reflectedPct: 100 * g * g, transmittedPct: 100 * (1 - g * g)
    };
  }
  function vswrFromVswr(s) { if (!isNum(s) || s < 1) fail("VSWR must be 1 or more"); return fromGamma(s === Infinity ? 1 : (s - 1) / (s + 1)); }
  function vswrFromRL(rl) { if (!isNum(rl) || rl < 0) fail("Return loss must be 0 dB or more (a passive load can't reflect more than it receives)"); return fromGamma(Math.pow(10, -rl / 20)); }
  function vswrFromPower(pf, pr) { gt0(pf, "Forward power"); ge0(pr, "Reflected power"); if (pr > pf) fail("Reflected power can't exceed forward power"); return fromGamma(Math.sqrt(pr / pf)); }
  function vswrFromZ(r, x, z0) {
    ge0(r, "Load resistance"); finite(x, "Reactance"); gt0(z0, "Z₀");
    var nr = r - z0, ni = x, dr = r + z0, di = x, den = dr * dr + di * di;
    var gr = (nr * dr + ni * di) / den, gi = (ni * dr - nr * di) / den;
    var o = fromGamma(Math.min(1, Math.sqrt(gr * gr + gi * gi)));
    o.gammaRe = gr; o.gammaIm = gi; o.gammaAngleDeg = deg(Math.atan2(gi, gr));
    return o;
  }

  /* ---------------- coax ---------------- */
  // Matched-line attenuation, dB/100 ft = k0 + k1·√f + k2·f (f in MHz; k0 normally 0).
  var CABLES = [
    { id: "rg58", name: "RG-58/U (solid, Belden 8240)", k1: 0.33302, k2: 0.004102, vf: 0.66, z0: 52, src: "fit to Belden 8240 datasheet, 10–1000 MHz, ±2.4%" },
    { id: "rg58a", name: "RG-58A/U (stranded, Belden 8259)", k1: 0.45519, k2: 0.008294, vf: 0.66, z0: 50, src: "fit to Belden 8259 datasheet, 10–1000 MHz, ±1.8%" },
    { id: "rg8x", name: "RG-8X (Belden 9258)", k1: 0.27998, k2: 0.002476, vf: 0.82, z0: 50, src: "fit to Belden 9258 datasheet, 10–1000 MHz, ±1.7%" },
    { id: "rg213", name: "RG-213/U (Belden 8267)", k1: 0.16234, k2: 0.002785, vf: 0.66, z0: 50, src: "fit to Belden 8267 datasheet, 10–4000 MHz, ±6.4%" },
    { id: "lmr195", name: "LMR-195", k1: 0.356859, k2: 0.00047, vf: 0.80, z0: 50, src: "Times Microwave datasheet formula" },
    { id: "lmr240", name: "LMR-240", k1: 0.24208, k2: 0.00033, vf: 0.84, z0: 50, src: "Times Microwave datasheet formula" },
    { id: "lmr400", name: "LMR-400", k1: 0.12229, k2: 0.00026, vf: 0.85, z0: 50, src: "Times Microwave datasheet formula" },
    { id: "lmr600", name: "LMR-600", k1: 0.07555, k2: 0.00026, vf: 0.87, z0: 50, src: "Times Microwave datasheet formula" },
    { id: "lmr900", name: "LMR-900", k1: 0.05177, k2: 0.00016, vf: 0.87, z0: 50, src: "Times Microwave datasheet formula" },
    { id: "ldf4", name: "1/2\" Heliax LDF4-50A", k1: 0.06419, k2: 0.000190, vf: 0.88, z0: 50, src: "fit to CommScope LDF4-50A datasheet, 10–6000 MHz" },
    { id: "ldf5", name: "7/8\" Heliax LDF5-50A", k1: 0.03488, k2: 0.000152, vf: 0.89, z0: 50, src: "fit to CommScope LDF5-50A datasheet, 10–5000 MHz" },
    { id: "rg6", name: "RG-6 (75 Ω, Belden 1694A)", k0: 0.14123, k1: 0.17570, k2: 0.000597, vf: 0.82, z0: 75, src: "3-term fit to Belden 1694A datasheet, 5–6000 MHz, ±4%" }
  ];
  function cableLossPer100ft(k1, k2, fMHz, k0) { gt0(fMHz, "Frequency"); return dflt(k0, 0) + k1 * Math.sqrt(fMHz) + k2 * fMHz; }
  function coaxLoss(cable, lengthM, fMHz, pinW) {
    ge0(lengthM, "Length"); ge0(pinW, "Power in"); vfChk(cable.vf);
    if (!(cable.k1 >= 0 && cable.k2 >= 0 && dflt(cable.k0, 0) >= 0)) fail("Cable coefficients must be 0 or more");
    var per100ft = cableLossPer100ft(cable.k1, cable.k2, fMHz, cable.k0), per100m = per100ft / 0.3048;
    var total = per100m * lengthM / 100, pout = pinW * undB(-total);
    return { per100ftDb: per100ft, per100mDb: per100m, totalDb: total, poutW: pout, deliveredPct: 100 * undB(-total), heatW: pinW - pout,
      vf: cable.vf, electricalWavelengths: lengthM / (C * cable.vf / (fMHz * 1e6)) };
  }

  /* ---------------- propagation ---------------- */
  function kChk(k) { k = dflt(k, 4 / 3); return gt0(k, "k-factor"); }
  function radioHorizonKm(hM, k) { ge0(hM, "Antenna height"); return Math.sqrt(2 * kChk(k) * EARTH_R * hM) / 1000; }
  function earthBulgeM(d1Km, d2Km, k) { ge0(d1Km, "Distance d1"); ge0(d2Km, "Distance d2"); return (d1Km * 1000) * (d2Km * 1000) / (2 * kChk(k) * EARTH_R); }
  function twoRayLossDb(dM, htM, hrM) { gt0(dM, "Distance"); gt0(htM, "Tx height"); gt0(hrM, "Rx height"); return 40 * log10(dM) - 20 * log10(htM * hrM); }
  function twoRayCrossoverM(htM, hrM, fHz) { gt0(htM, "Tx height"); gt0(hrM, "Rx height"); return 4 * Math.PI * htM * hrM / wavelength(fHz); }
  function nearFarField(dM, fHz) {
    gt0(dM, "Antenna size"); var l = wavelength(fHz);
    return { lambdaM: l, reactiveNearM: 0.62 * Math.sqrt(dM * dM * dM / l), farFieldM: 2 * dM * dM / l, smallAntennaM: l / (2 * Math.PI) };
  }

  /* ---------------- attenuators & matching ---------------- */
  function padK(db, z0) { gt0(db, "Attenuation"); gt0(z0, "Impedance"); return Math.pow(10, db / 20); }
  function piPad(db, z0) { var K = padK(db, z0); return { shunt: z0 * (K + 1) / (K - 1), series: z0 * (K * K - 1) / (2 * K) }; }
  function tPad(db, z0) { var K = padK(db, z0); return { series: z0 * (K - 1) / (K + 1), shunt: z0 * 2 * K / (K * K - 1) }; }
  // L-network between two resistances. Q = node Q; with a matched source the loaded Q is Q/2 so BW(−3 dB) ≈ 2f/Q.
  function lNetwork(rs, rl, fHz) {
    gt0(rs, "Source resistance"); gt0(rl, "Load resistance"); gt0(fHz, "Frequency");
    var rmin = Math.min(rs, rl), rmax = Math.max(rs, rl), w = 2 * Math.PI * fHz;
    if (rmax === rmin) return { q: 0, same: true };
    var q = Math.sqrt(rmax / rmin - 1), xs = q * rmin, xp = rmax / q;
    return {
      q: q, loadedQ: q / 2, xSeries: xs, xShunt: xp, shuntSide: rs > rl ? "source" : "load",
      lowpass: { seriesL: xs / w, shuntC: 1 / (w * xp) },
      highpass: { seriesC: 1 / (w * xs), shuntL: xp / w },
      bandwidthHz: 2 * fHz / q, bandwidthValid: q >= 3
    };
  }

  /* ---------------- misc ---------------- */
  function resonantFreq(lH, cF) { gt0(lH, "Inductance"); gt0(cF, "Capacitance"); return 1 / (2 * Math.PI * Math.sqrt(lH * cF)); }
  function resonantL(fHz, cF) { gt0(fHz, "Frequency"); gt0(cF, "Capacitance"); var w = 2 * Math.PI * fHz; return 1 / (w * w * cF); }
  function resonantC(fHz, lH) { gt0(fHz, "Frequency"); gt0(lH, "Inductance"); var w = 2 * Math.PI * fHz; return 1 / (w * w * lH); }
  function reactanceL(fHz, lH) { gt0(fHz, "Frequency"); gt0(lH, "Inductance"); return 2 * Math.PI * fHz * lH; }
  function reactanceC(fHz, cF) { gt0(fHz, "Frequency"); gt0(cF, "Capacitance"); return 1 / (2 * Math.PI * fHz * cF); }
  var METALS = { copper: 1.68e-8, silver: 1.59e-8, gold: 2.44e-8, aluminum: 2.65e-8, brass: 7.0e-8, steel_stainless: 6.9e-7 };
  function skinDepth(fHz, rho, mur) { gt0(fHz, "Frequency"); gt0(rho, "Resistivity"); var m = gt0(dflt(mur, 1), "µr"); return Math.sqrt(rho / (Math.PI * fHz * MU0 * m)); }
  function erChk(er) { if (!isNum(er) || er < 1 || !isFinite(er)) fail("εr must be 1 or more"); return er; }
  // Hammerstad (1975) closed forms as given in Pozar §3.8 (zero-thickness strip, quasi-static)
  function microstrip(wM, hM, er) {
    gt0(wM, "Trace width"); gt0(hM, "Substrate height"); erChk(er);
    var u = wM / hM, eeff, z0;
    if (u < 1) {
      eeff = (er + 1) / 2 + (er - 1) / 2 * (Math.pow(1 + 12 / u, -0.5) + 0.04 * Math.pow(1 - u, 2));
      z0 = 60 / Math.sqrt(eeff) * Math.log(8 / u + u / 4);
    } else {
      eeff = (er + 1) / 2 + (er - 1) / 2 * Math.pow(1 + 12 / u, -0.5);
      z0 = ETA0 / (Math.sqrt(eeff) * (u + 1.393 + 0.667 * Math.log(u + 1.444)));
    }
    return { z0: z0, eeff: eeff, wh: u, vf: 1 / Math.sqrt(eeff) };
  }
  // Wheeler synthesis (Pozar eq. 3.197): W/H for a target Z0. Uses the A-form only when it is valid (0 < W/H ≤ 2).
  function microstripWidth(z0, er) {
    gt0(z0, "Target Z₀"); erChk(er);
    var A = z0 / 60 * Math.sqrt((er + 1) / 2) + (er - 1) / (er + 1) * (0.23 + 0.11 / er);
    var den = Math.exp(2 * A) - 2, wh = den > 0 ? 8 * Math.exp(A) / den : NaN;
    if (!(wh > 0 && wh <= 2)) {
      var B = 377 * Math.PI / (2 * z0 * Math.sqrt(er));
      wh = (B > 1) ? 2 / Math.PI * (B - 1 - Math.log(2 * B - 1) + (er - 1) / (2 * er) * (Math.log(B - 1) + 0.39 - 0.61 / er)) : NaN;
    }
    if (!(wh > 0) || !isFinite(wh)) fail("Target Z₀ is outside the range these formulas can synthesize");
    return wh;
  }

  return {
    C: C, K_B: K_B, T0: T0, KT0_DBM_HZ: KT0_DBM_HZ, EARTH_R: EARTH_R, FSPL_CONST: FSPL_CONST, LOOP_FACTOR: LOOP_FACTOR,
    dB: dB, undB: undB, log10: log10,
    dbmToW: dbmToW, wToDbm: wToDbm, powerAll: powerAll, toDbm: toDbm, wavelength: wavelength, frequencyFromWavelength: frequencyFromWavelength,
    dbRatio: dbRatio, ratioFromDb: ratioFromDb,
    thermalNoiseDbm: thermalNoiseDbm, noiseFloorDbm: noiseFloorDbm, systemNoise: systemNoise, nfToTemp: nfToTemp, tempToNf: tempToNf, nfToFactor: nfToFactor, factorToNf: factorToNf,
    ebn0FromSnr: ebn0FromSnr, snrFromEbn0: snrFromEbn0, shannonCapacity: shannonCapacity,
    fsplDb: fsplDb, fresnelRadius: fresnelRadius, linkBudget: linkBudget, cascade: cascade,
    dish: dish, dishGain: dishGain, dishDiameterForGain: dishDiameterForGain, effectiveAperture: effectiveAperture, gainFromAperture: gainFromAperture,
    dbiToDbd: dbiToDbd, dbdToDbi: dbdToDbi, wireLengths: wireLengths, hornGain: hornGain, gainFromBeamwidths: gainFromBeamwidths, eirp: eirp,
    fromGamma: fromGamma, vswrFromVswr: vswrFromVswr, vswrFromRL: vswrFromRL, vswrFromPower: vswrFromPower, vswrFromZ: vswrFromZ,
    CABLES: CABLES, cableLossPer100ft: cableLossPer100ft, coaxLoss: coaxLoss,
    radioHorizonKm: radioHorizonKm, earthBulgeM: earthBulgeM, twoRayLossDb: twoRayLossDb, twoRayCrossoverM: twoRayCrossoverM, nearFarField: nearFarField,
    piPad: piPad, tPad: tPad, lNetwork: lNetwork,
    resonantFreq: resonantFreq, resonantL: resonantL, resonantC: resonantC, reactanceL: reactanceL, reactanceC: reactanceC,
    METALS: METALS, skinDepth: skinDepth, microstrip: microstrip, microstripWidth: microstripWidth
  };
});
