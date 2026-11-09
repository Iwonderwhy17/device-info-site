# Browser Privacy Lab

A single-page browser privacy check. It reads the details a website can see about your browser, estimates how recognizable that combination is, and shows what it did and did not measure. Built with Node.js and Express for Render.

## What it measures now

| Test | Where it runs | Affects grade |
|---|---|---|
| Surfaces: user agent, platform, languages, time zone, screen, cores, memory, canvas, WebGL, installed fonts | In your browser, on page load | Yes. Identifying bits, with a mechanism tag for each surface |
| Canvas and font stability | In your browser, read twice | Yes. A value that changes between reads is marked *randomized* and adds no bits |
| WebGL masking | In your browser | Yes. Hidden debug info is marked *masked* and adds no bits |
| Time zone set to UTC | In your browser | Marked *fixed* and adds no bits |
| Local network addresses (WebRTC, mDNS) | In your browser, on button press | Shown, not scored |
| Address and headers this server received | Server, on button press | Shown only. Nothing is stored |
| Simulated trackers (ad script, tracking pixel, on a second origin) | In your browser, on button press | Caps the grade when trackers load unblocked or only partly blocked. Needs `TRACKER_ORIGIN` |
| Request headers | Server, on button press | Shown only. Cookies and forwarding addresses are redacted |

## What it does not measure yet

These appear under "Not measured yet" on the page rather than being scored as absent.

- **Cross-site linkage.** The grade reflects one website's view. Whether a tracker can join your profile across two sites needs a two-origin harness.
- **Public IP through WebRTC.** This needs a STUN server, and this deployment does not run one.
- **DNS resolver.** A DNS leak test needs a DNS zone you control, with a logging authoritative server and per-test nonces. A web page cannot read its resolver directly.
- **Breakage and partitioning.** Protections that work by breaking pages, and per-browser storage partitioning, are not tested.
- **Calibrated bit values.** The bits per surface and the reference population size are placeholders. Every result is labelled *Provisional model*.

## How the grade works

See `public/score.js` and the methodology report.

1. Each surface is tagged *real*, *fixed*, *randomized*, *masked*, *absent* or *not measured*. Only *real* surfaces add bits.
2. Correlated surfaces share a group, such as user agent and platform. Each group counts once, at the bits of its most identifying member.
3. Bits sum to a total. Bands: A ≤ 4, B ≤ 10, C ≤ 16, D ≤ log2(reference population), F above.
4. Caps can only lower the grade. A WebRTC public-address mismatch caps at C. Trackers that all load unblocked cap at C. Partial blocking caps at B.

The known weakness: a browser that uses one fixed value for everyone, such as Tor Browser's user agent, still scores on that surface. Recognizing uniform values needs a reference population, which is not built yet.

## Run locally

```bash
npm install
npm test          # scoring unit tests
npm start
```

Open `http://localhost:3000`.

## Deploy on Render

1. Push this project to a GitHub repository.
2. In Render, choose **New + → Blueprint** and connect the repository.
3. Deploy. The health check is `/healthz`.

### Enabling the simulated-tracker test

The tracker test needs a second origin. Deploy this same code a second time under a different hostname, then set `TRACKER_ORIGIN` on the first service to that second URL. Without it, the page reports the tracker test as not configured.

Known limit: the probe uses generic paths (`/t/ad.js`, `/t/beacon.gif`). Ad blockers that match on these names will block them. Blockers that use different rules will not. A result is evidence of blocking, not a complete list of what a browser blocks.

## Privacy

- No analytics, no third-party scripts, no fingerprint uploads, no database.
- Browser readings stay in the page. Nothing from the surface tests is sent anywhere.
- Network tests run only when you press the button.
- The server returns your address and headers to you. It does not store them. The hosting provider necessarily sees network traffic and may keep infrastructure logs under its own policies.
- No exploits, silent local-network probing, history inspection, or covert device enumeration.

## Limits

- Results are estimates. Bit values are not calibrated against real visitors.
- Canvas, font and WebGL results vary by device and browser version.
- Browsers that randomize values per site may look more unique on one site than they are across sites. The two-origin harness is needed to see this.
- The page has been checked with unit tests on the scoring logic. The browser UI and server routes have not been run in a live browser yet.
