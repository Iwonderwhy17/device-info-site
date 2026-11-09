const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

app.disable("x-powered-by");
app.use(express.static(PUBLIC_DIR, {
  extensions: ["html"],
  etag: true,
  maxAge: process.env.NODE_ENV === "production" ? "1h" : 0
}));

app.get("/healthz", (_req, res) => {
  res.status(200).type("text/plain").send("ok");
});

// This endpoint returns only the current request's headers. Cookie and
// credential values are redacted before the response is sent.
app.get("/api/request-headers", (req, res) => {
  const safeHeaders = {};
  const sensitive = new Set([
    "cookie", "authorization", "proxy-authorization",
    "x-api-key", "x-auth-token"
  ]);

  for (const [name, value] of Object.entries(req.headers)) {
    safeHeaders[name] = sensitive.has(name.toLowerCase())
      ? "[REDACTED]"
      : value;
  }

  res.set("Cache-Control", "no-store");
  res.json({
    explanation: "These are headers from this request. Cookie and credential values are redacted. The server does not save this response.",
    headers: safeHeaders
  });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Browser Privacy Lab listening on ${PORT}`);
});
