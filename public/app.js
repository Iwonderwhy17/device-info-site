
const $ = (id) => document.getElementById(id);

function item(key, value) {
  const box = document.createElement("div");
  box.className = "data-item";

  const k = document.createElement("span");
  k.className = "key";
  k.textContent = key;

  const v = document.createElement("span");
  v.className = "value";
  v.textContent = value || "Not exposed";

  box.append(k, v);
  return box;
}

function cookieNames() {
  return document.cookie
    ? document.cookie.split(";")
        .map(x => x.trim().split("=")[0])
        .filter(Boolean)
        .join(", ")
    : "None visible to JavaScript";
}

function readLocalData() {
  const connection = navigator.connection ||
    navigator.mozConnection ||
    navigator.webkitConnection;

  const data = [
    ["User agent", navigator.userAgent],
    ["Screen size", `${screen.width} × ${screen.height} (DPR ${window.devicePixelRatio || 1})`],
    ["Viewport", `${innerWidth} × ${innerHeight}`],
    ["Language", `${navigator.language || "Unknown"}${navigator.languages?.length ? " · " + navigator.languages.join(", ") : ""}`],
    ["Time zone", Intl.DateTimeFormat().resolvedOptions().timeZone],
    ["Connection type", connection ? `${connection.effectiveType || "unknown"}${connection.type ? " · " + connection.type : ""}${connection.downlink ? " · " + connection.downlink + " Mbps" : ""}` : "Not exposed"],
    ["Cookie names", cookieNames()],
    ["Platform hint", navigator.userAgentData?.platform || navigator.platform || "Not exposed"],
    ["Do Not Track", navigator.doNotTrack || "Not set"],
    ["Global Privacy Control", navigator.globalPrivacyControl === true ? "Enabled" : navigator.globalPrivacyControl === false ? "Disabled" : "Not exposed"]
  ];

  $("localData").replaceChildren(
    ...data.map(([k, v]) => item(k, v))
  );
}

readLocalData();

$("refreshData").addEventListener("click", readLocalData);

$("setCookie").addEventListener("click", () => {
  document.cookie =
    "privacy_lab_demo=hello; Max-Age=86400; Path=/; SameSite=Lax" +
    (location.protocol === "https:" ? "; Secure" : "");

  $("cookieStatus").textContent =
    document.cookie.includes("privacy_lab_demo=")
      ? "Demo cookie set. Refresh the local details panel to see its name."
      : "The browser did not expose the cookie.";

  readLocalData();
});

$("clearCookie").addEventListener("click", () => {
  document.cookie =
    "privacy_lab_demo=; Max-Age=0; Path=/; SameSite=Lax" +
    (location.protocol === "https:" ? "; Secure" : "");

  $("cookieStatus").textContent = "Clear request sent.";
  readLocalData();
});

function canvasDigest() {
  const canvas = document.createElement("canvas");
  canvas.width = 280;
  canvas.height = 70;

  const ctx = canvas.getContext("2d");
  if (!ctx) return "Canvas unavailable";

  ctx.textBaseline = "top";
  ctx.font = "16px Arial";
  ctx.fillStyle = "#2c7658";
  ctx.fillRect(8, 8, 120, 24);

  ctx.fillStyle = "#b24a36";
  ctx.fillText("Privacy field test ✓", 12, 12);

  ctx.fillStyle = "rgba(40,90,160,.65)";
  ctx.font = "13px Georgia";
  ctx.fillText("canvas sample", 12, 42);

  const data = canvas.toDataURL();
  let hash = 2166136261;

  for (let i = 0; i < data.length; i++) {
    hash ^= data.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0") +
    " (FNV-1a digest)";
}

function webglDetails() {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl") ||
    canvas.getContext("experimental-webgl");

  if (!gl) return "WebGL unavailable or blocked";

  const info = gl.getExtension("WEBGL_debug_renderer_info");

  const vendor = info
    ? gl.getParameter(info.UNMASKED_VENDOR_WEBGL)
    : "Masked / unavailable";

  const renderer = info
    ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL)
    : "Masked / unavailable";

  return `Vendor: ${vendor}; Renderer: ${renderer}; WebGL: ${gl.getParameter(gl.VERSION)}`;
}

