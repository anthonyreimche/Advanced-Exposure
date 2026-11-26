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
function ee(e) {
	let t = { ...o };
	for (let n of p) {
		let i = e[m(n)];
		_(i) && (t[n] = r(i, a[n]));
	}
	return t;
}
var y = (e) => v(e, p, m), te = () => y(o);
function ne(n) {
	let i = { ...t };
	for (let t of h) {
		let a = n[g(t)];
		_(a) && (i[t] = r(a, e[t]));
	}
	return i;
}
var b = (e) => v(e, h, g), x = () => b(t), re = {
	off: 0,
	highlights: 1,
	shadows: 2
};
function ie(e, t) {
	return {
		[`${f}.mode`]: re[e],
		[`${f}.high`]: t.high,
		[`${f}.low`]: t.low
	};
}
//#endregion
//#region src/metering.ts
var ae = 2 ** -14, oe = .35, S = (e) => e.width < 2 && e.height < 2, C = (e, t) => i([
	e.data[4 * t],
	e.data[4 * t + 1],
	e.data[4 * t + 2]
]), w = (e, t) => ({
	x: Math.min(e.width - 1, Math.max(0, Math.floor(t.x * e.width))),
	y: Math.min(e.height - 1, Math.max(0, Math.floor(t.y * e.height)))
});
function T(e, t) {
	if (S(e) || t.x < 0 || t.x > 1 || t.y < 0 || t.y > 1) return null;
	let n = w(e, t), r = Math.max(2, .01 * Math.max(e.width, e.height)), i = Math.floor(r), a = 0, o = 0;
	for (let t = Math.max(0, n.y - i); t <= Math.min(e.height - 1, n.y + i); t++) for (let s = Math.max(0, n.x - i); s <= Math.min(e.width - 1, n.x + i); s++) (s - n.x) ** 2 + (t - n.y) ** 2 > r * r || (a += C(e, t * e.width + s), o++);
	return o > 0 ? a / o : null;
}
function E(e, t) {
	if (S(e)) return null;
	let n = 0, r = 0, i = e.width - 1, a = e.height - 1;
	if (typeof t == "object") {
		let o = w(e, {
			x: Math.min(t.x0, t.x1),
			y: Math.min(t.y0, t.y1)
		}), s = w(e, {
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
				n = Math.exp(-(t * t + r * r) / (2 * oe * oe));
			}
			o += n, s += n * Math.log2(Math.max(C(e, c * e.width + a), ae));
		}
	}
	return o > 0 ? 2 ** (s / o) : null;
}
function D(e, t) {
	return e.sort(), e[Math.min(e.length - 1, Math.max(0, Math.round(t * (e.length - 1))))];
}
function se(e, t) {
	if (S(e)) return null;
	let n = e.width * e.height, r = new Float32Array(n);
	for (let t = 0; t < n; t++) r[t] = Math.max(e.data[4 * t], e.data[4 * t + 1], e.data[4 * t + 2]);
	return D(r, t);
}
function ce(e, t) {
	if (S(e)) return null;
	let n = e.width * e.height, r = new Float32Array(n);
	for (let t = 0; t < n; t++) r[t] = C(e, t);
	return D(r, t);
}
function le(e, t) {
	if (S(e)) return null;
	let n = e.width * e.height, r = 0;
	for (let i = 0; i < n; i++) (e.data[4 * i] >= t || e.data[4 * i + 1] >= t || e.data[4 * i + 2] >= t) && r++;
	return r / n;
}
function ue(e, t) {
	if (S(e)) return null;
	let n = e.width * e.height, r = 0;
	for (let i = 0; i < n; i++) e.data[4 * i] <= t && e.data[4 * i + 1] <= t && e.data[4 * i + 2] <= t && r++;
	return r / n;
}
//#endregion
//#region src/rt.ts
var O, k;
function de(e) {
	k = e, O = e.react;
}
//#endregion
//#region src/settings.ts
var fe = [
	"average",
	"centre",
	"spot",
	"highlights",
	"ettr"
], A = {
	average: "Average",
	centre: "Centre-weighted",
	spot: "Spot weighted",
	highlights: "Highlight priority",
	ettr: "Expose to the right"
}, pe = [
	25,
	50,
	75,
	100
], me = {
	25: "Slight",
	50: "Medium",
	75: "Strong",
	100: "Full"
}, j = {
	min: -4,
	max: 2,
	step: .1
}, M = {
	mode: "meterMode",
	intensity: "intensity",
	target: "meterTarget",
	match: "matchTarget",
	highLevel: "highlightLevel",
	lowLevel: "shadowLevel",
	clipShare: "clipShare",
	ettrPercentile: "ettrPercentile"
}, N = (e, t, n) => {
	let i = k.settings.get(e, t);
	return typeof i == "number" && Number.isFinite(i) ? r(i, n) : t;
};
function P() {
	let e = k.settings.get(M.mode, "average"), t = k.settings.get(M.intensity, 100), n = k.settings.get(M.match, 0);
	return {
		mode: fe.find((t) => t === e) ?? "average",
		intensity: pe.find((e) => e === t) ?? 100,
		target: N(M.target, 0, j),
		match: typeof n == "number" && n > 0 ? n : null,
		high: N(M.highLevel, 250, {
			min: 128,
			max: 255
		}) / 255,
		low: N(M.lowLevel, 5, {
			min: 0,
			max: 127
		}) / 255,
		clip: N(M.clipShare, .1, {
			min: 0,
			max: 5
		}) / 100,
		ettr: N(M.ettrPercentile, 99.5, {
			min: 90,
			max: 100
		}) / 100
	};
}
function he() {
	let [e, t] = O.useState(P);
	return O.useEffect(() => k.settings.onChange(() => t(P())), []), e;
}
var ge = {
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
			key: M.highLevel,
			label: "Highlight warning level",
			hint: "On the 0–255 scale: the clipping view and Auto treat a channel at or above this as clipped. 255 is pure white.",
			type: "number",
			default: 250,
			min: 128,
			max: 255,
			step: 1
		},
		{
			key: M.lowLevel,
			label: "Shadow warning level",
			hint: "On the 0–255 scale: the clipping view and Auto treat a pixel whose channels are all at or below this as crushed.",
			type: "number",
			default: 5,
			min: 0,
			max: 127,
			step: 1
		},
		{
			key: M.clipShare,
			label: "Auto clip share (%)",
			hint: "Shift+double-click on Whites, Blacks or Black level lets this share of the photo reach the warning level.",
			type: "number",
			default: .1,
			min: 0,
			max: 5,
			step: .05
		},
		{
			key: M.ettrPercentile,
			label: "Expose to the right percentile (%)",
			hint: "Expose to the right places this percentile of the photo's brightest channel on the highlight warning level.",
			type: "number",
			default: 99.5,
			min: 90,
			max: 100,
			step: .1
		}
	]
}, F = {
	encoding: "linear",
	primaries: "rec709"
}, _e = {
	encoding: "perceptual",
	primaries: "rec709"
}, I = a.ev, L = {
	tolerance: .01,
	maxSteps: 4,
	range: I
}, R = 8, ve = .995, z = (e) => ({
	kind: "failed",
	reason: e
}), B = "No photo is open.", V = "Couldn't measure the photo: this graphics card has no float render targets.", ye = "The photo changed before the measurement finished.", H = class extends Error {}, U = () => k.stores.useDevelopStore.getState(), W = (e) => `${e >= 0 ? "+" : "−"}${Math.abs(e).toFixed(2)} EV`;
function G() {
	let e = U();
	if (!e.photoId) throw new H(B);
	return {
		photoId: e.photoId,
		params: e.previewParams ?? e.params,
		bag: e.paramBag,
		exposure: ee(e.paramBag)
	};
}
function be(e, t) {
	if (U().photoId !== e.photoId) throw new H(ye);
	if (!t) throw new H(V);
	return t;
}
async function K(e, t, n) {
	let r = {
		...e.bag,
		...y(t),
		...n === "scene" ? x() : {}
	};
	return be(e, await k.develop.renderPhotoFloatFrame(e.photoId, e.params, {
		point: n === "scene" ? "scene" : "pre-output",
		space: n === "scene" ? F : _e,
		paramBag: r
	}));
}
async function q(e, t) {
	return be(e, await k.develop.captureFloatFrame(e.params, {
		point: "scene",
		space: F,
		paramBag: {
			...y(t),
			...x()
		}
	}));
}
var J = (e) => {
	if (e === null) throw new H(V);
	return e;
};
async function Y(e) {
	try {
		return await e();
	} catch (e) {
		return e instanceof H ? z(e.message) : (console.warn("[advanced-exposure] measurement failed:", e), z("The measurement failed; see the console."));
	}
}
function X(e, t, n) {
	if (U().photoId !== e.photoId) throw new H(ye);
	U().setDynParams(t), U().commitEdit(`Advanced Exposure ${n}`);
}
var Z = (e) => Number((Math.round(e * 100) / 100).toFixed(2));
function xe(e, t, n, i) {
	let a = e.exposure.ev, o = r(Z(a + n.intensity / 100 * (t - a)), I);
	return X(e, y({ ev: o }), i), {
		kind: "done",
		status: `Exposure ${W(o)}`
	};
}
function Se(e, t) {
	return Y(async () => {
		let r = G(), i = r.exposure.ev, a = `auto (${A[e.mode]})`;
		if (e.mode === "highlights" || e.mode === "ettr") {
			let t = e.mode === "highlights" ? ve : e.ettr, n = async (e) => J(se(await K(r, { ev: e }, "output"), t));
			if (e.mode === "highlights" && await n(i) <= e.high) return z("No highlights reach the warning level.");
			let o = Math.max(I.min, i - 5), s = e.mode === "highlights" ? i : Math.min(I.max, i + 5), l = e.mode === "highlights" ? 7 : R;
			return xe(r, await c(n, {
				lo: o,
				hi: s,
				limit: e.high,
				steps: l
			}), e, a);
		}
		let o = e.mode, { ev: l } = await s(async (e) => {
			if (o !== "spot") return J(E(await K(r, { ev: e }, "scene"), o));
			if (!t) throw new H("Drag a rectangle on the image, or click a spot, to meter.");
			let n = await q(r, { ev: e });
			return J("x0" in t ? E(n, t) : T(n, t));
		}, i, n * 2 ** e.target, L);
		return xe(r, l, e, a);
	});
}
function Ce(e) {
	return Y(async () => {
		let t = G(), n = Math.floor(await c(async (n) => J(le(await K(t, { whites: n }, "output"), e.high)), {
			lo: -100,
			hi: 100,
			limit: e.clip,
			steps: R
		}));
		return X(t, y({ whites: n }), "auto whites"), {
			kind: "done",
			status: `Whites ${n}`
		};
	});
}
function we(e) {
	return Y(async () => {
		let t = G(), n = Math.ceil(await c(async (n) => J(ue(await K(t, { blacks: n }, "output"), e.low)), {
			lo: -100,
			hi: 100,
			limit: e.clip,
			steps: R,
			falling: !0
		}));
		return X(t, y({ blacks: n }), "auto blacks"), {
			kind: "done",
			status: `Blacks ${n}`
		};
	});
}
function Te(t) {
	return Y(async () => {
		let n = G(), i = r(J(ce(await K(n, {}, "scene"), t.clip)) * 100, e.black);
		return X(n, b({ black: i }), "auto black level"), {
			kind: "done",
			status: `Black level ${i.toFixed(2)} %`
		};
	});
}
async function Ee(e, t) {
	let n = await k.develop.captureFrame(t, { paramBag: x() }), { width: r, height: i } = n;
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
		let t = G(), r = await Ee(e, t.params), i = J(T(await q(t, {}), r));
		if (!(i > 0)) throw new H("The spot is black: there is nothing to match.");
		return k.settings.set(M.match, i), {
			kind: "done",
			status: `Measured ${W(Math.log2(i / n))} from middle grey`
		};
	});
}
function Oe(e, t) {
	return Y(async () => {
		if (t.match === null) throw new H("Measure a spot on a reference photo first.");
		let n = G(), r = await Ee(e, n.params), { ev: i } = await s(async (e) => J(T(await q(n, { ev: e }), r)), n.exposure.ev, t.match, L), a = Z(i);
		return X(n, y({ ev: a }), "match"), {
			kind: "done",
			status: `Exposure ${W(a)}`
		};
	});
}
function ke(e, t = k.stores.useCatalogStore.getState().photos) {
	if (!e) return null;
	let n = t.find((t) => t.id === e)?.exif.exposureCompensation;
	return typeof n == "number" && Number.isFinite(n) && n !== 0 ? n : null;
}
function Ae() {
	let e = U();
	if (!e.photoId) return z(B);
	let t = ke(e.photoId);
	if (t === null) return z("The camera recorded no exposure compensation.");
	let n = r(Z(-t), I);
	return e.setDynParams(y({ ev: n })), e.commitEdit("Advanced Exposure undo camera compensation"), {
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
	let t = O.useRef(!1);
	return O.useEffect(() => () => {
		t.current && k.develop.setViewValues(null);
	}, []), (n) => n && ((r) => {
		t.current = r, k.develop.setViewValues(r ? ie(n, e) : null);
	});
}
function Ie() {
	let e = k.develop.useParamScope();
	return /* @__PURE__ */ O.createElement("div", { style: { padding: 8 } }, e.maskId === null ? /* @__PURE__ */ O.createElement(Re, { scope: e }) : /* @__PURE__ */ O.createElement(Le, { scope: e }));
}
function Le({ scope: n, preview: r, onAutoBlack: i }) {
	let { Slider: a } = k.components, o = ne(n.getParams());
	return /* @__PURE__ */ O.createElement(O.Fragment, null, Ne.map(({ key: s, label: c }) => /* @__PURE__ */ O.createElement(a, {
		key: s,
		label: c,
		value: o[s],
		min: e[s].min,
		max: e[s].max,
		step: e[s].step,
		defaultValue: t[s],
		onChange: (e) => n.setParams(b({ [s]: e })),
		onCommit: () => n.commit(`Advanced Exposure ${c.toLowerCase()}`),
		onModifierPreview: r?.(Pe[s]),
		onAuto: s === "black" ? i : void 0
	})));
}
function Re({ scope: e }) {
	let { AutoButton: t, Slider: n } = k.components, { Section: r, tokens: i } = k.ui, s = he(), c = k.stores.useDevelopStore((e) => e.photoId !== null), l = ee(e.getParams()), [u, d] = O.useState(""), f = Fe(s), p = k.develop.useCanvasToolHeld();
	O.useEffect(() => {
		p || He();
	}, [p]);
	let m = O.useCallback((e) => d(e.kind === "done" ? e.status : e.reason), []), h = O.useCallback((e) => {
		d("Measuring…"), e().then(m);
	}, [m]), g = () => {
		let e = P();
		e.mode === "spot" ? (Ve((e) => h(() => Se(P(), e)), () => d("")), d("Drag a rectangle on the image, or click a spot. Esc cancels.")) : h(() => Se(e));
	}, _ = {
		ev: g,
		whites: () => h(() => Ce(P())),
		blacks: () => h(() => we(P()))
	}, v = (t, r, i = r.toLowerCase(), s) => /* @__PURE__ */ O.createElement(n, {
		key: t,
		icon: s,
		label: r,
		value: l[t],
		min: a[t].min,
		max: a[t].max,
		step: a[t].step,
		defaultValue: o[t],
		onChange: (n) => e.setParams(y({ [t]: n })),
		onCommit: () => e.commit(`Advanced Exposure ${i}`),
		onModifierPreview: f(Pe[t]),
		onAuto: _[t]
	});
	return /* @__PURE__ */ O.createElement(O.Fragment, null, /* @__PURE__ */ O.createElement(t, {
		title: `Auto exposure (${A[s.mode]})`,
		disabled: !c,
		onClick: g
	}), je.map(({ key: e, label: t }) => v(e, t, t.toLowerCase(), `core.${e === "ev" ? "exposure" : e}`)), /* @__PURE__ */ O.createElement(r, { title: "Highlight compression" }, Me.map(({ key: e, label: t, commit: n }) => v(e, t, n))), /* @__PURE__ */ O.createElement(Le, {
		scope: e,
		preview: f,
		onAutoBlack: () => h(() => Te(P()))
	}), /* @__PURE__ */ O.createElement(ze, { prefs: s }), /* @__PURE__ */ O.createElement(Be, {
		report: m,
		measuring: h
	}), /* @__PURE__ */ O.createElement("div", {
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
	let { Slider: t } = k.components, { Section: n, Select: r, SegmentedControl: i, Stack: a } = k.ui, [o, s] = O.useState(null);
	return /* @__PURE__ */ O.createElement(n, { title: "Metering" }, /* @__PURE__ */ O.createElement(a, { gap: 6 }, /* @__PURE__ */ O.createElement(r, {
		ariaLabel: "Meter mode",
		value: e.mode,
		options: fe.map((e) => ({
			value: e,
			label: A[e]
		})),
		onChange: (e) => k.settings.set(M.mode, e)
	}), /* @__PURE__ */ O.createElement(i, {
		size: "sm",
		value: String(e.intensity),
		options: pe.map((e) => ({
			value: String(e),
			label: me[e],
			title: `${e} % of the metered change`
		})),
		onChange: (e) => k.settings.set(M.intensity, Number(e))
	}), /* @__PURE__ */ O.createElement(t, {
		label: "Target",
		value: o ?? e.target,
		min: j.min,
		max: j.max,
		step: j.step,
		defaultValue: 0,
		onChange: s,
		onCommit: () => {
			o !== null && k.settings.set(M.target, o), s(null);
		}
	})));
}
function Be({ report: e, measuring: t }) {
	let { Button: n, Row: r, Section: i } = k.ui, a = k.stores.useDevelopStore((e) => e.photoId), o = ke(a, k.stores.useCatalogStore((e) => e.photos)), s = k.develop.usePickDragHeld(), [c, l] = O.useState(null);
	O.useEffect(() => {
		s || l(null);
	}, [s]), O.useEffect(() => c ? (k.develop.setPickDrag({ onPress: (e) => {
		l(null), t(() => c === "measure" ? De(e) : Oe(e, P()));
	} }), () => k.develop.setPickDrag(null)) : void 0, [c, t]);
	let u = (e, t, r) => /* @__PURE__ */ O.createElement(n, {
		size: "sm",
		active: c === e,
		"aria-pressed": c === e,
		title: `${r} (Esc cancels)`,
		disabled: !a,
		onClick: () => l(c === e ? null : e)
	}, t);
	return /* @__PURE__ */ O.createElement(i, { title: "Series" }, /* @__PURE__ */ O.createElement(r, {
		gap: 6,
		wrap: !0
	}, /* @__PURE__ */ O.createElement(n, {
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
	}, k.develop.setCanvasTool({
		overlay: We,
		zoomable: !0,
		onEscape: He
	});
}
function He() {
	Q?.cancel(), Q = null;
}
var Ue = 4;
function We({ rect: e }) {
	let { tokens: t } = k.ui, [n, r] = O.useState(null), i = (t) => {
		let n = k.develop.framePoint(t.currentTarget, t.clientX, t.clientY);
		return {
			x: (n.x - e.x) / e.w,
			y: (n.y - e.y) / e.h
		};
	}, a = (e) => {
		if (!n) return;
		let t = i(e), a = Math.hypot(e.clientX - n.startX, e.clientY - n.startY) >= Ue ? {
			x0: n.from.x,
			y0: n.from.y,
			x1: t.x,
			y1: t.y
		} : n.from;
		r(null);
		let o = Q;
		Q = null, k.develop.setCanvasTool(null), o?.pick(a);
	}, o = n && {
		left: e.x + Math.min(n.from.x, n.to.x) * e.w,
		top: e.y + Math.min(n.from.y, n.to.y) * e.h,
		width: Math.abs(n.to.x - n.from.x) * e.w,
		height: Math.abs(n.to.y - n.from.y) * e.h
	};
	return /* @__PURE__ */ O.createElement("div", {
		"data-testid": "spot-surface",
		style: {
			position: "absolute",
			inset: 0,
			cursor: k.cursors.resolve("pick"),
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
	}, o && /* @__PURE__ */ O.createElement("div", { style: {
		position: "absolute",
		...o,
		border: `1px solid ${t.accent}`,
		pointerEvents: "none"
	} }));
}
//#endregion
//#region src/stage.ts
var Ge = "\nfloat aeToneStops(float e0, float kc, float ks, float kh, float kw, float kb) {\n  float e = e0 * (1.0 + 0.5 * kc);\n  e += 1.5 * ks * (1.0 - smoothstep(-4.5, 0.0, e));\n  e += 1.5 * kh * smoothstep(-1.0, 2.5, e);\n  e += kw * smoothstep(1.5, 3.5, e);\n  e += kb * (1.0 - smoothstep(-8.0, -3.5, e));\n  return e;\n}\n", Ke = "\nif (ev != 0.0 || contrast != 0.0 || highlights != 0.0 || shadows != 0.0 || whites != 0.0 || blacks != 0.0 || compression != 0.0) {\n  float aeGain = exp2(clamp(ev, -5.0, 5.0));\n  float aeL = dot(lin, vec3(0.2126, 0.7152, 0.0722));\n  bool aeShaped = contrast != 0.0 || highlights != 0.0 || shadows != 0.0 || whites != 0.0 || blacks != 0.0;\n  if (aeShaped && aeL > 0.0) {\n    float aeStops = log2(aeL * aeGain / 0.18);\n    aeGain = 0.18 * exp2(aeToneStops(aeStops,\n      clamp(contrast, -100.0, 100.0) / 100.0, clamp(shadows, -100.0, 100.0) / 100.0,\n      clamp(highlights, -100.0, 100.0) / 100.0, clamp(whites, -100.0, 100.0) / 100.0,\n      clamp(blacks, -100.0, 100.0) / 100.0)) / aeL;\n  }\n  lin *= aeGain;\n  float aeAmount = clamp(compression, 0.0, 100.0) / 100.0;\n  float aeKnee = clamp(threshold, 50.0, 95.0) / 100.0;\n  float aePeak = max(max(lin.r, lin.g), lin.b);\n  if (aeAmount > 0.0 && aePeak > aeKnee) {\n    float aeRoom = 1.0 - aeKnee;\n    float aeOver = aePeak - aeKnee;\n    lin *= mix(1.0, (aeKnee + aeRoom * aeOver / (aeOver + aeRoom)) / aePeak, aeAmount);\n  }\n}", qe = {
	ev: "Exposure",
	contrast: "Contrast",
	highlights: "Highlights",
	shadows: "Shadows",
	whites: "Whites",
	blacks: "Blacks",
	compression: "Highlight compression",
	threshold: "Compression threshold"
};
function Je() {
	return {
		id: u,
		name: "Advanced Exposure",
		phase: "scene-linear",
		priority: 10,
		anchor: "tone",
		glsl: Ke.trimStart(),
		helpers: Ge,
		uniforms: p.map((e) => ({
			key: e,
			glslType: "float",
			default: o[e],
			range: a[e],
			label: qe[e]
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
var Ye = "\nif (black != 0.0 || midtones != 0.0) {\n  float aeFloor = clamp(black, -2.0, 5.0) / 100.0;\n  lin = (lin - vec3(aeFloor)) * (1.0 / (1.0 - aeFloor));\n  float aeStops = clamp(midtones, -2.0, 2.0);\n  float aeY = dot(lin, vec3(0.2126, 0.7152, 0.0722));\n  if (aeStops != 0.0 && aeY > 0.0) {\n    float aeGamma = log(0.18 * exp2(aeStops)) / log(0.18);\n    lin *= pow(aeY, aeGamma) / aeY;\n  }\n}";
function Xe() {
	return {
		id: d,
		name: "Advanced Exposure black level and midtones",
		phase: "scene-linear",
		priority: 10,
		glsl: Ye.trimStart(),
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
var Ze = "\nif (mode == 1) c = step(vec3(high), c);\nelse if (mode == 2) c = vec3(1.0) - step(c, vec3(low));";
function Qe() {
	return {
		id: f,
		name: "Advanced Exposure clipping view",
		phase: "output-encode",
		priority: 1e5,
		space: {
			encoding: "perceptual",
			primaries: "rec709"
		},
		glsl: Ze.trimStart(),
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
function $e(e) {
	de(e), e.registerProcessingStage(Je()), e.registerProcessingStage(Xe()), e.registerProcessingStage(Qe()), e.registerPanel({
		id: $,
		title: "Advanced Exposure",
		component: Ie,
		defaultDock: {
			module: "develop",
			direction: "right",
			width: 280
		},
		modules: ["develop"],
		onReset: () => {
			let t = e.stores.useDevelopStore.getState();
			t.setDynParams({
				...te(),
				...x()
			}), t.commitEdit("Advanced Exposure reset");
		},
		mask: {
			component: Ie,
			owns: h.map(g)
		}
	}), e.registerSettings(ge);
}
//#endregion
export { $ as PANEL_ID, $e as activate };

//# sourceMappingURL=index.js.map