(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const PS = window.PrivacyScore;

  const FONTS = [
    "Arial", "Arial Black", "Calibri", "Cambria", "Comic Sans MS", "Courier New",
    "Georgia", "Impact", "Roboto", "Segoe UI", "Times New Roman", "Trebuchet MS", "Verdana"
  ];

  const MECH_LABEL = {
    real: "Real", fixed: "Fixed value", randomized: "Randomized",
    masked: "Masked", absent: "Absent", info: "Info", unmeasured: "Not measured"
  };

  const state = {
    surfaces: [],
    signals: { webrtcPublicMeasured: false, tracker: { ran: false } }
  };

  function surface(id, label, mechanism, value) {
    return { id, label, mechanism, value: value === undefined || value === null ? "" : String(value) };
  }

  // ---------- local surfaces (read in the browser, nothing sent) ----------

  function fnv1a(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, "0");
  }

  function canvasHash() {
    const c = document.createElement("canvas");
    c.width = 260;
    c.height = 60;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.textBaseline = "top";
    ctx.font = "15px Arial";
    ctx.fillStyle = "#2c7658";
    ctx.fillRect(6, 6, 110, 22);
    ctx.fillStyle = "#b24a36";
    ctx.fillText("Privacy lab canvas", 10, 10);
    ctx.font = "12px Georgia";
    ctx.fillStyle = "rgba(40,90,160,.6)";
    ctx.fillText("sample text 0123456789", 10, 36);
    try {
      return fnv1a(c.toDataURL());
    } catch {
      return null;
    }
  }

  function canvasSurface() {
    const a = canvasHash();
    if (!a) return surface("canvas", "Canvas rendering", "absent", "Canvas 2D unavailable");
    // Read twice. Identical draws that differ mean the browser adds noise.
    const b = canvasHash();
    if (a !== b) {
      return surface("canvas", "Canvas rendering", "randomized", `Changes between identical draws (${a} / ${b})`);
    }
    return surface("canvas", "Canvas rendering", "real", a);
  }

  function webglSurface() {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl") || c.getContext("experimental-webgl");
    if (!gl) return surface("webgl", "WebGL renderer", "absent", "WebGL unavailable");
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (!ext) return surface("webgl", "WebGL renderer", "masked", "Debug renderer info not exposed");
    const vendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL);
    const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
    return surface("webgl", "WebGL renderer", "real", `${vendor} / ${renderer}`);
  }

  function probeFonts() {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return null;
    const text = "mmmmmmmmmmlli0123456789";
    const bases = ["monospace", "serif", "sans-serif"];
    const baseWidth = {};
    for (const b of bases) {
      ctx.font = `72px ${b}`;
      baseWidth[b] = ctx.measureText(text).width;
    }
    return FONTS.filter((font) =>
      bases.some((b) => {
        ctx.font = `72px "${font}", ${b}`;
        return ctx.measureText(text).width !== baseWidth[b];
      })
    );
  }

  function fontsSurface() {
    const a = probeFonts();
    if (!a) return surface("fonts", "Installed fonts", "absent", "Canvas text unavailable");
    const b = probeFonts();
    if (a.length === 0) return surface("fonts", "Installed fonts", "absent", "None of the probed fonts detected");
    if (a.join("|") !== b.join("|")) {
      return surface("fonts", "Installed fonts", "randomized", "Font list changes between reads");
    }
    return surface("fonts", "Installed fonts", "real", `${a.length} of ${FONTS.length}: ${a.join(", ")}`);
  }

  function readLocalSurfaces() {
    const nav = navigator;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    const surfaces = [
      surface("userAgent", "User agent", nav.userAgent ? "real" : "absent", nav.userAgent),
      surface("platform", "Platform", nav.platform ? "real" : "absent", nav.userAgentData?.platform || nav.platform),
      surface("language", "Languages", nav.languages?.length ? "real" : "absent", (nav.languages || []).join(", ")),
      surface("timezone", "Time zone", tz === "UTC" ? "fixed" : tz ? "real" : "absent", tz),
      surface("screen", "Screen", screen.width > 0 ? "real" : "absent", `${screen.width} × ${screen.height} @ ${window.devicePixelRatio || 1}x`),
      surface("colorDepth", "Colour depth", screen.colorDepth ? "real" : "absent", screen.colorDepth ? `${screen.colorDepth}-bit` : ""),
      surface("touch", "Touch points", typeof nav.maxTouchPoints === "number" ? "real" : "absent", nav.maxTouchPoints),
      surface("hardwareConcurrency", "Logical CPU cores", nav.hardwareConcurrency ? "real" : "absent", nav.hardwareConcurrency),
      surface("deviceMemory", "Device memory (GB, rounded)", nav.deviceMemory ? "real" : "absent", nav.deviceMemory),
      canvasSurface(),
      webglSurface(),
      fontsSurface(),
      surface("crosssite", "Cross-site linkage (two-origin test)", "unmeasured", ""),
      surface("gpc", "Global Privacy Control", "info",
        nav.globalPrivacyControl === true ? "Enabled" : nav.globalPrivacyControl === false ? "Disabled" : "Not exposed"),
      surface("dnt", "Do Not Track", "info", nav.doNotTrack || "Not set"),
      surface("storage", "Local storage", "info", (() => {
        try { return window.localStorage ? "Available" : "Unavailable"; } catch { return "Blocked"; }
      })())
    ];
    return surfaces;
  }

  // ---------- network tests (only after the visitor presses the button) ----------

  async function fetchJSON(url) {
    const r = await fetch(url, { cache: "no-store", credentials: "same-origin" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  function webrtcLocal(timeoutMs) {
    return new Promise((resolve) => {
      const RTC = window.RTCPeerConnection || window.webkitRTCPeerConnection;
      if (!RTC) return resolve({ available: false, candidates: [] });
      const found = [];
      let pc;
      let timer;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { pc.close(); } catch {}
        resolve({ available: true, candidates: found });
      };
      try {
        pc = new RTC({ iceServers: [] });
      } catch {
        return resolve({ available: false, candidates: [] });
      }
      pc.createDataChannel("probe");
      pc.onicecandidate = (e) => {
        if (!e.candidate) return finish();
        found.push(e.candidate.candidate);
      };
      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === "complete") finish();
      };
      timer = setTimeout(finish, timeoutMs);
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .catch(finish);
    });
  }

  function classifyCandidate(line) {
    // "candidate:<foundation> <component> <transport> <priority> <address> <port> typ <type> ..."
    const parts = line.split(" ");
    const address = parts[4] || "";
    if (address.endsWith(".local")) return { address, verdict: "Hidden behind an mDNS name" };
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(address)) {
      return { address, verdict: "Private LAN address exposed" };
    }
    if (address.includes(":") || /^\d+\.\d+\.\d+\.\d+$/.test(address)) {
      return { address, verdict: "Address exposed to the page" };
    }
    return { address, verdict: "Unrecognised form" };
  }

  async function echoTest() {
    try {
      const d = await fetchJSON("/api/echo");
      return { ip: d.ip || "Not reported", headers: Object.keys(d.headers || {}).length };
    } catch (e) {
      return { error: e.message };
    }
  }

  function loadResource(url, kind, timeoutMs) {
    return new Promise((resolve) => {
      let el;
      let timer;
      const done = (result) => {
        clearTimeout(timer);
        if (el && el.parentNode) el.parentNode.removeChild(el);
        resolve(result);
      };
      timer = setTimeout(() => done("timeout"), timeoutMs);
      if (kind === "img") {
        el = new Image();
        el.onload = () => done("loaded");
        el.onerror = () => done("blocked");
        el.src = url;
      } else {
        el = document.createElement("script");
        el.async = true;
        el.onload = () => done("loaded");
        el.onerror = () => done("blocked");
        el.src = url;
        document.head.appendChild(el);
      }
    });
  }

  async function trackerTest(origin) {
    const n = Date.now();
    const control = await loadResource(`/t/control.js?n=${n}`, "script", 4000);
    if (control !== "loaded") {
      return { ran: true, inconclusive: true, results: [{ name: "Control script (own origin)", outcome: control }] };
    }
    const probes = [
      { name: "Ad script (other origin)", url: `${origin}/t/ad.js?n=${n}`, kind: "script" },
      { name: "Tracking pixel (other origin)", url: `${origin}/t/beacon.gif?n=${n}`, kind: "img" }
    ];
    const results = await Promise.all(probes.map(async (p) => ({
      name: p.name,
      outcome: await loadResource(p.url, p.kind, 4000)
    })));
    const blocked = results.filter((r) => r.outcome === "blocked" || r.outcome === "timeout").length;
    return { ran: true, inconclusive: false, total: results.length, blocked, results };
  }

  // ---------- rendering ----------

  function fmtInt(n) {
    return Math.round(n).toLocaleString();
  }

  function renderScore() {
    const r = PS.score(state.surfaces, state.signals);
    const gradeEl = $("grade");
    gradeEl.textContent = r.grade;
    gradeEl.className = `grade ${r.grade}`;

    const refBits = Math.log2(r.referencePopulation);
    let headline;
    if (r.bits > refBits) {
      headline = `Looks unique among about ${fmtInt(r.referencePopulation)} reference visitors`;
    } else {
      headline = `About 1 in ${fmtInt(r.oneIn)} browsers look like yours`;
    }
    $("headline").textContent = headline;
    $("detail").textContent = "This estimate uses only the surfaces this page can read. Linkage across websites is not tested yet, so treat it as a single-site figure.";
    $("bits").textContent = `${r.bits.toFixed(1)} bits`;
    $("refpop").textContent = fmtInt(r.referencePopulation) + " (assumed)";

    const caps = $("caps");
    const capItems = [`Band before protection and leak checks: ${r.band}.`];
    if (r.caps.length === 0) {
      capItems.push("No protection or leak caps applied.");
    } else {
      for (const c of r.caps) capItems.push(`Capped at ${c.grade}: ${c.reason}.`);
    }
    caps.replaceChildren(...capItems.map((text) => liOf(text)));

    $("notMeasured").replaceChildren(...(r.notMeasured.length
      ? r.notMeasured.map(liOf)
      : [liOf("Everything in this model has been measured.")]));

    renderSurfaces(r);
  }

  function liOf(text) {
    const li = document.createElement("li");
    li.textContent = text;
    return li;
  }

  function renderSurfaces(scored) {
    const bitsById = new Map(scored.contributions.map((c) => [c.id, c.bits]));
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    thead.innerHTML = "<tr><th>Surface</th><th>What the page read</th><th>Status</th><th>Bits</th></tr>";
    const tbody = document.createElement("tbody");
    for (const s of state.surfaces) {
      const tr = document.createElement("tr");
      const label = document.createElement("td");
      label.textContent = s.label;
      const value = document.createElement("td");
      value.className = "value";
      value.textContent = s.value || (s.mechanism === "unmeasured" ? "Needs a second site" : "");
      const status = document.createElement("td");
      const chip = document.createElement("span");
      chip.className = `chip ${s.mechanism}`;
      chip.textContent = MECH_LABEL[s.mechanism] || s.mechanism;
      status.appendChild(chip);
      const bits = document.createElement("td");
      bits.className = "num";
      const b = bitsById.get(s.id);
      bits.textContent = b ? b.toFixed(1) : "–";
      tr.append(label, value, status, bits);
      tbody.appendChild(tr);
    }
    table.append(thead, tbody);
    $("surfaces").replaceChildren(table);
  }

  function refreshLocal() {
    state.surfaces = readLocalSurfaces();
    renderScore();
  }

  // ---------- wiring ----------

  $("refreshLocal").addEventListener("click", refreshLocal);

  $("runNetwork").addEventListener("click", async () => {
    const btn = $("runNetwork");
    const status = $("networkStatus");
    btn.disabled = true;
    status.textContent = "Running network tests…";
    $("echoIp").textContent = "Checking…";
    $("webrtc").textContent = "Checking…";
    $("trackers").textContent = "Checking…";

    try {
      const [echo, rtc, cfg] = await Promise.all([
        echoTest(),
        webrtcLocal(4000),
        fetchJSON("/api/config").catch(() => ({ trackerOrigin: null }))
      ]);

      $("echoIp").textContent = echo.error ? `Failed: ${echo.error}` : `${echo.ip}`;

      if (!rtc.available) {
        $("webrtc").textContent = "WebRTC unavailable in this browser.";
      } else if (rtc.candidates.length === 0) {
        $("webrtc").textContent = "No local candidates (blocked or disabled).";
      } else {
        const seen = new Map();
        for (const line of rtc.candidates) {
          const c = classifyCandidate(line);
          seen.set(`${c.address} — ${c.verdict}`, true);
        }
        $("webrtc").replaceChildren(...[...seen.keys()].map((text) => {
          const span = document.createElement("span");
          span.style.display = "block";
          span.textContent = text;
          return span;
        }));
      }
      // Public address via WebRTC needs a STUN server, which this deployment does not run.
      state.signals.webrtcPublicMeasured = false;

      if (cfg.trackerOrigin) {
        const t = await trackerTest(cfg.trackerOrigin);
        state.signals.tracker = t;
        if (t.inconclusive) {
          $("trackers").textContent = "Inconclusive: the control request failed, so trackers were not judged.";
        } else {
          $("trackers").textContent = `${t.blocked} of ${t.total} simulated trackers blocked`;
        }
      } else {
        state.signals.tracker = { ran: false };
        $("trackers").textContent = "Not configured on this deployment (set TRACKER_ORIGIN).";
      }

      status.textContent = "Network tests finished. Results are shown on this page only.";
    } catch (e) {
      status.textContent = `Network tests failed: ${e.message}`;
    } finally {
      btn.disabled = false;
      renderScore();
    }
  });

  $("loadHeaders").addEventListener("click", async () => {
    const out = $("headersOutput");
    out.textContent = "Loading headers…";
    try {
      const data = await fetchJSON("/api/request-headers");
      out.textContent = JSON.stringify(data, null, 2);
    } catch (e) {
      out.textContent = `Could not load headers: ${e.message}`;
    }
  });

  const themeToggle = $("themeToggle");
  try {
    const saved = localStorage.getItem("privacy-lab-theme");
    if (saved === "dark" || saved === "light") document.documentElement.dataset.theme = saved;
  } catch {}
  themeToggle.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("privacy-lab-theme", next); } catch {}
  });

  refreshLocal();
})();
