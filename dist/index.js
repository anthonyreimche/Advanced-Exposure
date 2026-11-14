//#region src/model.ts
var e = {
	black: {
		min: -2,
		max: 5,
		step: .01
	},
	midtones: {
		min: -2,
		max: 2,
		step: .01
	}
}, t = {
	black: 0,
	midtones: 0
}, n = .18, r = (e, t) => Math.min(Math.max(e, t.min), t.max), i = (e) => .2126 * e[0] + .7152 * e[1] + .0722 * e[2], a = {
	ev: {
		min: -5,
		max: 5,
		step: .01
	},
	contrast: {
		min: -100,
		max: 100,
		step: 1
	},
	highlights: {
		min: -100,
		max: 100,
		step: 1
	},
	shadows: {
		min: -100,
		max: 100,
		step: 1
	},
	whites: {
		min: -100,
		max: 100,
		step: 1
	},
	blacks: {
		min: -100,
		max: 100,
		step: 1
	},
	compression: {
		min: 0,
		max: 100,
		step: 1
	},
	threshold: {
		min: 50,
		max: 95,
		step: 1
	}
}, o = {
	ev: 0,
	contrast: 0,
	highlights: 0,
	shadows: 0,
	whites: 0,
	blacks: 0,
	compression: 0,
	threshold: 80
};
async function s(e, t, n, { tolerance: i, maxSteps: a, range: o }) {
	let s = r(t, o);
	for (let t = 1; t <= a; t++) {
		let a = await e(s);
		if (!(a > 0)) return {
			ev: s,
			steps: t
		};
		let c = Math.log2(n / a), l = r(s + c, o);
		if (Math.abs(c) < i || l === s) return {
			ev: s,
			steps: t
		};
		s = l;
	}
	return {
		ev: s,
		steps: a
	};
}
async function c(e, { lo: t, hi: n, limit: r, steps: i, falling: a = !1 }) {
	let o = async (t) => await e(t) <= r, [s, c] = a ? [n, t] : [t, n];
	if (await o(c)) return c;
	if (!await o(s)) return s;
	let l = s, u = c;
	for (let e = 0; e < i; e++) {
		let e = (l + u) / 2;
		await o(e) ? l = e : u = e;
	}
	return l;
}
//#endregion
//#region src/params.ts
var l = "advanced-exposure", u = `${l}.exposure`, d = `${l}.tone`, f = `${l}.threshold`, p = [
	"ev",
	"contrast",
	"highlights",
	"shadows",
	"whites",
	"blacks",
	"compression",
	"threshold"
], m = (e) => `${u}.${e}`, h = ["black", "midtones"], g = (e) => `${d}.${e}`, _ = (e) => typeof e == "number" && Number.isFinite(e);
function v(e, t, n) {
	let r = {};
	for (let i of t) {
		let t = e[i];
		t !== void 0 && (r[n(i)] = t);
	}
	return r;
}
function y(e) {
	let t = { ...o };
	for (let n of p) {
		let i = e[m(n)];
		_(i) && (t[n] = r(i, a[n]));
	}
	return t;
}
var b = (e) => v(e, p, m), ee = () => b(o);
function te(n) {
	let i = { ...t };
	for (let t of h) {
		let a = n[g(t)];
		_(a) && (i[t] = r(a, e[t]));
	}
	return i;
}
var x = (e) => v(e, h, g), S = () => x(t), ne = {
	off: 0,
	highlights: 1,
	shadows: 2
};
function re(e, t) {
	return {
		[`${f}.mode`]: ne[e],
		[`${f}.high`]: t.high,
		[`${f}.low`]: t.low
	};
}
//#endregion
//#region src/metering.ts
var ie = 2 ** -14, ae = .35, C = (e) => e.width < 2 && e.height < 2, w = (e, t) => i([
	e.data[4 * t],
	e.data[4 * t + 1],
	e.data[4 * t + 2]
]), T = (e, t) => ({
	x: Math.min(e.width - 1, Math.max(0, Math.floor(t.x * e.width))),
	y: Math.min(e.height - 1, Math.max(0, Math.floor(t.y * e.height)))
});
function E(e, t) {
	if (C(e) || t.x < 0 || t.x > 1 || t.y < 0 || t.y > 1) return null;
	let n = T(e, t), r = Math.max(2, .01 * Math.max(e.width, e.height)), i = Math.floor(r), a = 0, o = 0;
	for (let t = Math.max(0, n.y - i); t <= Math.min(e.height - 1, n.y + i); t++) for (let s = Math.max(0, n.x - i); s <= Math.min(e.width - 1, n.x + i); s++) (s - n.x) ** 2 + (t - n.y) ** 2 > r * r || (a += w(e, t * e.width + s), o++);
	return o > 0 ? a / o : null;
}
function D(e, t) {
	if (C(e)) return null;
	let n = 0, r = 0, i = e.width - 1, a = e.height - 1;
	if (typeof t == "object") {
		let o = T(e, {
			x: Math.min(t.x0, t.x1),
			y: Math.min(t.y0, t.y1)
		}), s = T(e, {
			x: Math.max(t.x0, t.x1),
			y: Math.max(t.y0, t.y1)
		});
		[n, r, i, a] = [
			o.x,
			o.y,
			s.x,
			s.y
		];
	}
	let o = 0, s = 0;
	for (let c = r; c <= a; c++) {
		let r = ((c + .5) / e.height - .5) / .5;
		for (let a = n; a <= i; a++) {
			let n = 1;
			if (t === "centre") {
				let t = ((a + .5) / e.width - .5) / .5;
				n = Math.exp(-(t * t + r * r) / (2 * ae * ae));
			}
			o += n, s += n * Math.log2(Math.max(w(e, c * e.width + a), ie));
		}
	}
	return o > 0 ? 2 ** (s / o) : null;
}
function O(e, t) {
	return e.sort(), e[Math.min(e.length - 1, Math.max(0, Math.round(t * (e.length - 1))))];
}
function oe(e, t) {
	if (C(e)) return null;
	let n = e.width * e.height, r = new Float32Array(n);
	for (let t = 0; t < n; t++) r[t] = Math.max(e.data[4 * t], e.data[4 * t + 1], e.data[4 * t + 2]);
	return O(r, t);
}
function se(e, t) {
	if (C(e)) return null;
	let n = e.width * e.height, r = new Float32Array(n);
	for (let t = 0; t < n; t++) r[t] = w(e, t);
	return O(r, t);
}
function ce(e, t) {
	if (C(e)) return null;
	let n = e.width * e.height, r = 0;
	for (let i = 0; i < n; i++) (e.data[4 * i] >= t || e.data[4 * i + 1] >= t || e.data[4 * i + 2] >= t) && r++;
	return r / n;
}
function le(e, t) {
	if (C(e)) return null;
	let n = e.width * e.height, r = 0;
	for (let i = 0; i < n; i++) e.data[4 * i] <= t && e.data[4 * i + 1] <= t && e.data[4 * i + 2] <= t && r++;
	return r / n;
}
//#endregion
//#region src/rt.ts
var k, A;
function ue(e) {
	A = e, k = e.react;
}
//#endregion
//#region src/settings.ts
var de = [
	"average",
	"centre",
	"spot",
	"highlights",
	"ettr"
], j = {
	average: "Average",
	centre: "Centre-weighted",
	spot: "Spot weighted",
	highlights: "Highlight priority",
	ettr: "Expose to the right"
}, fe = [
	25,
	50,
	75,
	100
], pe = {
	25: "Slight",
	50: "Medium",
	75: "Strong",
	100: "Full"
}, M = {
	min: -4,
	max: 2,
	step: .1
}, N = {
	mode: "meterMode",
	intensity: "intensity",
	target: "meterTarget",
	match: "matchTarget",
	highLevel: "highlightLevel",
	lowLevel: "shadowLevel",
	clipShare: "clipShare",
	ettrPercentile: "ettrPercentile"
}, P = (e, t, n) => {
	let i = A.settings.get(e, t);
	return typeof i == "number" && Number.isFinite(i) ? r(i, n) : t;
};
function F() {
	let e = A.settings.get(N.mode, "average"), t = A.settings.get(N.intensity, 100), n = A.settings.get(N.match, 0);
	return {
		mode: de.find((t) => t === e) ?? "average",
		intensity: fe.find((e) => e === t) ?? 100,
		target: P(N.target, 0, M),
		match: typeof n == "number" && n > 0 ? n : null,
		high: P(N.highLevel, 250, {
			min: 128,
			max: 255
		}) / 255,
		low: P(N.lowLevel, 5, {
			min: 0,
			max: 127
		}) / 255,
		clip: P(N.clipShare, .1, {
			min: 0,
			max: 5
		}) / 100,
		ettr: P(N.ettrPercentile, 99.5, {
			min: 90,
			max: 100
		}) / 100
	};
}
function me() {
	let [e, t] = k.useState(F);
	return k.useEffect(() => A.settings.onChange(() => t(F())), []), e;
}
var he = {
	title: "Advanced Exposure",
	keywords: [
		"clipping",
		"warning",
		"auto exposure",
		"expose to the right",
		"whites",
		"blacks"
	],
	fields: [
		{
			key: N.highLevel,
			label: "Highlight warning level",
			hint: "On the 0–255 scale: the clipping view and Auto treat a channel at or above this as clipped. 255 is pure white.",
			type: "number",
			default: 250,
			min: 128,
			max: 255,
			step: 1
		},
		{
			key: N.lowLevel,
			label: "Shadow warning level",
			hint: "On the 0–255 scale: the clipping view and Auto treat a pixel whose channels are all at or below this as crushed.",
			type: "number",
			default: 5,
			min: 0,
			max: 127,
			step: 1
		},
		{
			key: N.clipShare,
			label: "Auto clip share (%)",
			hint: "Shift+double-click on Whites, Blacks or Black level lets this share of the photo reach the warning level.",
			type: "number",
			default: .1,
			min: 0,
			max: 5,
			step: .05
		},
		{
			key: N.ettrPercentile,
			label: "Expose to the right percentile (%)",
			hint: "Expose to the right places this percentile of the photo's brightest channel on the highlight warning level.",
			type: "number",
			default: 99.5,
			min: 90,
			max: 100,
			step: .1
		}
	]
}, I = {
	encoding: "linear",
	primaries: "rec709"
}, ge = {
	encoding: "perceptual",
	primaries: "rec709"
}, L = a.ev, R = {
	tolerance: .01,
	maxSteps: 4,
	range: L
}, z = 8, _e = .995, B = (e) => ({
	kind: "failed",
	reason: e
}), V = "No photo is open.", ve = "Couldn't measure the photo: this graphics card has no float render targets.", ye = "The photo changed before the measurement finished.", H = class extends Error {}, U = () => A.stores.useDevelopStore.getState(), W = (e) => `${e >= 0 ? "+" : "−"}${Math.abs(e).toFixed(2)} EV`;
function G() {
	let e = U();
	if (!e.photoId) throw new H(V);
	return {
		photoId: e.photoId,
		params: e.previewParams ?? e.params,
		bag: e.paramBag,
		exposure: y(e.paramBag)
	};
}
function be(e, t) {
	if (U().photoId !== e.photoId) throw new H(ye);
	if (!t) throw new H(ve);
	return t;
}
async function K(e, t, n) {
	let r = {
		...e.bag,
		...b(t),
		...n === "scene" ? S() : {}
	};
	return be(e, await A.develop.renderPhotoFloatFrame(e.photoId, e.params, {
		point: n === "scene" ? "scene" : "pre-output",
		space: n === "scene" ? I : ge,
		paramBag: r
	}));
}
async function q(e, t) {
	return be(e, await A.develop.captureFloatFrame(e.params, {
		point: "scene",
		space: I,
		paramBag: {
			...b(t),
			...S()
		}
	}));
}
var J = (e) => {
	if (e === null) throw new H(ve);
	return e;
};
async function Y(e) {
	try {
		return await e();
	} catch (e) {
		return e instanceof H ? B(e.message) : (console.warn("[advanced-exposure] measurement failed:", e), B("The measurement failed; see the console."));
	}
}
function X(e, t, n) {
	if (U().photoId !== e.photoId) throw new H(ye);
	U().setDynParams(t), U().commitEdit(`Advanced Exposure ${n}`);
}
var Z = (e) => Number((Math.round(e * 100) / 100).toFixed(2));
function xe(e, t, n, i) {
	let a = e.exposure.ev, o = r(Z(a + n.intensity / 100 * (t - a)), L);
	return X(e, b({ ev: o }), i), {
		kind: "done",
		status: `Exposure ${W(o)}`
	};
}
function Se(e, t) {
	return Y(async () => {
		let r = G(), i = r.exposure.ev, a = `auto (${j[e.mode]})`;
		if (e.mode === "highlights" || e.mode === "ettr") {
			let t = e.mode === "highlights" ? _e : e.ettr, n = async (e) => J(oe(await K(r, { ev: e }, "output"), t));
			if (e.mode === "highlights" && await n(i) <= e.high) return B("No highlights reach the warning level.");
			let o = Math.max(L.min, i - 5), s = e.mode === "highlights" ? i : Math.min(L.max, i + 5), l = e.mode === "highlights" ? 7 : z;
			return xe(r, await c(n, {
				lo: o,
				hi: s,
				limit: e.high,
				steps: l
			}), e, a);
		}
		let o = e.mode, { ev: l } = await s(async (e) => {
			if (o !== "spot") return J(D(await K(r, { ev: e }, "scene"), o));
			if (!t) throw new H("Drag a rectangle on the image, or click a spot, to meter.");
			let n = await q(r, { ev: e });
			return J("x0" in t ? D(n, t) : E(n, t));
		}, i, n * 2 ** e.target, R);
		return xe(r, l, e, a);
	});
}
function Ce(e) {
	return Y(async () => {
		let t = G(), n = Math.floor(await c(async (n) => J(ce(await K(t, { whites: n }, "output"), e.high)), {
			lo: -100,
			hi: 100,
			limit: e.clip,
			steps: z
		}));
		return X(t, b({ whites: n }), "auto whites"), {
			kind: "done",
			status: `Whites ${n}`
		};
	});
}
function we(e) {
	return Y(async () => {
		let t = G(), n = Math.ceil(await c(async (n) => J(le(await K(t, { blacks: n }, "output"), e.low)), {
			lo: -100,
			hi: 100,
			limit: e.clip,
			steps: z,
			falling: !0
		}));
		return X(t, b({ blacks: n }), "auto blacks"), {
			kind: "done",
			status: `Blacks ${n}`
		};
	});
}
function Te(t) {
	return Y(async () => {
		let n = G(), i = r(J(se(await K(n, {}, "scene"), t.clip)) * 100, e.black);
		return X(n, x({ black: i }), "auto black level"), {
			kind: "done",
			status: `Black level ${i.toFixed(2)} %`
		};
	});
}
async function Ee(e, t) {
	let n = await A.develop.captureFrame(t, { paramBag: S() }), { width: r, height: i } = n;
	n.close();
	let a = {
		x: e.x / r,
		y: e.y / i
	};
	if (r < 2 || i < 2 || a.x < 0 || a.x > 1 || a.y < 0 || a.y > 1) throw new H("The press was off the image.");
	return a;
}
function De(e) {
	return Y(async () => {
		let t = G(), r = await Ee(e, t.params), i = J(E(await q(t, {}), r));
		if (!(i > 0)) throw new H("The spot is black: there is nothing to match.");
		return A.settings.set(N.match, i), {
			kind: "done",
			status: `Measured ${W(Math.log2(i / n))} from middle grey`
		};
	});
}
function Oe(e, t) {
	return Y(async () => {
		if (t.match === null) throw new H("Measure a spot on a reference photo first.");
		let n = G(), r = await Ee(e, n.params), { ev: i } = await s(async (e) => J(E(await q(n, { ev: e }), r)), n.exposure.ev, t.match, R), a = Z(i);
		return X(n, b({ ev: a }), "match"), {
			kind: "done",
			status: `Exposure ${W(a)}`
		};
	});
}
function ke(e, t = A.stores.useCatalogStore.getState().photos) {
	if (!e) return null;
	let n = t.find((t) => t.id === e)?.exif.exposureCompensation;
	return typeof n == "number" && Number.isFinite(n) && n !== 0 ? n : null;
}
function Ae() {
	let e = U();
	if (!e.photoId) return B(V);
	let t = ke(e.photoId);
	if (t === null) return B("The camera recorded no exposure compensation.");
	let n = r(Z(-t), L);
	return e.setDynParams(b({ ev: n })), e.commitEdit("Advanced Exposure undo camera compensation"), {
		kind: "done",
		status: `Exposure ${W(n)}`
	};
}
//#endregion
//#region src/Panel.tsx
var je = [
	{
		key: "ev",
		label: "Exposure"
	},
	{
		key: "contrast",
		label: "Contrast"
	},
	{
		key: "highlights",
		label: "Highlights"
	},
	{
		key: "shadows",
		label: "Shadows"
	},
	{
		key: "whites",
		label: "Whites"
	},
	{
		key: "blacks",
		label: "Blacks"
	}
], Me = [{
	key: "compression",
	label: "Amount",
	commit: "highlight compression"
}, {
	key: "threshold",
	label: "Threshold",
	commit: "compression threshold"
}], Ne = [{
	key: "black",
	label: "Black level"
}, {
	key: "midtones",
	label: "Midtones"
}], Pe = {
	ev: "highlights",
	highlights: "highlights",
	whites: "highlights",
	compression: "highlights",
	threshold: "highlights",
	shadows: "shadows",
	blacks: "shadows",
	black: "shadows"
};
function Fe(e) {
	let t = k.useRef(!1);
	return k.useEffect(() => () => {
		t.current && A.develop.setViewValues(null);
	}, []), (n) => n && ((r) => {
		t.current = r, A.develop.setViewValues(r ? re(n, e) : null);
	});
}
function Ie() {
	let e = A.develop.useParamScope();
	return /* @__PURE__ */ k.createElement("div", { style: { padding: 8 } }, e.maskId === null ? /* @__PURE__ */ k.createElement(Re, { scope: e }) : /* @__PURE__ */ k.createElement(Le, { scope: e }));
}
function Le({ scope: n, preview: r, onAutoBlack: i }) {
	let { Slider: a } = A.components, o = te(n.getParams());
	return /* @__PURE__ */ k.createElement(k.Fragment, null, Ne.map(({ key: s, label: c }) => /* @__PURE__ */ k.createElement(a, {
		key: s,
		label: c,
		value: o[s],
		min: e[s].min,
		max: e[s].max,
		step: e[s].step,
		defaultValue: t[s],
		onChange: (e) => n.setParams(x({ [s]: e })),
		onCommit: () => n.commit(`Advanced Exposure ${c.toLowerCase()}`),
		onModifierPreview: r?.(Pe[s]),
		onAuto: s === "black" ? i : void 0
	})));
}
function Re({ scope: e }) {
	let { AutoButton: t, Slider: n } = A.components, { Section: r, tokens: i } = A.ui, s = me(), c = A.stores.useDevelopStore((e) => e.photoId !== null), l = y(e.getParams()), [u, d] = k.useState(""), f = Fe(s), p = k.useCallback((e) => d(e.kind === "done" ? e.status : e.reason), []), m = k.useCallback((e) => {
		d("Measuring…"), e().then(p);
	}, [p]), h = () => {
		let e = F();
		e.mode === "spot" ? (Ve((e) => m(() => Se(F(), e)), () => d("")), d("Drag a rectangle on the image, or click a spot. Esc cancels.")) : m(() => Se(e));
	}, g = {
		ev: h,
		whites: () => m(() => Ce(F())),
		blacks: () => m(() => we(F()))
	}, _ = (t, r, i = r.toLowerCase(), s) => /* @__PURE__ */ k.createElement(n, {
		key: t,
		icon: s,
		label: r,
		value: l[t],
		min: a[t].min,
		max: a[t].max,
		step: a[t].step,
		defaultValue: o[t],
		onChange: (n) => e.setParams(b({ [t]: n })),
		onCommit: () => e.commit(`Advanced Exposure ${i}`),
		onModifierPreview: f(Pe[t]),
		onAuto: g[t]
	});
	return /* @__PURE__ */ k.createElement(k.Fragment, null, /* @__PURE__ */ k.createElement(t, {
		title: `Auto exposure (${j[s.mode]})`,
		disabled: !c,
		onClick: h
	}), je.map(({ key: e, label: t }) => _(e, t, t.toLowerCase(), `core.${e === "ev" ? "exposure" : e}`)), /* @__PURE__ */ k.createElement(r, { title: "Highlight compression" }, Me.map(({ key: e, label: t, commit: n }) => _(e, t, n))), /* @__PURE__ */ k.createElement(Le, {
		scope: e,
		preview: f,
		onAutoBlack: () => m(() => Te(F()))
	}), /* @__PURE__ */ k.createElement(ze, { prefs: s }), /* @__PURE__ */ k.createElement(Be, {
		report: p,
		measuring: m
	}), /* @__PURE__ */ k.createElement("div", {
		role: "status",
		"aria-live": "polite",
		style: {
			color: i.textMuted,
			fontSize: 11,
			minHeight: 14,
			marginTop: 4
		}
	}, u));
}
function ze({ prefs: e }) {
	let { Slider: t } = A.components, { Section: n, Select: r, SegmentedControl: i, Stack: a } = A.ui, [o, s] = k.useState(null);
	return /* @__PURE__ */ k.createElement(n, { title: "Metering" }, /* @__PURE__ */ k.createElement(a, { gap: 6 }, /* @__PURE__ */ k.createElement(r, {
		ariaLabel: "Meter mode",
		value: e.mode,
		options: de.map((e) => ({
			value: e,
			label: j[e]
		})),
		onChange: (e) => A.settings.set(N.mode, e)
	}), /* @__PURE__ */ k.createElement(i, {
		size: "sm",
		value: String(e.intensity),
		options: fe.map((e) => ({
			value: String(e),
			label: pe[e],
			title: `${e} % of the metered change`
		})),
		onChange: (e) => A.settings.set(N.intensity, Number(e))
	}), /* @__PURE__ */ k.createElement(t, {
		label: "Target",
		value: o ?? e.target,
		min: M.min,
		max: M.max,
		step: M.step,
		defaultValue: 0,
		onChange: s,
		onCommit: () => {
			o !== null && A.settings.set(N.target, o), s(null);
		}
	})));
}
function Be({ report: e, measuring: t }) {
	let { Button: n, Row: r, Section: i } = A.ui, a = A.stores.useDevelopStore((e) => e.photoId), o = ke(a, A.stores.useCatalogStore((e) => e.photos)), s = A.develop.usePickDragHeld(), [c, l] = k.useState(null);
	k.useEffect(() => {
		s || l(null);
	}, [s]), k.useEffect(() => c ? (A.develop.setPickDrag({ onPress: (e) => {
		l(null), t(() => c === "measure" ? De(e) : Oe(e, F()));
	} }), () => A.develop.setPickDrag(null)) : void 0, [c, t]);
	let u = (e, t, r) => /* @__PURE__ */ k.createElement(n, {
		size: "sm",
		active: c === e,
		"aria-pressed": c === e,
		title: `${r} (Esc cancels)`,
		disabled: !a,
		onClick: () => l(c === e ? null : e)
	}, t);
	return /* @__PURE__ */ k.createElement(i, { title: "Series" }, /* @__PURE__ */ k.createElement(r, {
		gap: 6,
		wrap: !0
	}, /* @__PURE__ */ k.createElement(n, {
		size: "sm",
		disabled: o === null,
		onClick: () => e(Ae()),
		title: "Set Exposure to cancel the compensation the camera was set to"
	}, o === null ? "Undo camera EC" : `Undo camera EC (${W(o)})`), u("measure", "Measure", "Click a spot on the reference photo to keep its brightness"), u("match", "Match", "Click the same subject on this photo to give it the measured brightness")));
}
var Q = null;
function Ve(e, t) {
	Q = {
		pick: e,
		cancel: t
	}, A.develop.setCanvasTool({
		overlay: Ue,
		onEscape: () => {
			Q?.cancel(), Q = null;
		}
	});
}
var He = 4;
function Ue({ rect: e }) {
	let { tokens: t } = A.ui, [n, r] = k.useState(null), i = (t) => {
		let n = t.currentTarget, r = n.getBoundingClientRect(), i = (t.clientX - r.left) / r.width * n.offsetWidth, a = (t.clientY - r.top) / r.height * n.offsetHeight;
		return {
			x: (i - e.x) / e.w,
			y: (a - e.y) / e.h
		};
	}, a = (e) => {
		if (!n) return;
		let t = i(e), a = Math.hypot(e.clientX - n.startX, e.clientY - n.startY) >= He ? {
			x0: n.from.x,
			y0: n.from.y,
			x1: t.x,
			y1: t.y
		} : n.from;
		r(null);
		let o = Q;
		Q = null, A.develop.setCanvasTool(null), o?.pick(a);
	}, o = n && {
		left: e.x + Math.min(n.from.x, n.to.x) * e.w,
		top: e.y + Math.min(n.from.y, n.to.y) * e.h,
		width: Math.abs(n.to.x - n.from.x) * e.w,
		height: Math.abs(n.to.y - n.from.y) * e.h
	};
	return /* @__PURE__ */ k.createElement("div", {
		"data-testid": "spot-surface",
		style: {
			position: "absolute",
			inset: 0,
			cursor: "crosshair",
			pointerEvents: "auto"
		},
		onPointerDown: (e) => {
			if (e.button !== 0) return;
			e.currentTarget.setPointerCapture?.(e.pointerId);
			let t = i(e);
			r({
				from: t,
				to: t,
				startX: e.clientX,
				startY: e.clientY
			});
		},
		onPointerMove: (e) => n && r({
			...n,
			to: i(e)
		}),
		onPointerUp: a
	}, o && /* @__PURE__ */ k.createElement("div", { style: {
		position: "absolute",
		...o,
		border: `1px solid ${t.accent}`,
		pointerEvents: "none"
	} }));
}
//#endregion
//#region src/stage.ts
var We = "\nfloat aeToneStops(float e0, float kc, float ks, float kh, float kw, float kb) {\n  float e = e0 * (1.0 + 0.5 * kc);\n  e += 1.5 * ks * (1.0 - smoothstep(-4.5, 0.0, e));\n  e += 1.5 * kh * smoothstep(-1.0, 2.5, e);\n  e += kw * smoothstep(1.5, 3.5, e);\n  e += kb * (1.0 - smoothstep(-8.0, -3.5, e));\n  return e;\n}\n", Ge = "\nif (ev != 0.0 || contrast != 0.0 || highlights != 0.0 || shadows != 0.0 || whites != 0.0 || blacks != 0.0 || compression != 0.0) {\n  float aeGain = exp2(clamp(ev, -5.0, 5.0));\n  float aeL = dot(lin, vec3(0.2126, 0.7152, 0.0722));\n  bool aeShaped = contrast != 0.0 || highlights != 0.0 || shadows != 0.0 || whites != 0.0 || blacks != 0.0;\n  if (aeShaped && aeL > 0.0) {\n    float aeStops = log2(aeL * aeGain / 0.18);\n    aeGain = 0.18 * exp2(aeToneStops(aeStops,\n      clamp(contrast, -100.0, 100.0) / 100.0, clamp(shadows, -100.0, 100.0) / 100.0,\n      clamp(highlights, -100.0, 100.0) / 100.0, clamp(whites, -100.0, 100.0) / 100.0,\n      clamp(blacks, -100.0, 100.0) / 100.0)) / aeL;\n  }\n  lin *= aeGain;\n  float aeAmount = clamp(compression, 0.0, 100.0) / 100.0;\n  float aeKnee = clamp(threshold, 50.0, 95.0) / 100.0;\n  float aePeak = max(max(lin.r, lin.g), lin.b);\n  if (aeAmount > 0.0 && aePeak > aeKnee) {\n    float aeRoom = 1.0 - aeKnee;\n    float aeOver = aePeak - aeKnee;\n    lin *= mix(1.0, (aeKnee + aeRoom * aeOver / (aeOver + aeRoom)) / aePeak, aeAmount);\n  }\n}", Ke = {
	ev: "Exposure",
	contrast: "Contrast",
	highlights: "Highlights",
	shadows: "Shadows",
	whites: "Whites",
	blacks: "Blacks",
	compression: "Highlight compression",
	threshold: "Compression threshold"
};
function qe() {
	return {
		id: u,
		name: "Advanced Exposure",
		phase: "scene-linear",
		priority: 10,
		anchor: "tone",
		glsl: Ge.trimStart(),
		helpers: We,
		uniforms: p.map((e) => ({
			key: e,
			glslType: "float",
			default: o[e],
			range: a[e],
			label: Ke[e]
		})),
		dormantWhen: {
			ev: 0,
			contrast: 0,
			highlights: 0,
			shadows: 0,
			whites: 0,
			blacks: 0,
			compression: 0
		},
		presetScope: "global"
	};
}
var Je = "\nif (black != 0.0 || midtones != 0.0) {\n  float aeFloor = clamp(black, -2.0, 5.0) / 100.0;\n  lin = (lin - vec3(aeFloor)) * (1.0 / (1.0 - aeFloor));\n  float aeStops = clamp(midtones, -2.0, 2.0);\n  float aeY = dot(lin, vec3(0.2126, 0.7152, 0.0722));\n  if (aeStops != 0.0 && aeY > 0.0) {\n    float aeGamma = log(0.18 * exp2(aeStops)) / log(0.18);\n    lin *= pow(aeY, aeGamma) / aeY;\n  }\n}";
function Ye() {
	return {
		id: d,
		name: "Advanced Exposure black level and midtones",
		phase: "scene-linear",
		priority: 10,
		glsl: Je.trimStart(),
		uniforms: [{
			key: "black",
			glslType: "float",
			default: 0,
			range: e.black,
			label: "Black level"
		}, {
			key: "midtones",
			glslType: "float",
			default: 0,
			range: e.midtones,
			label: "Midtones"
		}],
		dormantWhen: {
			black: 0,
			midtones: 0
		},
		mask: { maskable: !0 },
		presetScope: "global"
	};
}
var Xe = "\nif (mode == 1) c = step(vec3(high), c);\nelse if (mode == 2) c = vec3(1.0) - step(c, vec3(low));";
function Ze() {
	return {
		id: f,
		name: "Advanced Exposure clipping view",
		phase: "output-encode",
		priority: 1e5,
		space: {
			encoding: "perceptual",
			primaries: "rec709"
		},
		glsl: Xe.trimStart(),
		uniforms: [
			{
				key: "mode",
				glslType: "int",
				default: 0
			},
			{
				key: "high",
				glslType: "float",
				default: 250 / 255
			},
			{
				key: "low",
				glslType: "float",
				default: 5 / 255
			}
		],
		viewOnly: !0,
		presetScope: "per-image"
	};
}
//#endregion
//#region src/index.tsx
var $ = `${l}.panel`;
function Qe(e) {
	ue(e), e.registerProcessingStage(qe()), e.registerProcessingStage(Ye()), e.registerProcessingStage(Ze()), e.registerPanel({
		id: $,
		title: "Advanced Exposure",
		component: Ie,
		defaultDock: {
			module: "develop",
			direction: "right",
			width: 280
		},
		onReset: () => {
			let t = e.stores.useDevelopStore.getState();
			t.setDynParams({
				...ee(),
				...S()
			}), t.commitEdit("Advanced Exposure reset");
		},
		mask: {
			component: Ie,
			owns: h.map(g)
		}
	}), e.registerSettings(he);
}
//#endregion
export { $ as PANEL_ID, Qe as activate };

//# sourceMappingURL=index.js.map