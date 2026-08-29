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

// --- TURN_KINDS / turnNodesOf -------------------------------------------
check("TURN_KINDS: user + command exactly", JSON.stringify(I.TURN_KINDS), JSON.stringify(["user", "command"]));
{
	const nodes = [
		{ kind: "assistant-step", key: "a" },
		{ kind: "user", key: "u1", content: [{ type: "text", text: "hi" }] },
		{ kind: "tool-call", key: "t" },
		{ kind: "command", key: "c1", commandId: "cmd-1", name: "goal", args: " 今天的目标" },
		{ kind: "command-input", key: "c1b" },
		{ kind: "context", key: "x" },
		{ kind: "user", key: "u2", content: [] }
	];
	const turns = I.turnNodesOf(nodes);
	check("turnNodesOf: keeps user and command in order", turns.map((n) => n.key).join(","), "u1,c1,u2");
	check("turnNodesOf: drops command-input/assistant/context kinds", turns.length, 3);
}
check("turnNodesOf: null node skipped", I.turnNodesOf([null, { kind: "user" }, undefined]).length, 1);
check("turnNodesOf: non-array input", I.turnNodesOf(null).length, 0);
check("turnNodesOf: bare array with non-objects", I.turnNodesOf(["user", 42, { kind: "command" }]).length, 1);

// --- timeOf / messagePreviewOf --------------------------------------------
check("timeOf: plain user node top-level time", I.timeOf({ kind: "user", time: 123 }), 123);
check("timeOf: command node top-level time", I.timeOf({ kind: "command", time: 456 }), 456);
check("timeOf: top-level null falls back to data time", I.timeOf({ kind: "command", time: null, data: { time: 7 } }), 7);
check("timeOf: no time anywhere", I.timeOf({ kind: "command", data: {} }), undefined);
check("timeOf: non-object", I.timeOf("x"), undefined);
check("messagePreviewOf: /goal command shows /name + args", I.messagePreviewOf({ kind: "command", name: "goal", args: " 优化日程软件" }), "/goal 优化日程软件");
check("messagePreviewOf: command without args", I.messagePreviewOf({ kind: "command", name: "goal", args: null }), "/goal");
check("messagePreviewOf: command with empty args", I.messagePreviewOf({ kind: "command", name: "goal", args: "   " }), "/goal");
check("messagePreviewOf: command missing name", I.messagePreviewOf({ kind: "command", commandId: "cmd-1" }), "/command");
check("messagePreviewOf: command truncates", I.messagePreviewOf({ kind: "command", name: "goal", args: "x".repeat(300) }).endsWith("…"), true);
check("messagePreviewOf: user node falls back to previewOf", I.messagePreviewOf({ kind: "user", content: [{ type: "image" }] }), "[图片]");
check("messagePreviewOf: non-object", I.messagePreviewOf(null), "");

// --- commandSuffixSelector --------------------------------------------------
check("commandSuffixSelector: plain id", I.commandSuffixSelector("cmd-8dfa4824-7"), '[data-chat-anchor-key$="cmd-8dfa4824-7"]');
check("commandSuffixSelector: rejects quote", I.commandSuffixSelector('cmd"x'), null);
check("commandSuffixSelector: rejects backslash", I.commandSuffixSelector("cmd\\x"), null);
check("commandSuffixSelector: rejects space", I.commandSuffixSelector("cmd x"), null);
check("commandSuffixSelector: rejects empty", I.commandSuffixSelector(""), null);
check("commandSuffixSelector: rejects non-string", I.commandSuffixSelector(42), null);

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
