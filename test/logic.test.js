/**
 * dsh-turn-marks - logic tests (Node only, no browser needed).
 *
 * Loads the REAL bundle (lib/client.js) through a minimal __ModuleLoader__
 * shim and asserts the pure helpers exported as `_internals`.
 *
 * Run:  node test/logic.test.js
 */
globalThis.window = {
	__ModuleLoader__: {
		load: (mod) => {
			globalThis.__tmks_loaded = mod;
		}
	}
};

const mod = await import("../lib/client.js");
const captured = globalThis.__tmks_loaded;
if (!captured) throw new Error("bundle did not register with __ModuleLoader__");

const loaded = captured.factory((name) => {
	if (name === "react") return {};
	throw new Error("unexpected require: " + name);
});
if (typeof loaded.apply !== "function") throw new Error("apply missing");
if (!Array.isArray(loaded.inject)) throw new Error("inject missing");
const I = loaded._internals;
if (!I) throw new Error("_internals missing");

let failed = 0;
function check(name, actual, expected) {
	const ok = Object.is(actual, expected);
	console.log((ok ? "PASS" : "FAIL") + "  " + name + (ok ? "" : `  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`));
	if (!ok) failed++;
}

// --- previewOf -----------------------------------------------------------
check("previewOf: text blocks joined", I.previewOf([{ type: "text", text: "hi" }, { type: "text", text: "there" }]), "hi there");
check("previewOf: image marker", I.previewOf([{ type: "image" }]), "[图片]");
check("previewOf: reasoning marker", I.previewOf([{ type: "reasoning", text: "think" }]), "[推理]");
check("previewOf: empty array", I.previewOf([]), "");
check("previewOf: not an array", I.previewOf(null), "");
check("previewOf: unknown block", I.previewOf([{ type: "weird" }]), "[内容]");
check("previewOf: truncates long text", I.previewOf([{ type: "text", text: "x".repeat(300) }]).endsWith("…"), true);
check("previewOf: collapses whitespace", I.previewOf([{ type: "text", text: "a\n\n  b" }]), "a b");

// --- spacingOf -----------------------------------------------------------
check("spacingOf: caps at BAR_SPACING for few bars", I.spacingOf(600, 7), I.BAR_SPACING);
check("spacingOf: shrinks when many bars", I.spacingOf(120, 20), 6);
check("spacingOf: zero count", I.spacingOf(600, 0), 0);
check("spacingOf: one bar", I.spacingOf(600, 1), I.BAR_SPACING);

// --- clusterTopOf --------------------------------------------------------
const gTop = 100;
const gHeight = 600;
check(
	"clusterTopOf: few bars vertically centered",
	I.clusterTopOf(gTop, gHeight, 7, I.spacingOf(gHeight, 7)),
	gTop + (gHeight - (6 * I.BAR_SPACING + I.HIT_SIZE)) / 2
);
check("clusterTopOf: many bars top-aligned", I.clusterTopOf(gTop, 120, 20, 6), gTop);
// Single bar (20px hit) in a 48px gutter is centered; the cluster must never
// start above the gutter top nor overflow its bottom.
{
	const tightTop = I.clusterTopOf(gTop, 48, 1, I.BAR_SPACING);
	check("clusterTopOf: single bar centered in tight gutter", tightTop, gTop + (48 - I.HIT_SIZE) / 2);
	check("clusterTopOf: never starts above gutter", tightTop >= gTop, true);
	check("clusterTopOf: never overflows gutter bottom", tightTop + I.HIT_SIZE <= gTop + 48, true);
}

// --- barTopOf ------------------------------------------------------------
const tops = [0, 1, 2].map((i) => I.barTopOf(gTop, gHeight, 3, i));
check("barTopOf: strictly increasing", tops[0] < tops[1] && tops[1] < tops[2], true);
check("barTopOf: within gutter", tops.every((t) => t >= 0 && t + I.HIT_SIZE <= gHeight), true);
check("barTopOf: first bar starts at cluster top", I.barTopOf(gTop, gHeight, 3, 0), I.clusterTopOf(gTop, gHeight, 3, I.spacingOf(gHeight, 3)) - gTop);

// --- scrollTargetOf ------------------------------------------------------
check("scrollTargetOf: aligns message to top", I.scrollTargetOf(100, 300, 5000), 100 + 300 - I.TOP_MARGIN);
check("scrollTargetOf: never negative", I.scrollTargetOf(0, 2, 5000), 0);
check("scrollTargetOf: clamps at max scroll", I.scrollTargetOf(100, 6000, 1000), 1000);
check("scrollTargetOf: exact fit", I.scrollTargetOf(50, 100, 142), 142);

// --- clampIndex ------------------------------------------------------------
check("clampIndex: inside range passes through", I.clampIndex(2, 5), 2);
check("clampIndex: first index", I.clampIndex(0, 5), 0);
check("clampIndex: last index", I.clampIndex(4, 5), 4);
check("clampIndex: past end becomes -1", I.clampIndex(5, 5), -1);
check("clampIndex: far past end becomes -1", I.clampIndex(99, 5), -1);
check("clampIndex: negative becomes -1", I.clampIndex(-1, 5), -1);
check("clampIndex: empty list always -1", I.clampIndex(0, 0), -1);
check("clampIndex: non-integer becomes -1", I.clampIndex(1.5, 5), -1);

// --- fmtTimeOf -------------------------------------------------------------
{
	const valid = new Date(2026, 7, 22, 14, 30, 5).getTime();
	check("fmtTimeOf: valid timestamp renders a clock", I.fmtTimeOf(valid).length > 0, true);
	check("fmtTimeOf: empty string", I.fmtTimeOf(""), "");
	check("fmtTimeOf: undefined", I.fmtTimeOf(undefined), "");
	check("fmtTimeOf: null", I.fmtTimeOf(null), "");
	check("fmtTimeOf: garbage string", I.fmtTimeOf("not-a-date"), "");
}

// --- activeIndexOf ---------------------------------------------------------
{
	// Viewport tops are ascending while scrolling a normal flow; rows 0-2
	// sit above the limit line, row 3 is the first one past it.
	const tops = [100, 200, 300, 400, 500];
	let reads = 0;
	const topAt = (i) => { reads++; return tops[i]; };
	check("activeIndexOf: last row at/above limit wins", I.activeIndexOf(5, topAt, 350), 2);
	check("activeIndexOf: stops reading after first miss (early break)", reads, 4);
	check("activeIndexOf: all above limit → last row", I.activeIndexOf(3, () => 10, 750), 2);
	check("activeIndexOf: none above limit → -1 then caller clamps to 0", I.activeIndexOf(2, () => 999, 750), -1);
	check("activeIndexOf: empty list → -1", I.activeIndexOf(0, () => 0, 750), -1);
}

console.log(failed === 0 ? "\nALL TESTS PASSED" : `\n${failed} TEST(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
