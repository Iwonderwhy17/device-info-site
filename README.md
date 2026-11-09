# Browser Privacy Field Notes

A single-page, mobile-friendly browser privacy explainer built with Node.js and Express for Render.

## Included

- Article-style landing page with light/dark theme toggle.
- Local-only browser information panel: user agent, screen and viewport size, language, time zone, connection hints, cookie names, platform hint, DNT and GPC signals.
- First-party demo cookie set/clear controls.
- User-triggered canvas digest, WebGL information, font probes, and browser API checks.
- A clearly labeled illustrative exposure score. It is **not** a security audit or a scientifically validated privacy score.
- `/api/request-headers` endpoint. Cookie and credential header values are redacted.
- `/healthz` endpoint for Render.
- No analytics, third-party trackers, fingerprint uploads, or database.

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Deploy on Render from GitHub

1. Create a GitHub repository and upload the contents of this project (not the ZIP file itself).
2. In Render, choose **New + → Blueprint**.
3. Connect the repository. Render detects `render.yaml`.
4. Deploy. The health check is `/healthz`.

You can also create a **Web Service** manually:
- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/healthz`

## Privacy and limitations

Browser-side values are read in the visitor's browser and rendered in the page. The advanced checks run only after the visitor presses the button. The header endpoint returns the current request's headers with sensitive values redacted; the app does not intentionally persist them.

The hosting provider necessarily handles network traffic and may retain infrastructure logs under its own policies. This project does not add application-level request logging or a database. Do not describe a public website as collecting literally nothing: the host must process requests to serve it.

This project deliberately does not include exploits, silent local-network probing, WebRTC IP discovery, history inspection, covert device enumeration, or third-party tracker scripts. Those are not needed for a transparent privacy lab and would undermine its stated purpose.

The score is a simple demonstration of measured browser exposure, not a complete or authoritative privacy/security rating. Canvas and font results can vary and are not stable unique identifiers.