function fontProbe() {
  const candidates = [
    "Arial",
    "Arial Black",
    "Calibri",
    "Cambria",
    "Comic Sans MS",
    "Courier New",
    "Georgia",
    "Impact",
    "Roboto",
    "Segoe UI",
    "Times New Roman",
    "Trebuchet MS",
    "Verdana"
  ];

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const test = "mmmmmmmmmmlli";

  ctx.font = "72px monospace";
  const baseline = ctx.measureText(test).width;

  const found = candidates.filter(font => {
    ctx.font = `72px "${font}", monospace`;
    return ctx.measureText(test).width !== baseline;
  });

  return found.length
    ? found.join(", ")
    : "No candidates distinguishable";
}

function apiChecks() {
  return [
    ["Local storage", "localStorage" in window ? "Available" : "Unavailable"],
    ["Session storage", "sessionStorage" in window ? "Available" : "Unavailable"],
    ["IndexedDB", "indexedDB" in window ? "API present" : "Unavailable"],
    ["Service workers", "serviceWorker" in navigator ? "API present" : "Unavailable"],
    ["WebRTC API", "RTCPeerConnection" in window ? "API present; no address probe performed" : "Unavailable"],
    ["GPC signal", navigator.globalPrivacyControl === true ? "Enabled" : "Not enabled / unavailable"],
    ["DNT signal", navigator.doNotTrack || "Not set"]
  ];
}

function updateScore(rows) {
  let exposure = 0;

  const webgl = rows.find(r => r[0] === "WebGL details")?.[1] || "";
  const fonts = rows.find(r => r[0] === "Font probe")?.[1] || "";

  const gpc = navigator.globalPrivacyControl === true;
  const dnt = navigator.doNotTrack === "1";

  const connection = navigator.connection ||
    navigator.mozConnection ||
    navigator.webkitConnection;

  if (webgl.includes("Vendor:") && !webgl.includes("Masked")) exposure += 2;
  if (!fonts.startsWith("No candidates")) exposure += 2;
  if (screen.width && screen.height) exposure += 1;
  if (navigator.userAgent) exposure += 1;
  if (Intl.DateTimeFormat().resolvedOptions().timeZone) exposure += 1;
  if (!gpc && !dnt) exposure += 1;
  if (connection && connection.effectiveType) exposure += 1;
  if (navigator.platform) exposure += 1;

  const score = Math.min(10, exposure);

  $("scoreValue").textContent = score;

  $("scoreLabel").textContent =
    score <= 3 ? "Lower measured exposure" :
    score <= 6 ? "Moderate measured exposure" :
    "Higher measured exposure";
}

$("runAdvanced").addEventListener("click", () => {
  $("advancedStatus").textContent = "Running local checks…";

  const rows = [
    ["Canvas digest", canvasDigest()],
    ["WebGL details", webglDetails()],
    ["Font probe", fontProbe()],
    ...apiChecks()
  ];

  $("advancedResults").replaceChildren(
    ...rows.map(([k, v]) => item(k, v))
  );

  $("advancedStatus").textContent =
    "Finished locally. No fingerprint results were uploaded.";

  updateScore(rows);
});

$("loadHeaders").addEventListener("click", async () => {
  const out = $("headersOutput");
  out.textContent = "Requesting headers…";

  try {
    const response = await fetch("/api/request-headers", {
      cache: "no-store",
      credentials: "same-origin"
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    out.textContent = JSON.stringify(data, null, 2);

  } catch (error) {
    out.textContent = `Could not load headers: ${error.message}`;
  }
});

const themeToggle = $("themeToggle");

const savedTheme = (() => {
  try {
    return localStorage.getItem("privacy-lab-theme");
  } catch {
    return null;
  }
})();

if (savedTheme === "dark" || savedTheme === "light") {
  document.documentElement.dataset.theme = savedTheme;
}

themeToggle.addEventListener("click", () => {
  const next =
    document.documentElement.dataset.theme === "dark"
      ? "light"
      : "dark";

  document.documentElement.dataset.theme = next;

  try {
    localStorage.setItem("privacy-lab-theme", next);
  } catch {}
});
