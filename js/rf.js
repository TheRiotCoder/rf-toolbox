/* RF Toolbox – pure calculation library (no DOM). UMD: works in browsers (window.RF) and Node (require). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RF = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var C = 299792458;            // speed of light, m/s
  var K_B = 1.380649e-23;       // Boltzmann, J/K
  var T0 = 290;                 // reference temperature, K
  var MU0 = 4e-7 * Math.PI;     // permeability of free space
  var EARTH_R = 6371e3;         // mean earth radius, m
  var ETA0 = 376.730313668;     // free-space impedance, ohm
  var log10 = function (x) { return Math.log(x) / Math.LN10; };
  var dB = function (x) { return 10 * log10(x); };
  var undB = function (x) { return Math.pow(10, x / 10); };
  var deg = function (r) { return r * 180 / Math.PI; };
  var rad = function (d) { return d * Math.PI / 180; };
  var KT0_DBM_HZ = dB(K_B * T0 * 1000); // -173.98 dBm/Hz

  /* ---------------- power / unit conversions ---------------- */
  function dbmToW(dbm) { return Math.pow(10, (dbm - 30) / 10); }
  function wToDbm(w) { return 10 * log10(w) + 30; }
  // complete set of power/voltage representations from dBm and impedance (ohm)
  function powerAll(dbm, z) {
    z = z || 50;
    var w = dbmToW(dbm), vrms = Math.sqrt(w * z);
    return {
      dBm: dbm, dBW: dbm - 30, W: w, mW: w * 1e3, uW: w * 1e6,
      Vrms: vrms, Vpk: vrms * Math.SQRT2, Vpp: vrms * 2 * Math.SQRT2,
      dBuV: 20 * log10(vrms / 1e-6), dBmV: 20 * log10(vrms / 1e-3), Irms: vrms / z
    };
  }
  // anything -> dBm
  function toDbm(value, unit, z) {
    z = z || 50;
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
  function wavelength(fHz, vf) { return C * (vf || 1) / fHz; }
  function frequencyFromWavelength(lambdaM, vf) { return C * (vf || 1) / lambdaM; }
  function dbRatio(ratio, kind) { return (kind === "voltage" ? 20 : 10) * log10(ratio); }
  function ratioFromDb(db, kind) { return Math.pow(10, db / (kind === "voltage" ? 20 : 10)); }

  /* ---------------- noise ---------------- */
  function thermalNoiseDbm(bwHz, tempK) { return dB(K_B * (tempK || T0) * bwHz * 1000); }
  function noiseFloorDbm(bwHz, nfDb) { return thermalNoiseDbm(bwHz) + (nfDb || 0); }
  function nfToTemp(nfDb) { return T0 * (undB(nfDb) - 1); }
  function tempToNf(tK) { return dB(1 + tK / T0); }
  function nfToFactor(nfDb) { return undB(nfDb); }
  function factorToNf(F) { return dB(F); }
  function ebn0FromSnr(snrDb, bwHz, bitRate) { return snrDb + dB(bwHz / bitRate); }
  function snrFromEbn0(ebn0Db, bwHz, bitRate) { return ebn0Db - dB(bwHz / bitRate); }
  function shannonCapacity(bwHz, snrDb) { return bwHz * Math.log2(1 + undB(snrDb)); }

  /* ---------------- link budget ---------------- */
  // FSPL (dB) = 20log10(d_km) + 20log10(f_MHz) + 32.45 (exact constant 20log10(4π·1e9/c) = 32.4478)
  var FSPL_CONST = 20 * log10(4 * Math.PI * 1e3 * 1e6 / C);
  function fsplDb(dKm, fMHz) { return 20 * log10(dKm) + 20 * log10(fMHz) + FSPL_CONST; }
  function fresnelRadius(fHz, d1m, d2m, n) {
    n = n || 1; var l = C / fHz;
    return Math.sqrt(n * l * d1m * d2m / (d1m + d2m));
  }
  /* p: {txDbm, txLoss, txGain, fMHz, dKm, extraLoss, rxGain, rxLoss, bwHz, nfDb, snrReq, sensDbm (optional)} */
  function linkBudget(p) {
    var eirp = p.txDbm - (p.txLoss || 0) + (p.txGain || 0);
    var fspl = fsplDb(p.dKm, p.fMHz);
    var prx = eirp - fspl - (p.extraLoss || 0) + (p.rxGain || 0) - (p.rxLoss || 0);
    var nf = (p.bwHz > 0) ? noiseFloorDbm(p.bwHz, p.nfDb || 0) : NaN;
    var sens = (p.sensDbm !== undefined && p.sensDbm !== null && isFinite(p.sensDbm)) ? p.sensDbm : nf + (p.snrReq || 0);
    var margin = prx - sens;
    var r1 = fresnelRadius(p.fMHz * 1e6, p.dKm * 500, p.dKm * 500, 1);
    return {
      eirpDbm: eirp, eirpW: dbmToW(eirp), erpDbm: eirp - 2.15, fsplDb: fspl, prxDbm: prx,
      noiseFloorDbm: nf, snrDb: prx - nf, sensDbm: sens, marginDb: margin,
      maxRangeKm: p.dKm * Math.pow(10, margin / 20),   // free-space range at 0 dB margin
      fresnelMidM: r1, fresnel60M: 0.6 * r1
    };
  }

  /* ---------------- cascade ---------------- */
  /* stages: [{name, gain, nf, ip3, ip3Type:'OIP3'|'IIP3', p1db (output P1dB)}] ; blank/NaN ip3/p1db = ideal (∞) */
  function num(x) { return (x === "" || x === null || x === undefined) ? NaN : Number(x); }
  function cascade(stages, opts) {
    opts = opts || {};
    var gBefore = 1, Fsum = 0, ip3Inv = 0, p1Inv = 0, rows = [], nfTerms = [], ipTerms = [];
    stages.forEach(function (s, i) {
      var g = num(s.gain), nf = num(s.nf); if (!isFinite(g)) g = 0; if (!isFinite(nf)) nf = 0;
      var G = undB(g), F = undB(nf);
      var nfTerm = i === 0 ? F : (F - 1) / gBefore;
      Fsum += nfTerm;
      var ip3 = num(s.ip3), iip3 = isFinite(ip3) ? ((s.ip3Type === "IIP3") ? ip3 : ip3 - g) : Infinity;
      var ipTerm = isFinite(iip3) ? gBefore / dbmToW(iip3) / 1000 : 0; // in 1/mW
      ip3Inv += ipTerm;
      var p1 = num(s.p1db), ip1 = isFinite(p1) ? p1 - g + 1 : Infinity;
      p1Inv += isFinite(ip1) ? gBefore / (dbmToW(ip1) * 1000) : 0;
      gBefore *= G;
      var cumG = dB(gBefore), cumIip3 = ip3Inv > 0 ? dB(1 / ip3Inv) : Infinity, cumIp1 = p1Inv > 0 ? dB(1 / p1Inv) : Infinity;
      nfTerms.push(i === 0 ? F - 1 : nfTerm); ipTerms.push(ipTerm);
      rows.push({
        name: s.name || ("Stage " + (i + 1)), gain: g, nf: nf, iip3: iip3, oip3: iip3 + g,
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
    if (opts.bwHz > 0) {
      res.noiseFloorInDbm = noiseFloorDbm(opts.bwHz, nfTot);
      res.noiseFloorOutDbm = res.noiseFloorInDbm + Gtot;
      res.mdsDbm = res.noiseFloorInDbm + (opts.snrReq || 0);
      res.sfdrDb = isFinite(iip3Tot) ? (2 / 3) * (iip3Tot - res.noiseFloorInDbm) : Infinity;
      res.cdrDb = isFinite(ip1Tot) ? ip1Tot - res.noiseFloorInDbm : Infinity; // compression dynamic range
    }
    return res;
  }

  /* ---------------- antennas ---------------- */
  function dishGain(dM, fHz, eff) { var l = C / fHz; return dB(eff * Math.pow(Math.PI * dM / l, 2)); }
  function dish(p) { // {dM, fHz, eff (0..1), fd}
    var l = C / p.fHz, D = p.dM, f = p.fd * D;
    var psi0 = 2 * Math.atan(1 / (4 * p.fd)); // edge half-angle seen from focus
    return {
      lambdaM: l, gainDbi: dishGain(D, p.fHz, p.eff), gainLinear: p.eff * Math.pow(Math.PI * D / l, 2),
      bw3dBDeg: 70 * l / D, firstNullDeg: deg(1.22 * l / D), bwfnDeg: 2 * deg(1.22 * l / D),
      focalM: f, depthM: D * D / (16 * f), apertureM2: Math.PI * D * D / 4, effApertureM2: p.eff * Math.PI * D * D / 4,
      farFieldM: 2 * D * D / l, edgeHalfAngleDeg: deg(psi0), illumAngleDeg: 2 * deg(psi0),
      spaceTaperDb: 20 * log10((1 + Math.cos(psi0)) / 2)
    };
  }
  function dishDiameterForGain(gDbi, fHz, eff) { var l = C / fHz; return l / Math.PI * Math.sqrt(undB(gDbi) / eff); }
  function effectiveAperture(gDbi, fHz) { var l = C / fHz; return undB(gDbi) * l * l / (4 * Math.PI); }
  function gainFromAperture(aeM2, fHz) { var l = C / fHz; return dB(4 * Math.PI * aeM2 / (l * l)); }
  function dbiToDbd(x) { return x - 2.15; }
  function dbdToDbi(x) { return x + 2.15; }
  function wireLengths(fHz, k) { // k = velocity / shortening factor
    var l = C / fHz; k = k || 1;
    return { lambdaM: l, halfWaveM: 0.5 * l * k, quarterWaveM: 0.25 * l * k, fiveEighthM: 0.625 * l * k, fullWaveM: l * k };
  }
  function hornGain(aM, bM, fHz, eff) { var l = C / fHz; return dB((eff || 0.51) * 4 * Math.PI * aM * bM / (l * l)); }
  function gainFromBeamwidths(thetaEdeg, thetaHdeg, eff) { return dB((eff === undefined ? 1 : eff) * 41253 / (thetaEdeg * thetaHdeg)); }
  function eirp(pDbm, lossDb, gDbi) { var e = pDbm - lossDb + gDbi; return { eirpDbm: e, erpDbm: e - 2.15, eirpW: dbmToW(e), erpW: dbmToW(e - 2.15) }; }

  /* ---------------- VSWR / mismatch ---------------- */
  function fromGamma(g) {
    return {
      gamma: g, vswr: g >= 1 ? Infinity : (1 + g) / (1 - g), returnLossDb: g > 0 ? -20 * log10(g) : Infinity,
      mismatchLossDb: g >= 1 ? Infinity : -10 * log10(1 - g * g), reflectedPct: 100 * g * g, transmittedPct: 100 * (1 - g * g)
    };
  }
  function vswrFromVswr(s) { return fromGamma((s - 1) / (s + 1)); }
  function vswrFromRL(rl) { return fromGamma(Math.pow(10, -rl / 20)); }
  function vswrFromPower(pf, pr) { return fromGamma(Math.sqrt(pr / pf)); }
  function vswrFromZ(r, x, z0) {
    var nr = r - z0, ni = x, dr = r + z0, di = x, den = dr * dr + di * di;
    var gr = (nr * dr + ni * di) / den, gi = (ni * dr - nr * di) / den;
    var o = fromGamma(Math.sqrt(gr * gr + gi * gi));
    o.gammaRe = gr; o.gammaIm = gi; o.gammaAngleDeg = deg(Math.atan2(gi, gr));
    return o;
  }

  /* ---------------- coax ---------------- */
  // Attenuation dB/100 ft = k1·√f + k2·f (f in MHz). LMR k1/k2 from Times Microwave datasheets;
  // others are least-squares fits to typical published attenuation tables (approximate!).
  var CABLES = [
    { id: "rg58", name: "RG-58 (solid PE)", k1: 0.39435, k2: 0.005682, vf: 0.66, z0: 50, src: "fit to typical tables" },
    { id: "rg8x", name: "RG-8X (mini-8, foam)", k1: 0.34448, k2: 0.002825, vf: 0.78, z0: 50, src: "fit to typical tables" },
    { id: "rg213", name: "RG-213 (solid PE)", k1: 0.16931, k2: 0.003257, vf: 0.66, z0: 50, src: "fit to typical tables" },
    { id: "lmr195", name: "LMR-195", k1: 0.356859, k2: 0.00047, vf: 0.80, z0: 50, src: "Times Microwave datasheet" },
    { id: "lmr240", name: "LMR-240", k1: 0.24208, k2: 0.00033, vf: 0.84, z0: 50, src: "Times Microwave datasheet" },
    { id: "lmr400", name: "LMR-400", k1: 0.12229, k2: 0.00026, vf: 0.85, z0: 50, src: "Times Microwave datasheet" },
    { id: "lmr600", name: "LMR-600", k1: 0.07555, k2: 0.00026, vf: 0.87, z0: 50, src: "Times Microwave datasheet" },
    { id: "lmr900", name: "LMR-900", k1: 0.05177, k2: 0.00016, vf: 0.87, z0: 50, src: "Times Microwave (approx.)" },
    { id: "ldf4", name: "1/2\" Heliax LDF4-50A", k1: 0.06526, k2: 0.000249, vf: 0.88, z0: 50, src: "fit to typical tables" },
    { id: "ldf5", name: "7/8\" Heliax LDF5-50A", k1: 0.03427, k2: 0.000225, vf: 0.89, z0: 50, src: "fit to typical tables" },
    { id: "rg6", name: "RG-6 (75 Ω, foam)", k1: 0.19127, k2: 0.000341, vf: 0.85, z0: 75, src: "fit to typical tables" }
  ];
  function cableLossPer100ft(k1, k2, fMHz) { return k1 * Math.sqrt(fMHz) + k2 * fMHz; }
  function coaxLoss(cable, lengthM, fMHz, pinW) {
    var per100ft = cableLossPer100ft(cable.k1, cable.k2, fMHz), per100m = per100ft / 0.3048;
    var total = per100m * lengthM / 100, pout = pinW * undB(-total);
    return { per100ftDb: per100ft, per100mDb: per100m, totalDb: total, poutW: pout, deliveredPct: 100 * undB(-total), heatW: pinW - pout,
      vf: cable.vf, electricalWavelengths: lengthM / (C * cable.vf / (fMHz * 1e6)) };
  }

  /* ---------------- propagation ---------------- */
  function radioHorizonKm(hM, k) { k = k || 4 / 3; return Math.sqrt(2 * k * EARTH_R * hM) / 1000; }
  function earthBulgeM(d1Km, d2Km, k) { k = k || 4 / 3; return (d1Km * 1000) * (d2Km * 1000) / (2 * k * EARTH_R); }
  function twoRayLossDb(dM, htM, hrM) { return 40 * log10(dM) - 20 * log10(htM * hrM); }
  function twoRayCrossoverM(htM, hrM, fHz) { return 4 * Math.PI * htM * hrM / (C / fHz); }
  function nearFarField(dM, fHz) {
    var l = C / fHz;
    return { lambdaM: l, reactiveNearM: 0.62 * Math.sqrt(dM * dM * dM / l), farFieldM: 2 * dM * dM / l, smallAntennaM: l / (2 * Math.PI) };
  }

  /* ---------------- attenuators & matching ---------------- */
  function piPad(db, z0) { var K = Math.pow(10, db / 20); return { shunt: z0 * (K + 1) / (K - 1), series: z0 * (K * K - 1) / (2 * K) }; }
  function tPad(db, z0) { var K = Math.pow(10, db / 20); return { series: z0 * (K - 1) / (K + 1), shunt: z0 * 2 * K / (K * K - 1) }; }
  // L-network between two resistances (purely resistive source & load)
  function lNetwork(rs, rl, fHz) {
    var rmin = Math.min(rs, rl), rmax = Math.max(rs, rl), w = 2 * Math.PI * fHz;
    if (rmax === rmin) return { q: 0, same: true };
    var q = Math.sqrt(rmax / rmin - 1), xs = q * rmin, xp = rmax / q;
    return {
      q: q, xSeries: xs, xShunt: xp, shuntSide: rs > rl ? "source" : "load",
      lowpass: { seriesL: xs / w, shuntC: 1 / (w * xp) },
      highpass: { seriesC: 1 / (w * xs), shuntL: xp / w },
      bandwidthHz: fHz / q
    };
  }

  /* ---------------- misc ---------------- */
  function resonantFreq(lH, cF) { return 1 / (2 * Math.PI * Math.sqrt(lH * cF)); }
  function resonantL(fHz, cF) { var w = 2 * Math.PI * fHz; return 1 / (w * w * cF); }
  function resonantC(fHz, lH) { var w = 2 * Math.PI * fHz; return 1 / (w * w * lH); }
  function reactanceL(fHz, lH) { return 2 * Math.PI * fHz * lH; }
  function reactanceC(fHz, cF) { return 1 / (2 * Math.PI * fHz * cF); }
  var METALS = { copper: 1.68e-8, silver: 1.59e-8, gold: 2.44e-8, aluminum: 2.65e-8, brass: 7.0e-8, steel_stainless: 6.9e-7 };
  function skinDepth(fHz, rho, mur) { return Math.sqrt(rho / (Math.PI * fHz * MU0 * (mur || 1))); }
  // Hammerstad & Jensen / Wheeler closed forms (zero thickness strip)
  function microstrip(wM, hM, er) {
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
  // Wheeler synthesis: W/H for target Z0
  function microstripWidth(z0, er) {
    var A = z0 / 60 * Math.sqrt((er + 1) / 2) + (er - 1) / (er + 1) * (0.23 + 0.11 / er);
    var wh = (8 * Math.exp(A)) / (Math.exp(2 * A) - 2);
    if (wh > 2) {
      var B = 377 * Math.PI / (2 * z0 * Math.sqrt(er));
      wh = 2 / Math.PI * (B - 1 - Math.log(2 * B - 1) + (er - 1) / (2 * er) * (Math.log(B - 1) + 0.39 - 0.61 / er));
    }
    return wh;
  }

  return {
    C: C, K_B: K_B, T0: T0, KT0_DBM_HZ: KT0_DBM_HZ, EARTH_R: EARTH_R, FSPL_CONST: FSPL_CONST,
    dB: dB, undB: undB, log10: log10,
    dbmToW: dbmToW, wToDbm: wToDbm, powerAll: powerAll, toDbm: toDbm, wavelength: wavelength, frequencyFromWavelength: frequencyFromWavelength,
    dbRatio: dbRatio, ratioFromDb: ratioFromDb,
    thermalNoiseDbm: thermalNoiseDbm, noiseFloorDbm: noiseFloorDbm, nfToTemp: nfToTemp, tempToNf: tempToNf, nfToFactor: nfToFactor, factorToNf: factorToNf,
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
