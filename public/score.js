/*
 * Browser Privacy Lab: scoring model (v2, PROVISIONAL).
 *
 * Pure functions, no DOM access, so they can be unit-tested with `node --test`.
 *
 * Model (see the methodology report):
 *  - Each surface has a mechanism: real | fixed | randomized | masked | absent | info | unmeasured.
 *    Only "real" surfaces carry identifying bits.
 *  - Correlated surfaces share a group (for example, user agent and platform).
 *    Each group counts once, at the bits of its most identifying member.
 *  - L = sum of counted bits. Bands come from L, then caps from protection
 *    and leak signals can only lower the grade.
 *
 * Calibration status: the per-surface bit priors below are NOT measured.
 * They are placeholders until a labelled reference sample exists. Every
 * output carries a PROVISIONAL flag so the UI cannot present them as fact.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.PrivacyScore = api;
  }
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  // Assumed size of the reference population. Placeholder until measured.
  const REFERENCE_POPULATION = 1000000;
  const LETTERS = ["A", "B", "C", "D", "F"]; // best to worst

  // Prior bits per surface. PROVISIONAL, not calibrated.
  const PRIORS = {
    userAgent: { group: "browser", bits: 6 },
    platform: { group: "browser", bits: 2 },
    language: { group: "locale", bits: 2.5 },
    timezone: { group: "time", bits: 2.5 },
    screen: { group: "display", bits: 4 },
    colorDepth: { group: "display", bits: 0.5 },
    touch: { group: "display", bits: 0.5 },
    hardwareConcurrency: { group: "hardware", bits: 2.5 },
    deviceMemory: { group: "hardware", bits: 1.5 },
    canvas: { group: "render", bits: 8 },
    webgl: { group: "render", bits: 7 },
    fonts: { group: "fonts", bits: 5 }
  };

  function bandFor(bits) {
    if (bits <= 4) return "A";
    if (bits <= 10) return "B";
    if (bits <= 16) return "C";
    if (bits <= Math.log2(REFERENCE_POPULATION)) return "D";
    return "F";
  }

  function worse(a, b) {
    return LETTERS.indexOf(a) >= LETTERS.indexOf(b) ? a : b;
  }

  /**
   * @param {Array<{id:string,label:string,mechanism:string,value?:string}>} surfaces
   * @param {{webrtcPublicMeasured?:boolean,webrtcPublicMismatch?:boolean,
   *          tracker?:{ran:boolean,inconclusive?:boolean,total?:number,blocked?:number}}} signals
   */
  function score(surfaces, signals) {
    signals = signals || {};
    const notMeasured = [];
    const caps = [];

    // Pass 1: find the most identifying real surface in each group.
    const groupLead = new Map();
    for (const s of surfaces) {
      if (s.mechanism !== "real") continue;
      const prior = PRIORS[s.id];
      if (!prior) continue;
      const lead = groupLead.get(prior.group);
      if (!lead || prior.bits > PRIORS[lead.id].bits) groupLead.set(prior.group, s);
    }

    // Pass 2: count each group once.
    let bits = 0;
    const contributions = [];
    for (const s of surfaces) {
      if (s.mechanism === "unmeasured") {
        notMeasured.push(s.label);
        continue;
      }
      const prior = PRIORS[s.id];
      let counted = 0;
      if (prior && s.mechanism === "real" && groupLead.get(prior.group) === s) {
        counted = prior.bits;
      }
      bits += counted;
      if (prior) {
        contributions.push({
          id: s.id,
          label: s.label,
          mechanism: s.mechanism,
          bits: counted,
          value: s.value || ""
        });
      }
    }

    // Protection and leak caps: these can only lower the grade.
    if (signals.webrtcPublicMeasured && signals.webrtcPublicMismatch) {
      caps.push({ grade: "C", reason: "WebRTC reveals a public address that differs from the one websites see" });
    } else if (!signals.webrtcPublicMeasured) {
      notMeasured.push("Public IP via WebRTC (needs a STUN server)");
    }

    const t = signals.tracker;
    if (!t || !t.ran) {
      notMeasured.push("Tracker blocking (run the network tests)");
    } else if (t.inconclusive) {
      notMeasured.push("Tracker blocking (control request failed, so the result is inconclusive)");
    } else if (t.blocked === 0) {
      caps.push({ grade: "C", reason: "Simulated trackers loaded without being blocked" });
    } else if (t.blocked < t.total) {
      caps.push({ grade: "B", reason: "Only some simulated trackers were blocked" });
    }

    const band = bandFor(bits);
    let grade = band;
    for (const cap of caps) grade = worse(grade, cap.grade);

    return {
      provisional: true,
      bits: Math.round(bits * 10) / 10,
      oneIn: Math.pow(2, bits),
      band,
      grade,
      caps,
      notMeasured,
      contributions,
      referencePopulation: REFERENCE_POPULATION
    };
  }

  return { REFERENCE_POPULATION, PRIORS, bandFor, score };
});
