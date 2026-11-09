const test = require("node:test");
const assert = require("node:assert/strict");
const PS = require("../public/score.js");

const real = (id, value = "x") => ({ id, label: id, mechanism: "real", value });
const mech = (id, mechanism) => ({ id, label: id, mechanism, value: "" });

// Full signal set: everything measured, nothing leaking, all trackers blocked.
const CLEAN = {
  webrtcPublicMeasured: true,
  webrtcPublicMismatch: false,
  tracker: { ran: true, inconclusive: false, total: 3, blocked: 3 }
};

test("bandFor follows the proposed thresholds", () => {
  assert.equal(PS.bandFor(0), "A");
  assert.equal(PS.bandFor(4), "A");
  assert.equal(PS.bandFor(4.1), "B");
  assert.equal(PS.bandFor(10), "B");
  assert.equal(PS.bandFor(16), "C");
  assert.equal(PS.bandFor(17), "D");
  assert.equal(PS.bandFor(PS.REFERENCE_POPULATION * 10), "F");
});

test("a Safari-like browser with every surface real is not graded like a hardened one", () => {
  const safariLike = [
    real("userAgent"), real("platform"), real("language"), real("timezone"),
    real("screen"), real("colorDepth"), real("touch"), real("hardwareConcurrency"),
    real("deviceMemory"), real("canvas"), real("webgl"), real("fonts")
  ];
  const hardenedLike = [
    real("userAgent"), real("platform"), real("language"),
    mech("timezone", "fixed"), real("screen"),
    mech("canvas", "randomized"), mech("webgl", "masked"), mech("fonts", "absent"),
    mech("hardwareConcurrency", "fixed")
  ];
  const a = PS.score(safariLike, CLEAN);
  const b = PS.score(hardenedLike, CLEAN);
  assert.ok(a.bits > b.bits, `expected ${a.bits} > ${b.bits}`);
  assert.notEqual(a.grade, b.grade);
});

test("correlated surfaces in one group count only once", () => {
  const onlyUA = PS.score([real("userAgent")], CLEAN);
  const uaAndPlatform = PS.score([real("userAgent"), real("platform")], CLEAN);
  assert.equal(uaAndPlatform.bits, onlyUA.bits);
});

test("non-real mechanisms contribute no bits", () => {
  const s = PS.score([
    mech("canvas", "randomized"), mech("webgl", "masked"),
    mech("fonts", "absent"), mech("timezone", "fixed")
  ], CLEAN);
  assert.equal(s.bits, 0);
  assert.equal(s.grade, "A");
});

test("a WebRTC public-address mismatch caps the grade at C even when the band is A", () => {
  const s = PS.score([mech("canvas", "randomized")], {
    webrtcPublicMeasured: true,
    webrtcPublicMismatch: true,
    tracker: { ran: true, inconclusive: false, total: 3, blocked: 3 }
  });
  assert.equal(s.band, "A");
  assert.equal(s.grade, "C");
  assert.equal(s.caps.length, 1);
});

test("no blocked trackers caps at C; partial blocking caps at B", () => {
  const none = PS.score([], { ...CLEAN, tracker: { ran: true, total: 3, blocked: 0 } });
  const partial = PS.score([], { ...CLEAN, tracker: { ran: true, total: 3, blocked: 1 } });
  assert.equal(none.grade, "C");
  assert.equal(partial.grade, "B");
});

test("unmeasured tests are listed, not scored as absent", () => {
  const s = PS.score([{ id: "safari-canvas", label: "Safari canvas", mechanism: "unmeasured" }], {});
  assert.ok(s.notMeasured.includes("Safari canvas"));
  assert.ok(s.notMeasured.some(x => x.startsWith("Tracker blocking")));
  assert.ok(s.notMeasured.some(x => x.startsWith("Public IP via WebRTC")));
});

test("caps never raise a grade", () => {
  const s = PS.score(Array.from({ length: 12 }, (_, i) => real(["userAgent","platform","language","timezone","screen","colorDepth","touch","hardwareConcurrency","deviceMemory","canvas","webgl","fonts"][i])), CLEAN);
  assert.equal(s.grade, s.band);
});

test("output is always flagged provisional", () => {
  assert.equal(PS.score([], {}).provisional, true);
});
