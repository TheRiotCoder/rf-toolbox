/* RF Toolbox – tool definitions (inputs, compute, notes). Uses window.RF (js/rf.js). */
(function () {
  "use strict";
  var R = window.RF;
  var FREQ = "freq", DIST = "dist", LEN = "len", HGT = "height", PWR = "power", BW = "bw";
  function o(l, v, u, d, x) { var r = { l: l, v: v, u: u || "", d: d === undefined ? 2 : d }; if (x) for (var k in x) r[k] = x[k]; return r; }
  function e(l, v, u, x) { return o(l, v, u, null, Object.assign({ eng: true }, x || {})); } // engineering-prefix output
  function sec(t) { return { section: t }; }
  function marginCls(m) { return m >= 10 ? "good" : m >= 0 ? "warn" : "bad"; }
  var M_FT = 0.3048, KM_MI = 1.609344;

  var TOOLS = [
  /* 1 ------------------------------------------------------------------ */
  { id: "link", icon: "📡", title: "Link Budget", sub: "EIRP, FSPL, margin, range, Fresnel",
    cards: [{
      id: "lb", title: "Point-to-point link budget",
      inputs: [
        { h: "Transmitter" },
        { id: "tx", label: "Tx power", unit: PWR, def: 30, defUnit: "dBm" },
        { id: "txl", label: "Tx cable + connector loss", u: "dB", def: 1 },
        { id: "txg", label: "Tx antenna gain", u: "dBi", def: 15 },
        { h: "Path" },
        { id: "f", label: "Frequency", unit: FREQ, def: 2.4, defUnit: "GHz" },
        { id: "d", label: "Distance", unit: DIST, def: 10, defUnit: "km" },
        { id: "atm", label: "Atmospheric loss", u: "dB", def: 0 },
        { id: "rain", label: "Rain loss", u: "dB", def: 0 },
        { id: "fade", label: "Fade allowance", u: "dB", def: 0 },
        { id: "misc", label: "Misc / obstruction loss", u: "dB", def: 0 },
        { h: "Receiver" },
        { id: "rxg", label: "Rx antenna gain", u: "dBi", def: 15 },
        { id: "rxl", label: "Rx cable + connector loss", u: "dB", def: 1 },
        { id: "mode", label: "Rx sensitivity", type: "select", def: "calc", options: [["calc", "Compute from noise floor"], ["enter", "Enter sensitivity"]] },
        { id: "sens", label: "Rx sensitivity", u: "dBm", def: -90, show: function (v) { return v.mode === "enter"; } },
        { id: "bw", label: "Noise bandwidth", unit: BW, def: 20, defUnit: "MHz" },
        { id: "nf", label: "Rx noise figure", u: "dB", def: 5 },
        { id: "snr", label: "Required SNR", u: "dB", def: 10, show: function (v) { return v.mode === "calc"; } }
      ],
      compute: function (v) {
        var extra = v.atm + v.rain + v.fade + v.misc;
        var r = R.linkBudget({ txDbm: v.tx, txLoss: v.txl, txGain: v.txg, fMHz: v.f / 1e6, dKm: v.d / 1000, extraLoss: extra,
          rxGain: v.rxg, rxLoss: v.rxl, bwHz: v.bw, nfDb: v.nf, snrReq: v.snr, sensDbm: v.mode === "enter" ? v.sens : null });
        return [
          o("Link margin", r.marginDb, "dB", 1, { big: true, cls: marginCls(r.marginDb), tag: r.marginDb >= 10 ? "PASS" : r.marginDb >= 0 ? "MARGINAL" : "FAIL" }),
          o("EIRP", r.eirpDbm, "dBm", 2), e("EIRP", r.eirpW, "W"),
          o("Free-space path loss", r.fsplDb, "dB", 2), o("Extra losses", extra, "dB", 1),
          o("Received power", r.prxDbm, "dBm", 2),
          o("Noise floor (kTB + NF)", r.noiseFloorDbm, "dBm", 2), o("SNR at receiver", r.snrDb, "dB", 1),
          o("Sensitivity used", r.sensDbm, "dBm", 2),
          o("Max range @ 0 dB margin", r.maxRangeKm, "km", 3), o("Max range @ 0 dB margin", r.maxRangeKm / KM_MI, "mi", 3),
          sec("Fresnel zone (path midpoint)"),
          o("1st Fresnel radius", r.fresnelMidM, "m", 2), o("60% clearance", r.fresnel60M, "m", 2), o("60% clearance", r.fresnel60M / M_FT, "ft", 1)
        ];
      },
      notes: "<p>EIRP = P<sub>tx</sub> − L<sub>tx</sub> + G<sub>tx</sub>. FSPL = 20·log₁₀(d<sub>km</sub>) + 20·log₁₀(f<sub>MHz</sub>) + 32.45.</p><p>P<sub>rx</sub> = EIRP − FSPL − extra + G<sub>rx</sub> − L<sub>rx</sub>. Noise floor = −174 dBm/Hz + 10·log₁₀(B) + NF. Sensitivity = noise floor + required SNR (or your entered value). Margin = P<sub>rx</sub> − sensitivity. Green ≥ 10 dB, amber 0–10 dB, red &lt; 0 dB.</p><p>Max range assumes free space (path loss rises 6 dB per doubling of distance) with your extra losses held fixed. Fresnel r₁ = √(λ·d₁·d₂/(d₁+d₂)); keep at least 60% of it clear of obstacles, plus earth bulge on long paths (see Propagation).</p>"
    }]
  },
  /* 2 ------------------------------------------------------------------ */
  { id: "cascade", icon: "🔗", title: "Cascade Analysis", sub: "Friis NF, IP3, P1dB, SFDR", custom: "cascade",
    notes: "<p><b>Noise (Friis):</b> F = F₁ + (F₂−1)/G₁ + (F₃−1)/(G₁G₂) + … (linear). T<sub>e</sub> = 290·(F−1). A passive/lossy stage has NF = its loss (tick “Passive”).</p><p><b>IP3:</b> 1/IIP3 = 1/IIP3₁ + G₁/IIP3₂ + G₁G₂/IIP3₃ + … (mW). OIP3 = IIP3 + G<sub>total</sub>. Blank IP3 = ideal (ignored). Enter either OIP3 or IIP3 per stage.</p><p><b>P1dB:</b> stage input P1dB ≈ OP1dB − G + 1; cascaded the same way as IP3 (an estimate – compression doesn’t combine exactly like IP3).</p><p><b>Noise floor</b> = −174 + 10·log₁₀(B) + NF (input-referred). <b>MDS</b> = noise floor + required SNR. <b>SFDR</b> = ⅔·(IIP3 − noise floor).</p><p>Contribution columns show each stage’s share of the total excess noise (F−1) and of 1/IIP3 – the biggest number is the stage to improve.</p>"
  },
  /* 3 ------------------------------------------------------------------ */
  { id: "dish", icon: "🛰️", title: "Parabolic Dish", sub: "Gain, beamwidth, focal length, depth",
    cards: [{
      id: "dish", title: "Dish from diameter",
      inputs: [
        { id: "d", label: "Diameter", unit: LEN, def: 1.2, defUnit: "m" },
        { id: "f", label: "Frequency", unit: FREQ, def: 12, defUnit: "GHz" },
        { id: "eff", label: "Aperture efficiency", u: "%", def: 65 },
        { id: "fd", label: "F/D ratio", u: "", def: 0.4 }
      ],
      compute: function (v) {
        var r = R.dish({ dM: v.d, fHz: v.f, eff: v.eff / 100, fd: v.fd });
        return [
          o("Gain", r.gainDbi, "dBi", 2, { big: true }), o("Gain", r.gainDbi - 2.15, "dBd", 2),
          o("3 dB beamwidth (≈70·λ/D)", r.bw3dBDeg, "°", 3), o("First null from boresight (1.22·λ/D)", r.firstNullDeg, "°", 3),
          o("Null-to-null beamwidth", r.bwfnDeg, "°", 3), e("Wavelength", r.lambdaM, "m"),
          sec("Geometry"),
          e("Focal length f = F/D·D", r.focalM, "m"), o("Focal length", r.focalM / 0.0254, "in", 2),
          e("Dish depth c = D²/(16f)", r.depthM, "m"), o("Dish depth", r.depthM / 0.0254, "in", 2),
          o("Edge half-angle from focus", r.edgeHalfAngleDeg, "°", 1), o("Feed illumination angle (full)", r.illumAngleDeg, "°", 1),
          o("Edge space-loss taper", r.spaceTaperDb, "dB", 2),
          sec("Aperture"),
          o("Physical aperture", r.apertureM2, "m²", 4), o("Effective aperture", r.effApertureM2, "m²", 4),
          o("Far-field distance 2D²/λ", r.farFieldM, "m", 1)
        ];
      },
      notes: "<p>G = η·(π·D/λ)². Typical η: 50–70% (55% is a safe default for amateur/prime-focus dishes, 65–75% for good commercial offset dishes).</p><p>θ<sub>3dB</sub> ≈ 70·λ/D degrees (typical taper). Focal length f = (F/D)·D, depth c = D²/(16·f). Edge half-angle ψ₀ = 2·atan(1/(4·F/D)): choose a feed whose pattern is about −10 dB at ψ₀ (the space-loss taper adds to that). Far field begins near 2D²/λ.</p>"
    }, {
      id: "dishrev", title: "Diameter for a target gain",
      inputs: [
        { id: "g", label: "Target gain", u: "dBi", def: 30 },
        { id: "f", label: "Frequency", unit: FREQ, def: 5.8, defUnit: "GHz" },
        { id: "eff", label: "Aperture efficiency", u: "%", def: 55 }
      ],
      compute: function (v) {
        var D = R.dishDiameterForGain(v.g, v.f, v.eff / 100), l = R.wavelength(v.f);
        return [o("Diameter needed", D, "m", 3, { big: true }), o("Diameter", D / M_FT, "ft", 2), o("Diameter", D / 0.0254, "in", 1),
          o("3 dB beamwidth", 70 * l / D, "°", 2)];
      },
      notes: "<p>D = (λ/π)·√(G/η), G linear.</p>"
    }]
  },
  /* 4 ------------------------------------------------------------------ */
  { id: "antenna", icon: "📶", title: "Antenna Tools", sub: "Wire lengths, aperture, dBi/dBd, EIRP, horn",
    cards: [{
      id: "wire", title: "Dipole / vertical lengths",
      inputs: [
        { id: "f", label: "Frequency", unit: FREQ, def: 146, defUnit: "MHz" },
        { id: "k", label: "Velocity / shortening factor", u: "", def: 0.95 }
      ],
      compute: function (v) {
        var r = R.wireLengths(v.f, v.k);
        function both(l, m) { return [o(l, m, "m", 3), o(l, m / M_FT, "ft", 2), o(l, m / 0.0254, "in", 1)]; }
        return [e("Free-space wavelength", r.lambdaM, "m")].concat(
          [sec("½λ dipole (total)")], both("½λ", r.halfWaveM), [sec("¼λ vertical / dipole leg")], both("¼λ", r.quarterWaveM),
          [sec("⅝λ vertical")], both("⅝λ", r.fiveEighthM), [sec("Full wave (loop)")], both("1λ", r.fullWaveM));
      },
      notes: "<p>L = n·λ·k with λ = c/f. Wire dipoles typically use k ≈ 0.95 (gives the classic 468/f<sub>MHz</sub> ft). Use the cable’s velocity factor for coax stubs/phasing lines. Always cut a little long and trim.</p>"
    }, {
      id: "ae", title: "Gain ↔ effective aperture",
      inputs: [
        { id: "mode", label: "Solve for", type: "select", def: "ae", options: [["ae", "Effective aperture from gain"], ["g", "Gain from effective aperture"]] },
        { id: "g", label: "Gain", u: "dBi", def: 20, show: function (v) { return v.mode === "ae"; } },
        { id: "a", label: "Effective aperture", u: "m²", def: 0.1, show: function (v) { return v.mode === "g"; } },
        { id: "f", label: "Frequency", unit: FREQ, def: 2.4, defUnit: "GHz" }
      ],
      compute: function (v) {
        if (v.mode === "ae") { var a = R.effectiveAperture(v.g, v.f); return [o("Effective aperture", a, "m²", 5, { big: true }), o("Effective aperture", a * 1e4, "cm²", 1)]; }
        var g = R.gainFromAperture(v.a, v.f); return [o("Gain", g, "dBi", 2, { big: true }), o("Gain", g - 2.15, "dBd", 2)];
      },
      notes: "<p>A<sub>e</sub> = G·λ²/(4π). G = 4π·A<sub>e</sub>/λ².</p>"
    }, {
      id: "dbd", title: "dBi ↔ dBd",
      inputs: [
        { id: "x", label: "Gain", def: 6, u: "", },
        { id: "from", label: "Entered value is", type: "select", def: "dBi", options: [["dBi", "dBi"], ["dBd", "dBd"]] }
      ],
      compute: function (v) {
        var dbi = v.from === "dBi" ? v.x : v.x + 2.15;
        return [o("dBi", dbi, "dBi", 2, { big: true }), o("dBd", dbi - 2.15, "dBd", 2), o("Linear (vs isotropic)", R.undB(dbi), "×", 2)];
      },
      notes: "<p>A half-wave dipole has 2.15 dBi gain, so dBd = dBi − 2.15.</p>"
    }, {
      id: "eirp", title: "EIRP / ERP",
      inputs: [
        { id: "p", label: "Transmitter power", unit: PWR, def: 100, defUnit: "W" },
        { id: "l", label: "Feedline + connector loss", u: "dB", def: 2 },
        { id: "g", label: "Antenna gain", u: "dBi", def: 8 }
      ],
      compute: function (v) {
        var r = R.eirp(v.p, v.l, v.g);
        return [o("EIRP", r.eirpDbm, "dBm", 2, { big: true }), e("EIRP", r.eirpW, "W"), o("ERP", r.erpDbm, "dBm", 2), e("ERP", r.erpW, "W")];
      },
      notes: "<p>EIRP = P − L + G<sub>dBi</sub>; ERP = EIRP − 2.15 dB (referenced to a dipole).</p>"
    }, {
      id: "horn", title: "Pyramidal horn gain (approx.)",
      inputs: [
        { id: "a", label: "Aperture width A (H-plane)", unit: LEN, def: 10, defUnit: "cm" },
        { id: "b", label: "Aperture height B (E-plane)", unit: LEN, def: 7.5, defUnit: "cm" },
        { id: "f", label: "Frequency", unit: FREQ, def: 10, defUnit: "GHz" },
        { id: "eff", label: "Aperture efficiency", u: "%", def: 51 }
      ],
      compute: function (v) {
        var l = R.wavelength(v.f);
        return [o("Gain", R.hornGain(v.a, v.b, v.f, v.eff / 100), "dBi", 2, { big: true }),
          o("H-plane beamwidth ≈ 67·λ/A", 67 * l / v.a, "°", 1), o("E-plane beamwidth ≈ 56·λ/B", 56 * l / v.b, "°", 1)];
      },
      notes: "<p>G ≈ η·4π·A·B/λ², η ≈ 0.51 for an optimum-gain horn. Beamwidths are optimum-horn approximations.</p>"
    }, {
      id: "bwg", title: "Gain from beamwidths",
      inputs: [
        { id: "te", label: "E-plane 3 dB beamwidth", u: "°", def: 30 },
        { id: "th", label: "H-plane 3 dB beamwidth", u: "°", def: 30 },
        { id: "eff", label: "Efficiency", u: "%", def: 65 }
      ],
      compute: function (v) {
        return [o("Gain", R.gainFromBeamwidths(v.te, v.th, v.eff / 100), "dBi", 2, { big: true }), o("Ideal (100%)", R.gainFromBeamwidths(v.te, v.th, 1), "dBi", 2)];
      },
      notes: "<p>G ≈ η·41253/(θ<sub>E</sub>·θ<sub>H</sub>), angles in degrees. With η ≈ 0.63 this matches the common 26000/(θ<sub>E</sub>·θ<sub>H</sub>) rule.</p>"
    }]
  },
  /* 5 ------------------------------------------------------------------ */
  { id: "units", icon: "🔁", title: "Unit Converters", sub: "dBm/W/dBµV/V, λ↔f, dB ratios",
    cards: [{
      id: "pwr", title: "Power & voltage",
      inputs: [
        { id: "x", label: "Value", def: 0, u: "" },
        { id: "unit", label: "Unit", type: "select", def: "dBm", options: [["dBm", "dBm"], ["dBW", "dBW"], ["W", "W"], ["mW", "mW"], ["uW", "µW"], ["dBuV", "dBµV"], ["dBmV", "dBmV"], ["Vrms", "V rms"], ["Vpk", "V peak"], ["Vpp", "V peak-peak"]] },
        { id: "z", label: "System impedance", u: "Ω", def: 50 }
      ],
      compute: function (v) {
        var dbm = R.toDbm(v.x, v.unit, v.z), p = R.powerAll(dbm, v.z);
        return [o("dBm", p.dBm, "dBm", 3, { big: true }), o("dBW", p.dBW, "dBW", 3), e("Power", p.W, "W"),
          o("dBµV (" + v.z + " Ω)", p.dBuV, "dBµV", 2), o("dBmV (" + v.z + " Ω)", p.dBmV, "dBmV", 2),
          o("dBµV in 50 Ω", R.powerAll(dbm, 50).dBuV, "dBµV", 2), o("dBµV in 75 Ω", R.powerAll(dbm, 75).dBuV, "dBµV", 2),
          e("V rms", p.Vrms, "V"), e("V peak", p.Vpk, "V"), e("V peak-peak", p.Vpp, "V"), e("I rms", p.Irms, "A")];
      },
      notes: "<p>P(W) = 10<sup>(dBm−30)/10</sup>. V<sub>rms</sub> = √(P·Z). dBµV = 20·log₁₀(V<sub>rms</sub>/1 µV). V<sub>pp</sub> = 2√2·V<sub>rms</sub> (sine wave). 0 dBm = 107.0 dBµV in 50 Ω, 108.75 dBµV in 75 Ω.</p>"
    }, {
      id: "wl", title: "Frequency ↔ wavelength",
      inputs: [
        { id: "mode", label: "Convert", type: "select", def: "f2l", options: [["f2l", "Frequency → wavelength"], ["l2f", "Wavelength → frequency"]] },
        { id: "f", label: "Frequency", unit: FREQ, def: 146, defUnit: "MHz", show: function (v) { return v.mode === "f2l"; } },
        { id: "l", label: "Wavelength", unit: LEN, def: 2, defUnit: "m", show: function (v) { return v.mode === "l2f"; } },
        { id: "vf", label: "Velocity factor", u: "", def: 1 }
      ],
      compute: function (v) {
        if (v.mode === "f2l") { var l = R.wavelength(v.f, v.vf); return [e("Wavelength λ", l, "m", { big: true }), o("λ", l / M_FT, "ft", 3), e("λ/2", l / 2, "m"), e("λ/4", l / 4, "m")]; }
        var f = R.frequencyFromWavelength(v.l, v.vf); return [e("Frequency", f, "Hz", { big: true }), e("Period", 1 / f, "s")];
      },
      notes: "<p>λ = v·c/f, c = 299 792 458 m/s, v = velocity factor (1 for free space; ~0.66 solid-PE coax, 0.8–0.89 foam coax).</p>"
    }, {
      id: "ratio", title: "dB ratio calculator",
      inputs: [
        { id: "mode", label: "Convert", type: "select", def: "r2d", options: [["r2d", "Ratio → dB"], ["d2r", "dB → ratio"]] },
        { id: "kind", label: "Quantity", type: "select", def: "power", options: [["power", "Power (10·log)"], ["voltage", "Voltage/current (20·log)"]] },
        { id: "r", label: "Ratio (out/in)", u: "×", def: 2, show: function (v) { return v.mode === "r2d"; } },
        { id: "db", label: "dB", u: "dB", def: 3, show: function (v) { return v.mode === "d2r"; } }
      ],
      compute: function (v) {
        if (v.mode === "r2d") return [o("dB", R.dbRatio(v.r, v.kind), "dB", 3, { big: true })];
        var r = R.ratioFromDb(v.db, v.kind); return [o("Ratio", r, "×", 4, { big: true }), o("Inverse", 1 / r, "×", 4)];
      },
      notes: "<p>Power: dB = 10·log₁₀(P₂/P₁). Voltage/current (same impedance): dB = 20·log₁₀(V₂/V₁).</p>"
    }]
  },
  /* 6 ------------------------------------------------------------------ */
  { id: "vswr", icon: "〰️", title: "VSWR / Mismatch", sub: "VSWR, RL, Γ, mismatch loss, Z",
    cards: [{
      id: "vswr", title: "Mismatch calculator",
      inputs: [
        { id: "mode", label: "I know the", type: "select", def: "vswr", options: [["vswr", "VSWR"], ["rl", "Return loss"], ["g", "Reflection coefficient |Γ|"], ["p", "Forward & reflected power"], ["z", "Load impedance R + jX"]] },
        { id: "s", label: "VSWR", u: ": 1", def: 2, show: function (v) { return v.mode === "vswr"; } },
        { id: "rl", label: "Return loss", u: "dB", def: 14, show: function (v) { return v.mode === "rl"; } },
        { id: "g", label: "|Γ|", u: "", def: 0.2, show: function (v) { return v.mode === "g"; } },
        { id: "pf", label: "Forward power", u: "W", def: 100, show: function (v) { return v.mode === "p"; } },
        { id: "pr", label: "Reflected power", u: "W", def: 5, show: function (v) { return v.mode === "p"; } },
        { id: "r", label: "Load resistance R", u: "Ω", def: 75, show: function (v) { return v.mode === "z"; } },
        { id: "x", label: "Load reactance X (+ inductive)", u: "Ω", def: 25, show: function (v) { return v.mode === "z"; } },
        { id: "z0", label: "Line impedance Z₀", u: "Ω", def: 50, show: function (v) { return v.mode === "z"; } }
      ],
      compute: function (v) {
        var r;
        if (v.mode === "vswr") { if (v.s < 1) throw new Error("VSWR must be ≥ 1"); r = R.vswrFromVswr(v.s); }
        else if (v.mode === "rl") r = R.vswrFromRL(v.rl);
        else if (v.mode === "g") { if (v.g < 0 || v.g > 1) throw new Error("|Γ| must be 0…1"); r = R.fromGamma(v.g); }
        else if (v.mode === "p") { if (v.pr > v.pf) throw new Error("Reflected > forward"); r = R.vswrFromPower(v.pf, v.pr); }
        else r = R.vswrFromZ(v.r, v.x, v.z0);
        var out = [o("VSWR", r.vswr, ": 1", 3, { big: true, cls: r.vswr <= 1.5 ? "good" : r.vswr <= 2.5 ? "warn" : "bad" }),
          o("Return loss", r.returnLossDb, "dB", 2), o("|Γ|", r.gamma, "", 4), o("Mismatch loss", r.mismatchLossDb, "dB", 3),
          o("Power reflected", r.reflectedPct, "%", 2), o("Power delivered", r.transmittedPct, "%", 2)];
        if (v.mode === "z") out.push(o("Γ angle", r.gammaAngleDeg, "°", 1), o("Γ (rectangular)", r.gammaRe, "", 4), o("Γ imag", r.gammaIm, "j", 4));
        if (v.mode === "p") out.push(o("Net forward power", v.pf - v.pr, "W", 2));
        return out;
      },
      notes: "<p>|Γ| = (VSWR−1)/(VSWR+1) = 10<sup>−RL/20</sup> = √(P<sub>r</sub>/P<sub>f</sub>); Γ = (Z<sub>L</sub>−Z₀)/(Z<sub>L</sub>+Z₀).</p><p>Return loss = −20·log₁₀|Γ|. Mismatch loss = −10·log₁₀(1−|Γ|²). Excludes feedline loss, which makes VSWR read better at the transmitter than it is at the antenna.</p>"
    }]
  },
  /* 7 ------------------------------------------------------------------ */
  { id: "coax", icon: "🧵", title: "Coax Cable Loss", sub: "RG-58 … LMR … Heliax",
    cards: [{
      id: "coax", title: "Feedline loss",
      inputs: [
        { id: "cable", label: "Cable", type: "select", def: "lmr400", options: R.CABLES.map(function (c) { return [c.id, c.name]; }).concat([["custom", "Custom (enter k1, k2)"]]) },
        { id: "k1", label: "k1 (√f term)", u: "", def: 0.12229, show: function (v) { return v.cable === "custom"; } },
        { id: "k2", label: "k2 (f term)", u: "", def: 0.00026, show: function (v) { return v.cable === "custom"; } },
        { id: "vf", label: "Velocity factor", u: "", def: 0.85, show: function (v) { return v.cable === "custom"; } },
        { id: "len", label: "Length", unit: HGT, def: 100, defUnit: "ft" },
        { id: "f", label: "Frequency", unit: FREQ, def: 146, defUnit: "MHz" },
        { id: "pin", label: "Power in", u: "W", def: 100 }
      ],
      compute: function (v) {
        var c = v.cable === "custom" ? { k1: v.k1, k2: v.k2, vf: v.vf, name: "Custom", src: "user" } : R.CABLES.filter(function (x) { return x.id === v.cable; })[0];
        var r = R.coaxLoss(c, v.len, v.f / 1e6, v.pin);
        var rows = R.CABLES.map(function (x) { var q = R.coaxLoss(x, v.len, v.f / 1e6, v.pin); return [x.name, q.totalDb.toFixed(2), q.poutW.toPrecision(3)]; });
        return [o("Total loss", r.totalDb, "dB", 2, { big: true }), o("Power out", r.poutW, "W", 3), o("Power delivered", r.deliveredPct, "%", 1),
          o("Lost as heat", r.heatW, "W", 2), o("Loss per 100 ft", r.per100ftDb, "dB", 2), o("Loss per 100 m", r.per100mDb, "dB", 2),
          o("Velocity factor", r.vf, "", 2), o("Electrical length", r.electricalWavelengths, "λ", 3),
          { note: "Coefficients: " + c.src + " (k1 " + c.k1 + ", k2 " + c.k2 + ")" },
          sec("All cables at this length & frequency"), { table: { head: ["Cable", "Loss dB", "Out W"], rows: rows } }];
      },
      notes: "<p>Matched-line loss per 100 ft ≈ k1·√f<sub>MHz</sub> + k2·f<sub>MHz</sub> (conductor + dielectric loss). LMR values use Times Microwave’s published k1/k2. RG and Heliax values are least-squares fits to typical published attenuation tables and can be ±10–20% off for a given brand. Loss rises with VSWR, age and water ingress. Treat all values as approximate.</p>"
    }]
  },
  /* 8 ------------------------------------------------------------------ */
  { id: "noise", icon: "❄️", title: "Noise", sub: "kTB, NF↔T, Eb/N0, Shannon",
    cards: [{
      id: "ktb", title: "Thermal noise floor",
      inputs: [
        { id: "bw", label: "Bandwidth", unit: BW, def: 1, defUnit: "MHz" },
        { id: "t", label: "Temperature", u: "K", def: 290 },
        { id: "nf", label: "Noise figure", u: "dB", def: 0 }
      ],
      compute: function (v) {
        var k = R.thermalNoiseDbm(v.bw, v.t);
        return [o("Noise floor (kTB + NF)", k + v.nf, "dBm", 2, { big: true }), o("kTB", k, "dBm", 2), o("kT density", R.thermalNoiseDbm(1, v.t), "dBm/Hz", 2),
          e("Noise power", R.dbmToW(k + v.nf), "W"), o("10·log₁₀(B)", R.dB(v.bw), "dB", 2)];
      },
      notes: "<p>N = k·T·B; at 290 K this is −174 dBm/Hz + 10·log₁₀(B). Add the receiver NF for the effective noise floor.</p>"
    }, {
      id: "nft", title: "Noise figure ↔ temperature ↔ factor",
      inputs: [
        { id: "mode", label: "I know the", type: "select", def: "nf", options: [["nf", "Noise figure (dB)"], ["t", "Noise temperature (K)"], ["f", "Noise factor (linear)"]] },
        { id: "x", label: "Value", u: "", def: 1 }
      ],
      compute: function (v) {
        var nf = v.mode === "nf" ? v.x : v.mode === "t" ? R.tempToNf(v.x) : R.factorToNf(v.x);
        return [o("Noise figure", nf, "dB", 3, { big: true }), o("Noise temperature", R.nfToTemp(nf), "K", 1), o("Noise factor F", R.nfToFactor(nf), "", 4)];
      },
      notes: "<p>F = 10<sup>NF/10</sup>; T<sub>e</sub> = 290·(F−1); NF = 10·log₁₀(1 + T<sub>e</sub>/290).</p>"
    }, {
      id: "ebn0", title: "Eb/N0 ↔ SNR",
      inputs: [
        { id: "mode", label: "I know", type: "select", def: "snr", options: [["snr", "SNR"], ["eb", "Eb/N0"]] },
        { id: "x", label: "Value", u: "dB", def: 10 },
        { id: "bw", label: "Noise bandwidth", unit: BW, def: 1, defUnit: "MHz" },
        { id: "rb", label: "Bit rate", unit: "rate", def: 2, defUnit: "Mb/s" }
      ],
      compute: function (v) {
        var snr = v.mode === "snr" ? v.x : R.snrFromEbn0(v.x, v.bw, v.rb), eb = v.mode === "eb" ? v.x : R.ebn0FromSnr(v.x, v.bw, v.rb);
        return [o("Eb/N0", eb, "dB", 2, { big: v.mode === "snr" }), o("SNR", snr, "dB", 2, { big: v.mode === "eb" }), o("Spectral efficiency R/B", v.rb / v.bw, "b/s/Hz", 3)];
      },
      notes: "<p>Eb/N0 = SNR + 10·log₁₀(B/R<sub>b</sub>).</p>"
    }, {
      id: "shannon", title: "Shannon capacity",
      inputs: [
        { id: "bw", label: "Bandwidth", unit: BW, def: 1, defUnit: "MHz" },
        { id: "snr", label: "SNR", u: "dB", def: 20 }
      ],
      compute: function (v) {
        var c = R.shannonCapacity(v.bw, v.snr);
        return [e("Capacity", c, "b/s", { big: true }), o("Spectral efficiency", c / v.bw, "b/s/Hz", 3)];
      },
      notes: "<p>C = B·log₂(1 + SNR). Theoretical error-free limit; real systems land a few dB short.</p>"
    }]
  },
  /* 9 ------------------------------------------------------------------ */
  { id: "prop", icon: "🌍", title: "Propagation", sub: "Horizon, earth bulge, Fresnel, two-ray",
    cards: [{
      id: "hor", title: "Radio horizon",
      inputs: [
        { id: "h1", label: "Antenna 1 height", unit: HGT, def: 30, defUnit: "m" },
        { id: "h2", label: "Antenna 2 height", unit: HGT, def: 10, defUnit: "m" },
        { id: "k", label: "Earth radius factor k", u: "", def: 1.3333 }
      ],
      compute: function (v) {
        var a = R.radioHorizonKm(v.h1, v.k), b = R.radioHorizonKm(v.h2, v.k);
        return [o("Max line-of-sight range", a + b, "km", 2, { big: true }), o("Max line-of-sight range", (a + b) / KM_MI, "mi", 2),
          o("Horizon antenna 1", a, "km", 2), o("Horizon antenna 2", b, "km", 2),
          o("Optical (k = 1) total", R.radioHorizonKm(v.h1, 1) + R.radioHorizonKm(v.h2, 1), "km", 2)];
      },
      notes: "<p>d = √(2·k·R·h) for each antenna, R = 6371 km. Standard atmosphere k = 4/3 gives d<sub>km</sub> ≈ 4.12·√h<sub>m</sub> (≈ 1.41·√h<sub>ft</sub> miles). Smooth earth, no terrain.</p>"
    }, {
      id: "bulge", title: "Earth bulge & Fresnel at a point",
      inputs: [
        { id: "d", label: "Total path length", unit: DIST, def: 30, defUnit: "km" },
        { id: "d1", label: "Distance from Tx to obstacle", unit: DIST, def: 15, defUnit: "km" },
        { id: "f", label: "Frequency", unit: FREQ, def: 5.8, defUnit: "GHz" },
        { id: "k", label: "Earth radius factor k", u: "", def: 1.3333 }
      ],
      compute: function (v) {
        if (v.d1 >= v.d || v.d1 <= 0) throw new Error("Obstacle must be between the ends");
        var d2 = v.d - v.d1, b = R.earthBulgeM(v.d1 / 1000, d2 / 1000, v.k), r1 = R.fresnelRadius(v.f, v.d1, d2, 1);
        return [o("Clearance needed above terrain", b + 0.6 * r1, "m", 2, { big: true }), o("Clearance needed", (b + 0.6 * r1) / M_FT, "ft", 1),
          o("Earth bulge", b, "m", 2), o("1st Fresnel radius", r1, "m", 2), o("60% Fresnel", 0.6 * r1, "m", 2), o("Distance obstacle → Rx", d2 / 1000, "km", 3)];
      },
      notes: "<p>Bulge h = d₁·d₂/(2·k·R) (= d₁d₂/(12.74·k) m with km). Fresnel r₁ = √(λ·d₁·d₂/(d₁+d₂)). The line of sight should clear terrain + bulge by at least 60% of r₁ (plus trees and buildings).</p>"
    }, {
      id: "tworay", title: "Two-ray (plane-earth) path loss",
      inputs: [
        { id: "d", label: "Distance", unit: DIST, def: 5, defUnit: "km" },
        { id: "ht", label: "Tx antenna height", unit: HGT, def: 30, defUnit: "m" },
        { id: "hr", label: "Rx antenna height", unit: HGT, def: 2, defUnit: "m" },
        { id: "f", label: "Frequency", unit: FREQ, def: 900, defUnit: "MHz" }
      ],
      compute: function (v) {
        var tr = R.twoRayLossDb(v.d, v.ht, v.hr), fs = R.fsplDb(v.d / 1000, v.f / 1e6), dc = R.twoRayCrossoverM(v.ht, v.hr, v.f);
        var est = v.d > dc ? Math.max(tr, fs) : fs;
        return [o("Estimated path loss", est, "dB", 2, { big: true }), o("Two-ray loss", tr, "dB", 2), o("Free-space loss", fs, "dB", 2),
          o("Crossover distance 4π·hₜ·hᵣ/λ", dc / 1000, "km", 3), { note: v.d > dc ? "Beyond crossover: two-ray (40 dB/decade) applies." : "Inside crossover: use free-space loss (two-ray model not valid here)." }];
      },
      notes: "<p>L = 40·log₁₀(d) − 20·log₁₀(hₜ·hᵣ) (d, h in metres; independent of frequency). Valid beyond the crossover distance; closer in, use FSPL.</p>"
    }, {
      id: "nff", title: "Near field / far field",
      inputs: [
        { id: "D", label: "Largest antenna dimension", unit: LEN, def: 1, defUnit: "m" },
        { id: "f", label: "Frequency", unit: FREQ, def: 2.4, defUnit: "GHz" }
      ],
      compute: function (v) {
        var r = R.nearFarField(v.D, v.f);
        return [o("Far field starts (2D²/λ)", r.farFieldM, "m", 2, { big: true }), o("Reactive near field ends 0.62·√(D³/λ)", r.reactiveNearM, "m", 3),
          o("Small-antenna boundary λ/2π", r.smallAntennaM, "m", 4), e("Wavelength", r.lambdaM, "m")];
      },
      notes: "<p>Reactive near field: r &lt; 0.62·√(D³/λ). Radiating near (Fresnel) region up to 2D²/λ, far field beyond (also needs r ≫ λ). For antennas small compared to λ, use λ/2π.</p>"
    }]
  },
  /* 10 ----------------------------------------------------------------- */
  { id: "pads", icon: "🎛️", title: "Pads & Matching", sub: "Pi / T attenuators, L-network",
    cards: [{
      id: "pad", title: "Pi and T attenuator pads",
      inputs: [
        { id: "db", label: "Attenuation", u: "dB", def: 10 },
        { id: "z0", label: "Impedance Z₀", u: "Ω", def: 50 }
      ],
      compute: function (v) {
        if (v.db <= 0) throw new Error("Attenuation must be > 0");
        var p = R.piPad(v.db, v.z0), t = R.tPad(v.db, v.z0);
        return [sec("Pi pad (shunt – series – shunt)"), o("Shunt resistors (×2)", p.shunt, "Ω", 2, { big: true }), o("Series resistor", p.series, "Ω", 2),
          sec("T pad (series – shunt – series)"), o("Series resistors (×2)", t.series, "Ω", 2, { big: true }), o("Shunt resistor", t.shunt, "Ω", 2)];
      },
      notes: "<p>K = 10<sup>dB/20</sup>. Pi: R<sub>shunt</sub> = Z₀(K+1)/(K−1), R<sub>series</sub> = Z₀(K²−1)/(2K). T: R<sub>series</sub> = Z₀(K−1)/(K+1), R<sub>shunt</sub> = 2Z₀K/(K²−1). Use non-inductive resistors and check power dissipation.</p>"
    }, {
      id: "lnet", title: "L-network match (resistive)",
      inputs: [
        { id: "rs", label: "Source resistance", u: "Ω", def: 50 },
        { id: "rl", label: "Load resistance", u: "Ω", def: 200 },
        { id: "f", label: "Frequency", unit: FREQ, def: 14.2, defUnit: "MHz" }
      ],
      compute: function (v) {
        var r = R.lNetwork(v.rs, v.rl, v.f);
        if (r.same) return [{ note: "Source and load are equal: no matching needed." }];
        var where = r.shuntSide === "source" ? "across the source (higher R) side" : "across the load (higher R) side";
        return [o("Loaded Q", r.q, "", 3, { big: true }), o("Series reactance", r.xSeries, "Ω", 2), o("Shunt reactance", r.xShunt, "Ω", 2),
          { note: "Shunt element goes " + where + "." },
          sec("Low-pass: series L, shunt C"), e("Series L", r.lowpass.seriesL, "H"), e("Shunt C", r.lowpass.shuntC, "F"),
          sec("High-pass: series C, shunt L"), e("Series C", r.highpass.seriesC, "F"), e("Shunt L", r.highpass.shuntL, "H"),
          e("Approx. bandwidth f/Q", r.bandwidthHz, "Hz")];
      },
      notes: "<p>Q = √(R<sub>high</sub>/R<sub>low</sub> − 1). X<sub>series</sub> = Q·R<sub>low</sub>, X<sub>shunt</sub> = R<sub>high</sub>/Q. The shunt element sits on the high-resistance side. For complex loads, absorb or cancel the reactance first.</p>"
    }]
  },
  /* 11 ----------------------------------------------------------------- */
  { id: "misc", icon: "🧮", title: "LC, Skin & Microstrip", sub: "Resonance, reactance, skin depth, Z₀",
    cards: [{
      id: "lc", title: "LC resonance",
      inputs: [
        { id: "solve", label: "Solve for", type: "select", def: "f", options: [["f", "Frequency"], ["l", "Inductance"], ["c", "Capacitance"]] },
        { id: "f", label: "Frequency", unit: FREQ, def: 7.1, defUnit: "MHz", show: function (v) { return v.solve !== "f"; } },
        { id: "l", label: "Inductance", unit: "ind", def: 10, defUnit: "µH", show: function (v) { return v.solve !== "l"; } },
        { id: "c", label: "Capacitance", unit: "cap", def: 100, defUnit: "pF", show: function (v) { return v.solve !== "c"; } }
      ],
      compute: function (v) {
        if (v.solve === "f") { var f = R.resonantFreq(v.l, v.c); return [e("Resonant frequency", f, "Hz", { big: true }), e("Reactance at resonance", R.reactanceL(f, v.l), "Ω")]; }
        if (v.solve === "l") { var L = R.resonantL(v.f, v.c); return [e("Inductance", L, "H", { big: true }), e("Reactance at f", R.reactanceL(v.f, L), "Ω")]; }
        var C = R.resonantC(v.f, v.l); return [e("Capacitance", C, "F", { big: true }), e("Reactance at f", R.reactanceC(v.f, C), "Ω")];
      },
      notes: "<p>f = 1/(2π√(LC)).</p>"
    }, {
      id: "react", title: "Reactance of L and C",
      inputs: [
        { id: "f", label: "Frequency", unit: FREQ, def: 14, defUnit: "MHz" },
        { id: "l", label: "Inductance", unit: "ind", def: 1, defUnit: "µH" },
        { id: "c", label: "Capacitance", unit: "cap", def: 100, defUnit: "pF" }
      ],
      compute: function (v) {
        return [e("X_L = 2πfL", R.reactanceL(v.f, v.l), "Ω", { big: true }), e("X_C = 1/(2πfC)", R.reactanceC(v.f, v.c), "Ω", { big: true })];
      },
      notes: "<p>X<sub>L</sub> = 2πfL, X<sub>C</sub> = 1/(2πfC).</p>"
    }, {
      id: "skin", title: "Skin depth",
      inputs: [
        { id: "f", label: "Frequency", unit: FREQ, def: 14, defUnit: "MHz" },
        { id: "metal", label: "Conductor", type: "select", def: "copper", options: [["copper", "Copper"], ["silver", "Silver"], ["gold", "Gold"], ["aluminum", "Aluminum"], ["brass", "Brass"], ["steel_stainless", "Stainless steel"]] },
        { id: "mur", label: "Relative permeability µr", u: "", def: 1 }
      ],
      compute: function (v) {
        var d = R.skinDepth(v.f, R.METALS[v.metal], v.mur);
        return [e("Skin depth δ", d, "m", { big: true }), o("Skin depth", d / 2.54e-5, "mil", 3), e("5δ (≈99% of current)", 5 * d, "m")];
      },
      notes: "<p>δ = √(ρ/(π·f·µ₀·µ<sub>r</sub>)). ρ (Ω·m): Cu 1.68e-8, Ag 1.59e-8, Au 2.44e-8, Al 2.65e-8, brass ≈7e-8, stainless ≈6.9e-7.</p>"
    }, {
      id: "ms", title: "Microstrip impedance",
      inputs: [
        { id: "w", label: "Trace width W", unit: "pcb", def: 3, defUnit: "mm" },
        { id: "h", label: "Substrate height H", unit: "pcb", def: 1.6, defUnit: "mm" },
        { id: "er", label: "Dielectric constant εr", u: "", def: 4.4 }
      ],
      compute: function (v) {
        var r = R.microstrip(v.w, v.h, v.er);
        return [o("Z₀", r.z0, "Ω", 2, { big: true }), o("Effective εr", r.eeff, "", 3), o("W/H", r.wh, "", 3), o("Velocity factor", r.vf, "", 3),
          e("Guided λ at 1 GHz", R.wavelength(1e9, r.vf), "m")];
      },
      notes: "<p>Hammerstad/Wheeler closed forms, zero-thickness copper, no dispersion. u = W/H.<br>ε<sub>eff</sub> = (εr+1)/2 + (εr−1)/2·[(1+12/u)<sup>−½</sup> (+0.04(1−u)² if u&lt;1)].<br>u ≤ 1: Z₀ = 60/√ε<sub>eff</sub>·ln(8/u + u/4). u ≥ 1: Z₀ = 120π/(√ε<sub>eff</sub>·(u + 1.393 + 0.667·ln(u + 1.444))). Accuracy about ±1–2%; verify with a field solver for production boards.</p>"
    }, {
      id: "msw", title: "Microstrip width for a target Z₀",
      inputs: [
        { id: "z", label: "Target Z₀", u: "Ω", def: 50 },
        { id: "h", label: "Substrate height H", unit: "pcb", def: 1.6, defUnit: "mm" },
        { id: "er", label: "Dielectric constant εr", u: "", def: 4.4 }
      ],
      compute: function (v) {
        var wh = R.microstripWidth(v.z, v.er), w = wh * v.h, chk = R.microstrip(w, v.h, v.er);
        return [e("Trace width W", w, "m", { big: true }), o("Width", w / 2.54e-5, "mil", 1), o("W/H", wh, "", 3), o("Check: analysis Z₀", chk.z0, "Ω", 2)];
      },
      notes: "<p>Wheeler synthesis equations (A form for W/H &lt; 2, B form for W/H &gt; 2).</p>"
    }]
  }];

  window.RFTools = { TOOLS: TOOLS };
})();
