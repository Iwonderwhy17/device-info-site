const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

// Optional second origin used for the simulated-tracker test. It must be a
// different host than this app (for example, a second Render service running
// this same code). When unset, the tracker test reports "not measured".
const TRACKER_ORIGIN = (process.env.TRACKER_ORIGIN || "").replace(/\/+$/, "") || null;

app.disable("x-powered-by");
// Render sits in front of the app, so req.ip is the visitor's address only
// when proxy trust is enabled. The address is shown back to the visitor and
// is not stored.
app.set("trust proxy", true);

app.use(express.static(PUBLIC_DIR, {
  extensions: ["html"],
  etag: true,
  maxAge: process.env.NODE_ENV === "production" ? "1h" : 0
}));

app.get("/healthz", (_req, res) => {
  res.status(200).type("text/plain").send("ok");
});

const SENSITIVE = new Set([
  "cookie", "authorization", "proxy-authorization", "x-api-key", "x-auth-token"
]);
const FORWARDING = new Set([
  "x-forwarded-for", "x-forwarded-host", "x-real-ip", "x-client-ip",
  "forwarded", "cf-connecting-ip", "true-client-ip"
]);

function redactHeaders(headers) {
  const out = {};
  for (const [name, value] of Object.entries(headers)) {
    const key = name.toLowerCase();
    out[name] = SENSITIVE.has(key) || FORWARDING.has(key) ? "[REDACTED]" : value;
  }
  return out;
}

app.get("/api/config", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ trackerOrigin: TRACKER_ORIGIN });
});

// The visitor's own address and request headers, returned to them only.
app.get("/api/echo", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    ip: req.ip || null,
    explanation: "This is the address and request headers this server received from you. Cookies, credentials and forwarding headers are redacted. Nothing is stored.",
    headers: redactHeaders(req.headers)
  });
});

app.get("/api/request-headers", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    explanation: "These are headers from this request. Cookie, credential and forwarding values are redacted. The server does not save this response.",
    headers: redactHeaders(req.headers)
  });
});

// Simulated trackers. Responses are inert: no cookies, no storage, no data kept.
const TRACKER_FILES = {
  "ad.js": { type: "application/javascript", body: "/* simulated ad script: no effect */" },
  "control.js": { type: "application/javascript", body: "/* control script: always expected to load */" },
  "beacon.gif": {
    type: "image/gif",
    body: Buffer.from("R0lGODlhAQABAPAAAAAAAAAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==", "base64")
  }
};

app.get("/t/:name", (req, res) => {
  const file = TRACKER_FILES[req.params.name];
  if (!file) return res.status(404).type("text/plain").send("not found");
  res.set("Cache-Control", "no-store");
  res.type(file.type).send(file.body);
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Browser Privacy Lab listening on ${PORT}`);
});

module.exports = { app, redactHeaders };
