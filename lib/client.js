window.__ModuleLoader__.load({
	id: "dsh-turn-marks",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region lib/client.js
		/**
		 * dsh-turn-marks - browser half.
		 *
		 * A Claude Code / Codex desktop style "turn marks" strip on the left edge
		 * of the conversation: one small bar per USER message (turn). Clicking a
		 * bar smooth-scrolls the conversation to that message and turns the bar
		 * white; hovering shows a preview of that message. The active bar also
		 * follows manual scrolling (the bar of the message currently near the
		 * top of the viewport turns white).
		 *
		 * How it works:
		 * - UI is mounted additively in the `conversation.input.dock` slot
		 *   (a full-width row above the composer) - no shipped component is
		 *   replaced, and the entry is cleaned up when the plugin stops.
		 * - The dock owner passes the live `ConversationSnapshot` as
		 *   `session`; user messages are `session.nodes` filtered by
		 *   `kind === 'user'` (ordered, with `seq`/`time`/`content`).
		 * - Geometry: the scrollport is the stable `[data-conversation-scroll]`
		 *   element; each user row carries `[data-chat-flow-kind="user"]`;
		 *   the composer seat is `[data-composer-seat]`. A MutationObserver +
		 *   ResizeObserver (rAF-debounced) re-measure the gutter and detect
		 *   whether chat rows are actually rendered - the strip hides outside
		 *   the chat view (e.g. the trajectory view), where rows do not exist.
		 * - The strip and its tooltip use `position: fixed` (viewport-relative)
		 *   and are re-measured on every layout change; the app's conversation
		 *   root has no transformed ancestors, so fixed positioning is stable.
		 * - Bars are DENSE: the center-to-center spacing is capped at
		 *   `BAR_SPACING` (24px). With few messages the cluster stays compact
		 *   and vertically centered in the gutter; with many messages the
		 *   spacing shrinks so the bars still fit the whole gutter. Each bar
		 *   has a 20x20px hit area (the visible 4x14px dot sits in the middle)
		 *   so it is easy to click.
		 * - Clicking scrolls the message to the TOP of the viewport
		 *   (`port.scrollTop + flowTop - TOP_MARGIN`, the same scrollport-
		 *   relative math the app itself uses), clamped to the maximum scroll
		 *   position: when the text below the message cannot fill the viewport,
		 *   the message is placed as high as possible while the content below
		 *   stays fully visible.
		 * - The bundle runtime has no `styles` builtin (that is dynamic-package
		 *   only), so CSS lives in one owned <style> element removed on stop.
		 *
		 * Pure geometry/preview helpers are exported as `_internals` so the
		 * test suite (`test/logic.test.js`) can exercise the real code.
		 */
		const react = require("react");

		/** Required services before mounting. */
		const inject = ["slots"];

		const PORT_SELECTOR = "[data-conversation-scroll]";
		const ROW_SELECTOR = '[data-chat-flow-kind="user"]';
		const COMPOSER_SELECTOR = "[data-composer-seat]";

		/** Strip geometry: gutter fixed to the left edge of the scrollport. */
		const GUTTER_INSET = 6;
		const GUTTER_TOP = 16;
		const GUTTER_BOTTOM_MARGIN = 32;
		/** Max center-to-center distance between bars (dense packing). */
		const BAR_SPACING = 24;
		/** Clickable hit area per bar (the visible dot is centered inside). */
		const HIT_SIZE = 20;
		/** Visible bar size. */
		const BAR_WIDTH = 4;
		const BAR_HEIGHT = 14;
		/** Scroll margin: the message lands this far below the top edge. */
		const TOP_MARGIN = 8;
		const PREVIEW_MAX = 180;

		const STATIC_CSS =
			".tm-strip{position:fixed;z-index:2147483000;pointer-events:none}" +
			".tm-bar{position:absolute;width:" + HIT_SIZE + "px;height:" + HIT_SIZE + "px;display:flex;align-items:center;justify-content:center;cursor:pointer;pointer-events:auto}" +
			".tm-bar-dot{width:" + BAR_WIDTH + "px;height:" + BAR_HEIGHT + "px;border-radius:3px;background:var(--dsw-alias-label-tertiary,rgba(128,128,128,.5));transition:background .15s ease,box-shadow .15s ease}" +
			".tm-bar:hover .tm-bar-dot{background:var(--dsw-alias-label-secondary,rgba(180,180,180,.85))}" +
			".tm-bar.active .tm-bar-dot{background:var(--dsw-alias-label-primary,#fff);box-shadow:0 0 6px var(--dsw-alias-label-primary,rgba(255,255,255,.6))}" +
			".tm-tip{position:fixed;z-index:2147483001;pointer-events:none;background:var(--dsw-alias-bg-overlay,#1e1e1e);color:var(--dsw-alias-label-primary,#f0f0f0);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.4));border-radius:8px;padding:6px 10px;font-size:12px;line-height:18px;max-width:320px;box-shadow:0 4px 16px rgba(0,0,0,.35)}" +
			".tm-tip-head{color:var(--dsw-alias-label-secondary,#aaa);font-weight:600;margin-bottom:2px;white-space:nowrap}" +
			".tm-tip-body{display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-wrap;word-break:break-word}";

		/** Center-to-center bar spacing: capped for density, shrinks to fit. */
		function spacingOf(gutterHeight, count) {
			return count > 0 ? Math.min(BAR_SPACING, gutterHeight / count) : 0;
		}

		/** Top edge of the whole cluster (centered in the gutter when it fits). */
		function clusterTopOf(gutterTop, gutterHeight, count, spacing) {
			const clusterHeight = (count - 1) * spacing + HIT_SIZE;
			return gutterTop + Math.max(0, (gutterHeight - clusterHeight) / 2);
		}

		/** Bar `index` top edge, relative to the gutter top (strip children). */
		function barTopOf(gutterTop, gutterHeight, count, index) {
			const spacing = spacingOf(gutterHeight, count);
			return clusterTopOf(gutterTop, gutterHeight, count, spacing) + index * spacing - gutterTop;
		}

		/**
		 * Scroll target for a message whose viewport-relative offset is `flowTop`:
		 * align it with the top of the viewport, clamped to [0, maxScroll] so the
		 * content below stays fully visible when the end of the conversation is
		 * reached.
		 */
		function scrollTargetOf(scrollTop, flowTop, maxScroll) {
			return Math.min(Math.max(0, scrollTop + flowTop - TOP_MARGIN), maxScroll);
		}

		/** Extract a short plain-text preview from a user message's content blocks. */
		function previewOf(content) {
			if (!Array.isArray(content)) return "";
			const parts = [];
			for (const block of content) {
				if (!block || typeof block !== "object") continue;
				if (block.type === "text" && typeof block.text === "string") parts.push(block.text);
				else if (block.type === "image") parts.push("[图片]");
				else if (block.type === "reasoning") parts.push("[推理]");
				else parts.push("[内容]");
			}
			let text = parts.join(" ").replace(/\s+/g, " ").trim();
			if (text.length > PREVIEW_MAX) text = text.slice(0, PREVIEW_MAX) + "…";
			return text;
		}

		function MarkStrip(props) {
			const session = props.session;
			const users = react.useMemo(() => {
				const nodes = session && Array.isArray(session.nodes) ? session.nodes : [];
				return nodes.filter((node) => node && node.kind === "user");
			}, [session]);

			const [geo, setGeo] = react.useState(null);
			const [hasRows, setHasRows] = react.useState(false);
			const [active, setActive] = react.useState(-1);
			const [hover, setHover] = react.useState(-1);
			const activeRef = react.useRef(-1);
			const geoRef = react.useRef(null);

			const measure = react.useCallback(() => {
				const port = document.querySelector(PORT_SELECTOR);
				if (!port) return;
				const portRect = port.getBoundingClientRect();
				const composer = port.querySelector(COMPOSER_SELECTOR);
				const bottom = composer ? composer.getBoundingClientRect().top : portRect.bottom;
				const next = {
					left: portRect.left + GUTTER_INSET,
					top: portRect.top + GUTTER_TOP,
					height: Math.max(48, bottom - portRect.top - GUTTER_BOTTOM_MARGIN)
				};
				const prev = geoRef.current;
				if (!prev || Math.abs(prev.left - next.left) > 0.5 || Math.abs(prev.top - next.top) > 0.5 || Math.abs(prev.height - next.height) > 0.5) {
					geoRef.current = next;
					setGeo(next);
				}
			}, []);

			// One effect owns all port observation. It re-runs whenever the user
			// message count changes (so the first message is picked up after the
			// commit) and whenever the port element is replaced.
			react.useEffect(() => {
				const port = document.querySelector(PORT_SELECTOR);
				if (!port) return;

				const refresh = () => {
					measure();
					const has = port.querySelectorAll(ROW_SELECTOR).length > 0;
					setHasRows((prev) => (prev === has ? prev : has));
				};

				let raf = 0;
				const schedule = () => {
					if (raf !== 0) return;
					raf = requestAnimationFrame(() => {
						raf = 0;
						refresh();
					});
				};

				// Row presence + geometry: chat rows exist only while the chat
				// view is rendered, so the strip hides in other views.
				const observer = new MutationObserver(schedule);
				observer.observe(port, { childList: true, subtree: true });
				const resizeObserver = new ResizeObserver(schedule);
				resizeObserver.observe(port);
				window.addEventListener("resize", schedule);

				// The white bar follows manual scrolling: it tracks the user
				// message whose row is nearest the top of the viewport.
				const onScroll = () => {
					if (raf !== 0) return;
					raf = requestAnimationFrame(() => {
						raf = 0;
						refresh();
						const rows = port.querySelectorAll(ROW_SELECTOR);
						const portRect = port.getBoundingClientRect();
						const limit = portRect.top + 72;
						let index = -1;
						for (let i = 0; i < rows.length; i++) {
							if (rows[i].getBoundingClientRect().top <= limit) index = i;
							else break;
						}
						if (index === -1 && rows.length > 0) index = 0;
						if (index !== activeRef.current) {
							activeRef.current = index;
							setActive(index);
						}
					});
				};
				port.addEventListener("scroll", onScroll, { passive: true });
				onScroll();
				schedule();

				return () => {
					observer.disconnect();
					resizeObserver.disconnect();
					window.removeEventListener("resize", schedule);
					port.removeEventListener("scroll", onScroll);
					if (raf !== 0) cancelAnimationFrame(raf);
				};
			}, [measure, users.length]);

			// Reset selection when switching sessions.
			const sessionId = session ? session.sessionId : null;
			react.useEffect(() => {
				activeRef.current = -1;
				setActive(-1);
				setHover(-1);
			}, [sessionId]);

			if (users.length === 0 || geo === null || !hasRows) return null;

			const count = users.length;
			const spacing = spacingOf(geo.height, count);
			const clusterTop = clusterTopOf(geo.top, geo.height, count, spacing);

			const scrollTo = (index) => {
				const port = document.querySelector(PORT_SELECTOR);
				if (!port) return;
				const rows = port.querySelectorAll(ROW_SELECTOR);
				const row = rows[index];
				if (!row) return;
				const portRect = port.getBoundingClientRect();
				const rowRect = row.getBoundingClientRect();
				const target = scrollTargetOf(port.scrollTop, rowRect.top - portRect.top, port.scrollHeight - port.clientHeight);
				activeRef.current = index;
				setActive(index);
				port.scrollTo({ top: target, behavior: "smooth" });
			};

			const bars = [];
			for (let i = 0; i < count; i++) {
				const top = barTopOf(geo.top, geo.height, count, i);
				bars.push(react.createElement("div", {
					key: i,
					className: "tm-bar" + (i === active ? " active" : ""),
					style: { top: top + "px" },
					"aria-label": "第 " + (i + 1) + " 条消息",
					onMouseEnter: () => setHover(i),
					onMouseLeave: () => setHover(-1),
					onClick: () => scrollTo(i)
				}, react.createElement("div", { className: "tm-bar-dot" })));
			}

			const hoveredCenter = clusterTop + hover * spacing + HIT_SIZE / 2;
			const tipTop = Math.max(geo.top, Math.min(hoveredCenter - 30, geo.top + geo.height - 90));

			// Viewport-fixed strip: the conversation root has no transformed
			// ancestor, so fixed positioning stays viewport-relative.
			return react.createElement(react.Fragment, null,
					react.createElement("div", {
						className: "tm-strip",
						style: { left: geo.left + "px", top: geo.top + "px", height: geo.height + "px" }
					}, bars),
					hover >= 0 && react.createElement("div", {
						className: "tm-tip",
						style: { left: (geo.left + 26) + "px", top: tipTop + "px" }
					},
						react.createElement("div", { className: "tm-tip-head" },
							"#" + (hover + 1) + " · " + (users[hover].time ? new Date(users[hover].time).toLocaleTimeString() : "")),
						react.createElement("div", { className: "tm-tip-body" }, previewOf(users[hover].content))
					)
			);
		}

		function apply(ctx) {
			const slots = ctx.get("slots");
			if (slots === undefined) return;

			const styleEl = document.createElement("style");
			styleEl.dataset.plugin = "dsh-turn-marks";
			document.head.appendChild(styleEl);
			styleEl.textContent = STATIC_CSS;

			ctx.effect(() => () => {
				styleEl.remove();
			}, "dsh-turn-marks: style element");

			slots.inject("conversation.input.dock", () => slots.register(
				{ name: "conversation.input.dock", id: "turn-marks", order: 30 },
				(slotProps) => react.createElement(MarkStrip, { session: slotProps.session })
			));
		}

		exports.apply = apply;
		exports.inject = inject;
		exports._internals = {
			BAR_SPACING,
			HIT_SIZE,
			TOP_MARGIN,
			spacingOf,
			clusterTopOf,
			barTopOf,
			scrollTargetOf,
			previewOf
		};
		//#endregion
		return module.exports;
	}
});
