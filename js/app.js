/* RF Toolbox – UI shell: routing, forms, persistence, share/copy, cascade editor, install, service worker */
(function () {
  "use strict";
  var R = window.RF, TOOLS = window.RFTools.TOOLS;
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var UNITS = {
    freq: [["Hz", 1], ["kHz", 1e3], ["MHz", 1e6], ["GHz", 1e9]],
    bw: [["Hz", 1], ["kHz", 1e3], ["MHz", 1e6], ["GHz", 1e9]],
    dist: [["m", 1], ["km", 1e3], ["mi", 1609.344], ["ft", 0.3048]],
    len: [["mm", 1e-3], ["cm", 1e-2], ["m", 1], ["in", 0.0254], ["ft", 0.3048]],
    height: [["m", 1], ["ft", 0.3048]],
    pcb: [["mm", 1e-3], ["mil", 2.54e-5], ["in", 0.0254]],
    rate: [["b/s", 1], ["kb/s", 1e3], ["Mb/s", 1e6], ["Gb/s", 1e9]],
    ind: [["nH", 1e-9], ["µH", 1e-6], ["mH", 1e-3], ["H", 1]],
    cap: [["pF", 1e-12], ["nF", 1e-9], ["µF", 1e-6], ["F", 1]],
    power: [["dBm"], ["W"], ["mW"], ["dBW"], ["kW"]]
  };
  var POSITIVE_KINDS = { freq: 1, bw: 1, dist: 1, len: 1, pcb: 1, rate: 1, ind: 1, cap: 1 };
  // number parser: accepts "," decimal, unicode minus and simple fractions like "4/3"
  function parseNum(text) {
    var t = String(text).trim().replace(",", ".").replace(/\u2212/g, "-");
    if (t === "") return NaN;
    var m = t.match(/^(-?\d*\.?\d+)\s*\/\s*(\d*\.?\d+)$/);
    if (m) return Number(m[1]) / Number(m[2]);
    return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t) ? Number(t) : NaN;
  }
  // returns an error message if the (entered, pre-unit) value violates the input's declared range
  function rangeError(inp, n) {
    var gt = inp.gt !== undefined ? inp.gt : (POSITIVE_KINDS[inp.unit] && inp.min === undefined ? 0 : undefined);
    var min = inp.min !== undefined ? inp.min : (inp.unit === "height" ? 0 : undefined);
    var u = inp.u && /^[%°]|^dB|^Ω|^K$|^W$/.test(inp.u) ? (inp.u === "%" || inp.u === "°" ? inp.u : " " + inp.u) : "";
    if (gt !== undefined && !(n > gt)) return inp.label + " must be greater than " + gt + u;
    if (min !== undefined && n < min) return inp.label + " must be " + min + u + " or more";
    if (inp.max !== undefined && n > inp.max) return inp.label + " must be " + inp.max + u + " or less";
    return null;
  }
  function hasBadNumber(list) {
    return list.some(function (o) { return !o.section && !o.note && !o.table && (typeof o.v !== "number" || isNaN(o.v)); });
  }
  function toBase(val, kind, unit) {
    if (kind === "power") return R.toDbm(val, unit);
    var row = UNITS[kind].filter(function (r) { return r[0] === unit; })[0];
    return val * (row ? row[1] : 1);
  }

  /* ---------- storage ---------- */
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem("rft:" + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem("rft:" + k, JSON.stringify(v)); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem("rft:" + k); } catch (e) {} }
  };

  /* ---------- formatting ---------- */
  var PREFIX = { "-15": "f", "-12": "p", "-9": "n", "-6": "µ", "-3": "m", "0": "", "3": "k", "6": "M", "9": "G", "12": "T" };
  function strip(s) { return s.indexOf("e") < 0 && s.indexOf(".") >= 0 ? s.replace(/0+$/, "").replace(/\.$/, "") : s; }
  function fmtNum(v, d) {
    if (v === Infinity) return "∞"; if (v === -Infinity) return "−∞";
    if (typeof v !== "number" || isNaN(v)) return "—";
    var a = Math.abs(v);
    if (a !== 0 && (a >= 1e7 || a < Math.pow(10, -Math.max(d, 1)) )) return v.toPrecision(4).replace("e+", "e").replace(/-/g, "−");
    return v.toFixed(d).replace(/^-/, "−");
  }
  function fmtEng(v, unit) {
    if (v === Infinity) return "∞ " + unit; if (typeof v !== "number" || isNaN(v)) return "—";
    if (v === 0) return "0 " + unit;
    var exp = Math.floor(Math.log10(Math.abs(v)) / 3) * 3; exp = Math.max(-15, Math.min(12, exp));
    var m = v / Math.pow(10, exp);
    if (Math.abs(m) >= 999.95) { exp += 3; m /= 1000; }
    return strip(m.toPrecision(4)).replace(/^-/, "−") + " " + PREFIX[exp] + unit;
  }
  function outText(r) { return r.eng ? fmtEng(r.v, r.u) : fmtNum(r.v, r.d) + (r.u ? " " + r.u : ""); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function toast(msg) {
    var t = $("#toast"); t.textContent = msg; t.hidden = false; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("show"); t.hidden = true; }, 2200);
  }
  function shareText(title, text) {
    if (navigator.share) { return navigator.share({ title: title, text: text }).catch(function () {}); }
    return copyText(text);
  }
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(function () { toast("Copied to clipboard"); }, function () { fallbackCopy(text); });
    fallbackCopy(text); return Promise.resolve();
  }
  function fallbackCopy(text) {
    var ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast("Copied to clipboard"); } catch (e) { toast("Copy failed"); } ta.remove();
  }

  /* ---------- views ---------- */
  var main, titleEl, backBtn;
  function route() {
    var id = (location.hash.match(/^#\/([\w-]+)/) || [])[1];
    var tool = TOOLS.filter(function (t) { return t.id === id; })[0];
    if (id === "about") return renderAbout();
    if (tool) renderTool(tool); else renderHome();
    window.scrollTo(0, 0);
  }
  function renderHome() {
    document.title = "RF Toolbox"; titleEl.textContent = "RF Toolbox"; backBtn.hidden = true;
    main.innerHTML = '<div class="grid">' + TOOLS.map(function (t, i) {
      return '<a class="tile" href="#/' + t.id + '"><span class="ti">' + t.icon + '</span><span class="tt">' + esc(t.title) + '</span><span class="ts">' + esc(t.sub) + '</span></a>';
    }).join("") + '</div>' +
      '<p class="disclaimer">⚠️ Results are engineering estimates for planning and education. Verify critical designs with measurements, manufacturer data and proper tools.</p>' +
      '<p class="center"><a href="#/about" class="link">About, install &amp; formulas</a></p>';
  }
  function renderAbout() {
    document.title = "About – RF Toolbox"; titleEl.textContent = "About"; backBtn.hidden = false;
    var installed = isStandalone();
    main.innerHTML = '<section class="card"><h2>RF Toolbox <span id="appVer" class="muted"></span></h2><p>Quick RF engineering calculators that work offline once loaded. Your last inputs are saved on this device only. Nothing is sent anywhere.</p>' +
      (installed ? '<p class="good-text">Installed as an app ✔</p>' : '<button class="btn primary block" id="aboutInstall">Install RF Toolbox</button>') +
      '<h3>iPhone / iPad</h3><ol><li>Open this page in <b>Safari</b>.</li><li>Tap <b>Share</b> (square with arrow).</li><li>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</li></ol>' +
      '<h3>Android</h3><ol><li>Open in <b>Chrome</b>.</li><li>Tap <b>Install</b> when offered, or <b>⋮ → Install app / Add to Home screen</b>.</li></ol>' +
      '<h3>Disclaimer</h3><p>All results are engineering estimates based on standard textbook formulas and typical published data (e.g. cable coefficients). They are not a substitute for measurement or professional design review.</p>' +
      '<p><button class="btn" id="clearAll">Reset all saved inputs</button></p></section>';
    if (window.caches) caches.keys().then(function (k) { var v = k.filter(function (x) { return x.indexOf("rftoolbox-v") === 0; }).sort().pop(); if (v && $("#appVer")) $("#appVer").textContent = v.replace("rftoolbox-", ""); }).catch(function () {});
    var ib = $("#aboutInstall"); if (ib) ib.onclick = install.prompt;
    $("#clearAll").onclick = function () {
      if (!confirm("Reset all saved inputs to defaults?")) return;
      Object.keys(localStorage).filter(function (k) { return k.indexOf("rft:") === 0 && k !== "rft:theme"; }).forEach(function (k) { localStorage.removeItem(k); });
      toast("Inputs reset");
    };
  }
  function renderTool(tool) {
    document.title = tool.title + " – RF Toolbox"; titleEl.textContent = tool.title; backBtn.hidden = false;
    main.innerHTML = ""; main.setAttribute("data-tool", tool.id);
    if (tool.custom === "cascade") { renderCascade(tool); }
    else tool.cards.forEach(function (c) { main.appendChild(buildCard(tool, c)); });
    var d = document.createElement("p"); d.className = "disclaimer"; d.textContent = "Results are engineering estimates. Verify critical designs.";
    main.appendChild(d);
  }

  /* ---------- generic card ---------- */
  function allowsNeg(inp) { if (/loss|allowance/i.test(inp.label || "")) return false; return inp.unit === "power" || /dB|°/.test(inp.u || "") || inp.id === "x"; }
  function buildCard(tool, card) {
    var key = "card:" + card.id, saved = store.get(key, {});
    var el = document.createElement("section"); el.className = "card"; el.id = "card-" + card.id;
    var html = '<h2>' + esc(card.title) + '</h2><div class="fields">';
    card.inputs.forEach(function (inp) {
      if (inp.h) { html += '<div class="fh">' + esc(inp.h) + '</div>'; return; }
      var s = saved[inp.id] || {}, fid = "f-" + card.id + "-" + inp.id;
      html += '<div class="field" data-id="' + inp.id + '"><label for="' + fid + '">' + esc(inp.label) + '</label><div class="ctl">';
      if (inp.type === "select") {
        var sv = s.v !== undefined ? s.v : inp.def;
        html += '<select id="' + fid + '" class="inp">' + inp.options.map(function (op) { return '<option value="' + esc(op[0]) + '"' + (op[0] === sv ? " selected" : "") + '>' + esc(op[1]) + '</option>'; }).join("") + '</select>';
      } else {
        var val = s.v !== undefined ? s.v : String(inp.def);
        html += '<input id="' + fid + '" class="inp" type="text" inputmode="decimal" autocomplete="off" enterkeyhint="done" value="' + esc(val) + '">';
        if (allowsNeg(inp)) html += '<button type="button" class="pm" tabindex="-1" aria-label="Toggle minus sign">±</button>';
        if (inp.unit) {
          var su = s.u || inp.defUnit;
          html += '<select class="unit" aria-label="' + esc(inp.label) + ' unit">' + UNITS[inp.unit].map(function (u) { return '<option' + (u[0] === su ? " selected" : "") + '>' + u[0] + '</option>'; }).join("") + '</select>';
        } else if (inp.u) html += '<span class="u">' + esc(inp.u) + '</span>';
      }
      html += '</div></div>';
    });
    html += '</div><div class="results" aria-live="polite"></div>' +
      '<div class="actions"><button type="button" class="btn act-copy">📋 Copy</button><button type="button" class="btn act-share">↗ Share</button><button type="button" class="btn act-reset">↺ Defaults</button></div>' +
      (card.notes ? '<details class="notes"><summary>Formula &amp; notes</summary>' + card.notes + '</details>' : '');
    el.innerHTML = html;

    function read() {
      var raw = {}, vals = {}, st = {}, bad = [], rangeBad = [];
      card.inputs.forEach(function (inp) {
        if (inp.h) return;
        var f = el.querySelector('.field[data-id="' + inp.id + '"]'), ctl = f.querySelector(".inp");
        if (inp.type === "select") { vals[inp.id] = ctl.value; st[inp.id] = { v: ctl.value }; raw[inp.id] = ctl.options[ctl.selectedIndex].text; return; }
        var us = f.querySelector(".unit"), unit = us ? us.value : (inp.u || "");
        var n = parseNum(ctl.value);
        st[inp.id] = { v: ctl.value, u: us ? us.value : undefined };
        raw[inp.id] = ctl.value + (unit ? " " + unit : "");
        if (!isFinite(n)) { bad.push(inp); vals[inp.id] = NaN; return; }
        var re = rangeError(inp, n);
        if (!re && inp.unit) { try { vals[inp.id] = toBase(n, inp.unit, unit); } catch (err) { re = err.message; } }
        else vals[inp.id] = inp.unit ? NaN : n;
        if (re) rangeBad.push({ inp: inp, msg: re });
      });
      return { vals: vals, st: st, raw: raw, bad: bad, rangeBad: rangeBad };
    }
    var lastOut = [];
    function update() {
      var r = read();
      store.set(key, r.st);
      card.inputs.forEach(function (inp) {
        if (inp.h || !inp.show) return;
        var f = el.querySelector('.field[data-id="' + inp.id + '"]'); f.hidden = !inp.show(r.vals);
      });
      var vis = function (inp) { return !inp.show || inp.show(r.vals); };
      var visibleBad = r.bad.filter(vis), visibleRange = r.rangeBad.filter(function (x) { return vis(x.inp); });
      var badIds = visibleBad.map(function (b) { return b.id; }).concat(visibleRange.map(function (x) { return x.inp.id; }));
      el.querySelectorAll(".field").forEach(function (f) { f.classList.toggle("invalid", badIds.indexOf(f.getAttribute("data-id")) >= 0); });
      var box = el.querySelector(".results");
      if (visibleBad.length || visibleRange.length) {
        var msgs = [];
        if (visibleBad.length) msgs.push("Enter a number for: " + visibleBad.map(function (b) { return b.label; }).join(", "));
        visibleRange.forEach(function (x) { msgs.push(x.msg); });
        box.innerHTML = '<div class="err">⚠️ ' + msgs.map(esc).join("<br>") + '</div>'; lastOut = []; return;
      }
      try {
        lastOut = card.compute(r.vals) || [];
        if (hasBadNumber(lastOut)) { lastOut = []; throw new Error("These inputs are outside the valid range for this calculation"); }
        box.innerHTML = renderOutputs(lastOut);
      }
      catch (err) { lastOut = []; box.innerHTML = '<div class="err">⚠️ ' + esc(err.message || "Check inputs") + '</div>'; }
    }
    el.addEventListener("input", update);
    el.addEventListener("change", update);
    el.addEventListener("click", function (ev) {
      var b = ev.target.closest("button"); if (!b) return;
      if (b.classList.contains("pm")) {
        var i = b.parentNode.querySelector(".inp"), v = i.value.trim();
        i.value = v.charAt(0) === "-" || v.charAt(0) === "−" ? v.slice(1) : "-" + v; update();
      } else if (b.classList.contains("act-copy")) copyText(cardText());
      else if (b.classList.contains("act-share")) shareText(card.title, cardText());
      else if (b.classList.contains("act-reset")) { store.del(key); var n = buildCard(tool, card); el.replaceWith(n); toast("Defaults restored"); }
    });
    function cardText() {
      var r = read(), lines = ["RF Toolbox – " + tool.title + ": " + card.title, "", "Inputs:"];
      card.inputs.forEach(function (inp) { if (inp.h || (inp.show && !inp.show(r.vals))) return; lines.push("  " + inp.label + ": " + r.raw[inp.id]); });
      lines.push("", "Results:");
      lastOut.forEach(function (o) {
        if (o.section) lines.push("  [" + o.section + "]"); else if (o.note) lines.push("  " + o.note);
        else if (o.table) o.table.rows.forEach(function (row) { lines.push("  " + row.join(" | ")); });
        else lines.push("  " + o.l + ": " + outText(o) + (o.tag ? " (" + o.tag + ")" : ""));
      });
      lines.push("", "(Engineering estimate – verify critical designs.)");
      return lines.join("\n");
    }
    setTimeout(update, 0); update();
    return el;
  }
  function renderOutputs(list) {
    return list.map(function (o) {
      if (o.section) return '<div class="rsec">' + esc(o.section) + '</div>';
      if (o.note) return '<div class="rnote">' + esc(o.note) + '</div>';
      if (o.table) return '<div class="tblwrap"><table><thead><tr>' + o.table.head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join("") + '</tr></thead><tbody>' +
        o.table.rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join("") + '</tr>'; }).join("") + '</tbody></table></div>';
      return '<div class="res' + (o.big ? " big" : "") + (o.cls ? " " + o.cls : "") + '"><span class="rl">' + esc(o.l) + '</span><span class="rv">' + esc(outText(o)) +
        (o.tag ? ' <b class="tag">' + o.tag + '</b>' : '') + '</span></div>';
    }).join("");
  }

  /* ---------- cascade editor ---------- */
  var PRESETS = {
    lna: { name: "LNA", gain: 20, nf: 1, ip3: 30, ip3Type: "OIP3", p1db: 18, passive: false },
    filter: { name: "Filter", gain: -2, nf: 2, ip3: "", ip3Type: "IIP3", p1db: "", passive: true },
    mixer: { name: "Mixer", gain: -7, nf: 7, ip3: 15, ip3Type: "IIP3", p1db: "", passive: false },
    amp: { name: "Amp", gain: 15, nf: 4, ip3: 35, ip3Type: "OIP3", p1db: 20, passive: false },
    cable: { name: "Cable/pad", gain: -1, nf: 1, ip3: "", ip3Type: "IIP3", p1db: "", passive: true }
  };
  var CAS_DEFAULT = { stages: [PRESETS.lna, PRESETS.filter, PRESETS.mixer, PRESETS.amp], bw: "1", bwu: "MHz", snr: "10" };
  function renderCascade(tool) {
    var st = store.get("cascade", null) || JSON.parse(JSON.stringify(CAS_DEFAULT));
    var el = document.createElement("section"); el.className = "card"; el.id = "card-cascade";
    main.appendChild(el);
    var lastRes = null;
    function save() { store.set("cascade", st); }
    function draw() {
      var html = '<h2>Stages <span class="muted">(signal flows top → bottom)</span></h2><div class="stages">';
      st.stages.forEach(function (s, i) {
        html += '<div class="stage" data-i="' + i + '"><div class="srow"><span class="snum">' + (i + 1) + '</span>' +
          '<input class="sname" data-k="name" value="' + esc(s.name) + '" aria-label="Stage name">' +
          '<button type="button" class="ib" data-a="up" aria-label="Move up"' + (i === 0 ? " disabled" : "") + '>↑</button>' +
          '<button type="button" class="ib" data-a="down" aria-label="Move down"' + (i === st.stages.length - 1 ? " disabled" : "") + '>↓</button>' +
          '<button type="button" class="ib del" data-a="del" aria-label="Remove stage">✕</button></div>' +
          '<div class="sgrid">' +
          sfield("Gain dB", "gain", s.gain, true) + sfield("NF dB", "nf", s.passive ? -Number(s.gain) : s.nf, false, s.passive) +
          '<label class="sf"><span><select data-k="ip3Type" aria-label="IP3 type"><option' + (s.ip3Type === "OIP3" ? " selected" : "") + '>OIP3</option><option' + (s.ip3Type === "IIP3" ? " selected" : "") + '>IIP3</option></select> dBm</span>' +
          '<span class="ctl"><input class="inp" data-k="ip3" inputmode="decimal" placeholder="∞" value="' + esc(s.ip3) + '"><button type="button" class="pm" tabindex="-1">±</button></span></label>' +
          sfield("OP1dB dBm", "p1db", s.p1db, true, false, "∞") +
          '</div><label class="chk"><input type="checkbox" data-k="passive"' + (s.passive ? " checked" : "") + '> Passive (NF = loss)</label></div>';
      });
      html += '</div><div class="presets"><span class="muted">Add:</span>' + Object.keys(PRESETS).map(function (k) { return '<button type="button" class="btn sm" data-add="' + k + '">+ ' + PRESETS[k].name + '</button>'; }).join("") + '<button type="button" class="btn sm" data-add="blank">+ Blank</button></div>' +
        '<div class="fields"><div class="field"><label for="cas-bw">Noise bandwidth</label><div class="ctl"><input id="cas-bw" class="inp" data-g="bw" inputmode="decimal" value="' + esc(st.bw) + '"><select class="unit" data-g="bwu">' +
        UNITS.bw.map(function (u) { return '<option' + (u[0] === st.bwu ? " selected" : "") + '>' + u[0] + '</option>'; }).join("") + '</select></div></div>' +
        '<div class="field"><label for="cas-snr">Required SNR (for MDS)</label><div class="ctl"><input id="cas-snr" class="inp" data-g="snr" inputmode="decimal" value="' + esc(st.snr) + '"><button type="button" class="pm" tabindex="-1">±</button><span class="u">dB</span></div></div></div>' +
        '<div class="results" aria-live="polite"></div><div class="actions"><button type="button" class="btn act-copy">📋 Copy</button><button type="button" class="btn act-share">↗ Share</button><button type="button" class="btn act-reset">↺ Defaults</button></div>' +
        '<details class="notes"><summary>Formula &amp; notes</summary>' + tool.notes + '</details>';
      el.innerHTML = html; calc();
    }
    function sfield(label, k, v, neg, disabled, ph) {
      return '<label class="sf"><span>' + label + '</span><span class="ctl"><input class="inp" data-k="' + k + '" inputmode="decimal" value="' + esc(v) + '"' + (disabled ? " disabled" : "") + (ph ? ' placeholder="' + ph + '"' : "") + '>' +
        (neg && !disabled ? '<button type="button" class="pm" tabindex="-1">±</button>' : '') + '</span></label>';
    }
    function calc() {
      var stages = st.stages.map(function (s) { return { name: s.name, gain: s.gain, nf: s.nf, ip3: s.ip3, ip3Type: s.ip3Type, p1db: s.p1db, passive: !!s.passive }; });
      var box = el.querySelector(".results");
      var bw = parseNum(st.bw) * UNITS.bw.filter(function (u) { return u[0] === st.bwu; })[0][1], snr = parseNum(st.snr);
      var r;
      try {
        if (!(bw > 0)) throw new Error("Noise bandwidth must be greater than 0");
        if (!isFinite(snr)) throw new Error("Enter a number for the required SNR");
        r = R.cascade(stages, { bwHz: bw, snrReq: snr });
      } catch (err) { box.innerHTML = '<div class="err">⚠️ ' + esc(err.message) + '</div>'; box._out = []; lastRes = null; return; }
      lastRes = r;
      var out = [
        { l: "Cascaded noise figure", v: r.nfDb, u: "dB", d: 2, big: true }, { l: "Total gain", v: r.gainDb, u: "dB", d: 2, big: true },
        { l: "Noise temperature", v: r.tempK, u: "K", d: 1 }, { l: "Input IP3 (IIP3)", v: r.iip3Dbm, u: "dBm", d: 2 }, { l: "Output IP3 (OIP3)", v: r.oip3Dbm, u: "dBm", d: 2 },
        { l: "Input P1dB", v: r.ip1dbDbm, u: "dBm", d: 2 }, { l: "Output P1dB", v: r.op1dbDbm, u: "dBm", d: 2 }
      ];
      if (bw > 0) out.push({ section: "System (" + fmtEng(bw, "Hz") + " bandwidth)" },
        { l: "Noise floor (input-referred)", v: r.noiseFloorInDbm, u: "dBm", d: 2 }, { l: "Noise floor at output", v: r.noiseFloorOutDbm, u: "dBm", d: 2 },
        { l: "MDS (floor + req. SNR)", v: r.mdsDbm, u: "dBm", d: 2 }, { l: "SFDR (re noise floor)", v: r.sfdrDb, u: "dB", d: 1 }, { l: "SFDR (re MDS)", v: r.sfdrMdsDb, u: "dB", d: 1 }, { l: "Compression dynamic range (IP1dB − floor)", v: r.cdrDb, u: "dB", d: 1 });
      out.push({ section: "Per-stage (cumulative at stage output)" }, { table: { head: ["#", "Stage", "Cum G", "Cum NF", "NF share", "Cum IIP3", "Cum OIP3", "IP3 share"],
        rows: r.rows.map(function (x, i) { return [String(i + 1), x.name, fmtNum(x.cumGain, 1), fmtNum(x.cumNf, 2), fmtNum(x.nfContribPct, 1) + "%", fmtNum(x.cumIip3, 1), fmtNum(x.cumOip3, 1), fmtNum(x.ip3ContribPct, 1) + "%"]; }) } });
      box.innerHTML = renderOutputs(out);
      box._out = out;
    }
    function text() {
      var lines = ["RF Toolbox – Cascade analysis", "", "Stages:"];
      st.stages.forEach(function (s, i) { lines.push("  " + (i + 1) + ". " + s.name + ": G " + s.gain + " dB, NF " + (s.passive ? -Number(s.gain) : s.nf) + " dB" + (s.ip3 !== "" ? ", " + s.ip3Type + " " + s.ip3 + " dBm" : "") + (s.p1db !== "" ? ", OP1dB " + s.p1db + " dBm" : "")); });
      lines.push("  Bandwidth: " + st.bw + " " + st.bwu + ", required SNR " + st.snr + " dB", "", "Results:");
      (el.querySelector(".results")._out || []).forEach(function (o) {
        if (o.section) lines.push("  [" + o.section + "]");
        else if (o.table) { lines.push("  " + o.table.head.join(" | ")); o.table.rows.forEach(function (r) { lines.push("  " + r.join(" | ")); }); }
        else lines.push("  " + o.l + ": " + outText(o));
      });
      lines.push("", "(Engineering estimate – verify critical designs.)");
      return lines.join("\n");
    }
    function onEdit(ev) {
      var t = ev.target, g = t.getAttribute("data-g"), k = t.getAttribute("data-k");
      if (g) st[g] = t.value;
      else if (k) {
        var s = st.stages[+t.closest(".stage").getAttribute("data-i")];
        if (k === "passive") { s.passive = t.checked; if (!s.passive) s.nf = -Number(s.gain); save(); draw(); return; }
        s[k] = t.value;
        if (k === "gain" && s.passive) { var nfi = t.closest(".stage").querySelector('[data-k="nf"]'); nfi.value = -Number(t.value) || 0; }
      }
      save(); calc();
    }
    el.addEventListener("input", onEdit);
    el.addEventListener("change", onEdit);
    el.addEventListener("click", function (ev) {
      var b = ev.target.closest("button"); if (!b) return;
      var stg = b.closest(".stage"), i = stg ? +stg.getAttribute("data-i") : -1, a = b.getAttribute("data-a"), add = b.getAttribute("data-add");
      if (b.classList.contains("pm")) { var inp = b.parentNode.querySelector("input"), v = inp.value.trim(); inp.value = v.charAt(0) === "-" ? v.slice(1) : "-" + v; inp.dispatchEvent(new Event("input", { bubbles: true })); return; }
      if (a === "up" && i > 0) { st.stages.splice(i - 1, 0, st.stages.splice(i, 1)[0]); }
      else if (a === "down" && i < st.stages.length - 1) { st.stages.splice(i + 1, 0, st.stages.splice(i, 1)[0]); }
      else if (a === "del") { st.stages.splice(i, 1); }
      else if (add) { st.stages.push(JSON.parse(JSON.stringify(add === "blank" ? { name: "Stage", gain: 0, nf: 0, ip3: "", ip3Type: "OIP3", p1db: "", passive: false } : PRESETS[add]))); }
      else if (b.classList.contains("act-copy")) { copyText(text()); return; }
      else if (b.classList.contains("act-share")) { shareText("Cascade analysis", text()); return; }
      else if (b.classList.contains("act-reset")) { st = JSON.parse(JSON.stringify(CAS_DEFAULT)); toast("Defaults restored"); }
      else return;
      save(); draw();
    });
    draw();
  }

  /* ---------- theme ---------- */
  function applyTheme() {
    var t = store.get("theme", "auto"); document.documentElement.setAttribute("data-theme", t);
    $("#themeBtn").textContent = t === "dark" ? "🌙" : t === "light" ? "☀️" : "🌓";
    $("#themeBtn").setAttribute("aria-label", "Theme: " + t);
  }

  /* ---------- install ---------- */
  function isStandalone() { return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true; }
  function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); }
  var install = {
    deferred: null,
    iosHelp: function () { alert("Install on iPhone/iPad:\n\n1. Open this page in Safari.\n2. Tap Share (square with arrow).\n3. Tap \"Add to Home Screen\", then Add.\n\nRF Toolbox then opens full-screen and works offline."); },
    prompt: function () {
      if (install.deferred) { var d = install.deferred; d.prompt(); d.userChoice.then(function (c) { install.deferred = null; install.hide(); if (c.outcome === "accepted") toast("Installing…"); }); return; }
      if (isIOS()) { install.iosHelp(); return; }
      alert("Use your browser menu: ⋮ → Install app / Add to Home screen (Chrome, Edge, Samsung Internet), or Share → Add to Home Screen (Safari).");
    },
    hide: function () { $("#install-banner").hidden = true; document.body.classList.remove("has-banner"); },
    show: function () {
      if (isStandalone()) return;
      var dis = store.get("installDismissed", 0); if (dis && Date.now() - dis < 14 * 864e5) return;
      if (!isIOS() && !install.deferred) return;
      $("#install-sub").textContent = isIOS() ? "Tap Install for the Add to Home Screen steps." : "Add it to your home screen for quick offline use.";
      $("#install-banner").hidden = false; document.body.classList.add("has-banner");
    },
    init: function () {
      window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); install.deferred = e; document.body.classList.add("can-install"); setTimeout(install.show, 1200); });
      window.addEventListener("appinstalled", function () { install.deferred = null; install.hide(); toast("RF Toolbox installed"); });
      $("#install-btn").onclick = install.prompt;
      $("#install-dismiss").onclick = function () { store.set("installDismissed", Date.now()); install.hide(); };
      if (isIOS()) setTimeout(install.show, 2500);
    }
  };

  /* ---------- boot ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    main = $("#app"); titleEl = $("#title"); backBtn = $("#backBtn");
    backBtn.onclick = function () { if (history.length > 1 && document.referrer.indexOf(location.host) >= 0) history.back(); else location.hash = "#/"; };
    $("#themeBtn").onclick = function () { var t = store.get("theme", "auto"); store.set("theme", t === "auto" ? "dark" : t === "dark" ? "light" : "auto"); applyTheme(); };
    applyTheme();
    window.addEventListener("hashchange", route); route();
    install.init();
    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      navigator.serviceWorker.register("sw.js").then(function (reg) {
        reg.addEventListener("updatefound", function () {
          var nw = reg.installing; if (!nw) return;
          nw.addEventListener("statechange", function () {
            if (nw.state === "installed" && navigator.serviceWorker.controller) {
              var u = $("#update-bar"); u.hidden = false;
              $("#update-btn").onclick = function () { nw.postMessage("skipWaiting"); };
            }
          });
        });
      }).catch(function (e) { console.warn("SW registration failed", e); });
      var reloading = false;
      navigator.serviceWorker.addEventListener("controllerchange", function () { if (reloading || !$("#update-bar") || $("#update-bar").hidden) return; reloading = true; location.reload(); });
    }
  });
  window.RFApp = { fmtNum: fmtNum, fmtEng: fmtEng, toBase: toBase };
})();
