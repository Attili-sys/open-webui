/**
 * Geometry and motion helpers for the Gravity Flow backdrop.
 *
 * The backdrop is a handful of silk "ribbons". Each ribbon spans two cubic Bezier edges (in
 * viewport-normalised coordinates) and is drawn as many fine filaments. The shader twists every
 * ribbon around its centre line, so filaments converge into bright folds where the ribbon turns
 * edge-on, and lets a spring-eased cursor lens bend them. Everything here is pure and testable;
 * `gravityFlowRenderer` uploads it and does the drawing.
 */

export type Point = readonly [number, number];

export type Ribbon = {
	/** Edge A control points, x/y as fractions of the viewport. */
	a: readonly [Point, Point, Point, Point];
	/** Edge B control points. */
	b: readonly [Point, Point, Point, Point];
	strands: number;
	/** Radians of twist along the ribbon, twist drift per second, and phase. */
	twist: number;
	twistSpeed: number;
	twistPhase: number;
	/** How far apart the filaments sit when the ribbon faces the viewer (1 = full edge-to-edge). */
	spread: number;
	/** Coherent undulation of the whole ribbon, as a fraction of its width. */
	flowAmp: number;
	flowFreq: number;
	flowSpeed: number;
	intensity: number;
	/** 0 = smooth filament, 1 = strongly beaded (stippled) filament. */
	bead: number;
	/** 0 = blue filament, 1 = white filament. */
	white: number;
	seed: number;
};

export const RIBBONS: readonly Ribbon[] = [
	// Broad sheet falling from the top-right corner.
	{
		a: [
			[1.12, 0.42],
			[0.9, 0.36],
			[0.76, 0.18],
			[0.84, -0.1]
		],
		b: [
			[1.12, 0.1],
			[1.0, 0.08],
			[0.94, 0.0],
			[1.02, -0.1]
		],
		strands: 56,
		twist: 1.3,
		twistSpeed: 0.02,
		twistPhase: -0.4,
		spread: 1,
		flowAmp: 0.05,
		flowFreq: 0.8,
		flowSpeed: 0.06,
		intensity: 0.85,
		bead: 0.413,
		white: 0.245,
		seed: 3
	},
	// Fainter outer layer behind it, for depth.
	{
		a: [
			[1.12, 0.56],
			[0.86, 0.5],
			[0.68, 0.27],
			[0.7, -0.1]
		],
		b: [
			[1.12, 0.45],
			[0.92, 0.41],
			[0.76, 0.21],
			[0.78, -0.1]
		],
		strands: 20,
		twist: 1.4,
		twistSpeed: -0.015,
		twistPhase: 0.4,
		spread: 1,
		flowAmp: 0.08,
		flowFreq: 0.7,
		flowSpeed: 0.048,
		intensity: 0.4,
		bead: 0.495,
		white: 0.14,
		seed: 59
	},
	// Rising arc up the left edge.
	{
		a: [
			[0.06, 1.1],
			[0.16, 0.74],
			[0.18, 0.42],
			[0.3, 0.02]
		],
		b: [
			[0.3, 1.1],
			[0.36, 0.8],
			[0.33, 0.5],
			[0.44, 0.1]
		],
		strands: 50,
		twist: 2.1,
		twistSpeed: -0.0175,
		twistPhase: 0.2,
		spread: 1,
		flowAmp: 0.06,
		flowFreq: 0.75,
		flowSpeed: 0.054,
		intensity: 0.8,
		bead: 0.33,
		white: 0.21,
		seed: 11
	},
	// Bright wave lifting from the bottom towards the right edge.
	{
		a: [
			[0.34, 1.1],
			[0.58, 0.98],
			[0.84, 0.8],
			[1.12, 0.46]
		],
		b: [
			[0.56, 1.16],
			[0.8, 1.12],
			[1.0, 0.98],
			[1.14, 0.8]
		],
		strands: 60,
		twist: 2.4,
		twistSpeed: 0.0225,
		twistPhase: -0.6,
		spread: 1,
		flowAmp: 0.05,
		flowFreq: 0.9,
		flowSpeed: 0.066,
		intensity: 0.95,
		bead: 0.44,
		white: 0.42,
		seed: 23
	},
	// Low sweep along the bottom-left floor.
	{
		a: [
			[-0.02, 0.76],
			[0.18, 0.88],
			[0.42, 0.93],
			[0.66, 1.08]
		],
		b: [
			[-0.02, 0.96],
			[0.16, 1.04],
			[0.36, 1.08],
			[0.56, 1.14]
		],
		strands: 34,
		twist: 1.8,
		twistSpeed: -0.02,
		twistPhase: 0.5,
		spread: 1,
		flowAmp: 0.06,
		flowFreq: 0.85,
		flowSpeed: 0.06,
		intensity: 0.8,
		bead: 0.303,
		white: 0.245,
		seed: 37
	}
];

/** Line segments per filament. */
export const FLOW_SEGMENTS = 200;

/** Floats per strand instance: across-ribbon position, ribbon index, seed, gain. */
export const STRAND_STRIDE = 4;

/** Small, fast, seeded PRNG so the field is identical on every load. */
export const mulberry32 = (seed: number) => {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

export const cubicBezier = (points: readonly Point[], t: number): Point => {
	const u = 1 - t;
	const [p0, p1, p2, p3] = points;
	const w0 = u * u * u;
	const w1 = 3 * u * u * t;
	const w2 = 3 * u * t * t;
	const w3 = t * t * t;
	return [
		w0 * p0[0] + w1 * p1[0] + w2 * p2[0] + w3 * p3[0],
		w0 * p0[1] + w1 * p1[1] + w2 * p2[1] + w3 * p3[1]
	];
};

/**
 * A triangle-strip template shared by every filament: (s, side) pairs, where s runs 0..1 along
 * the filament and side is -1/+1 across it.
 */
export const buildStrandTemplate = (segments = FLOW_SEGMENTS) => {
	const template = new Float32Array((segments + 1) * 4);
	for (let i = 0; i <= segments; i += 1) {
		const s = i / segments;
		template.set([s, -1, s, 1], i * 4);
	}
	return template;
};

/** Per-filament instance data for every ribbon, deterministic for a given ribbon list. */
export const buildStrands = (ribbons: readonly Ribbon[] = RIBBONS) => {
	const total = ribbons.reduce((sum, ribbon) => sum + ribbon.strands, 0);
	const strands = new Float32Array(total * STRAND_STRIDE);
	let offset = 0;
	ribbons.forEach((ribbon, index) => {
		const rand = mulberry32(ribbon.seed);
		for (let i = 0; i < ribbon.strands; i += 1) {
			const v = (i + 0.5 + (rand() - 0.5) * 0.7) / ribbon.strands;
			strands[offset] = Math.min(1, Math.max(0, v));
			strands[offset + 1] = index;
			strands[offset + 2] = rand();
			strands[offset + 3] = 0.45 + 0.55 * Math.pow(rand(), 0.7);
			offset += STRAND_STRIDE;
		}
	});
	return { strands, count: total };
};

/** Approximate on-screen length (CSS px) of a ribbon's centre line. */
export const ribbonLength = (ribbon: Ribbon, width: number, height: number, steps = 48) => {
	let length = 0;
	let previous: Point | null = null;
	for (let i = 0; i <= steps; i += 1) {
		const t = i / steps;
		const a = cubicBezier(ribbon.a, t);
		const b = cubicBezier(ribbon.b, t);
		const point: Point = [((a[0] + b[0]) / 2) * width, ((a[1] + b[1]) / 2) * height];
		if (previous) length += Math.hypot(point[0] - previous[0], point[1] - previous[1]);
		previous = point;
	}
	return length;
};

/** Flattens ribbon parameters into the uniform arrays the shader reads. */
export const packRibbonUniforms = (ribbons: readonly Ribbon[], width: number, height: number) => {
	const ctrl = new Float32Array(ribbons.length * 16);
	const shape = new Float32Array(ribbons.length * 4);
	const flow = new Float32Array(ribbons.length * 4);
	const look = new Float32Array(ribbons.length * 4);
	ribbons.forEach((ribbon, i) => {
		[...ribbon.a, ...ribbon.b].forEach((point, j) => ctrl.set(point, i * 16 + j * 2));
		shape.set([ribbon.twist, ribbon.twistSpeed, ribbon.twistPhase, ribbon.spread], i * 4);
		flow.set([ribbon.flowAmp, ribbon.flowFreq, ribbon.flowSpeed, ribbon.seed], i * 4);
		look.set(
			[ribbon.intensity, ribbon.bead, ribbon.white, ribbonLength(ribbon, width, height)],
			i * 4
		);
	});
	return { ctrl, shape, flow, look };
};

export type LensState = {
	x: number;
	y: number;
	vx: number;
	vy: number;
	/** 0..1, how strongly the lens currently disturbs the field. */
	presence: number;
	/** Eased velocity offset (CSS px) that drags filaments along with the cursor. */
	dragX: number;
	dragY: number;
	initialised: boolean;
};

export type LensTarget = { x: number; y: number; active: boolean };

export const createLens = (): LensState => ({
	x: 0,
	y: 0,
	vx: 0,
	vy: 0,
	presence: 0,
	dragX: 0,
	dragY: 0,
	initialised: false
});

const LENS_STIFFNESS = 14;
const LENS_DAMPING = 7.5;
const DRAG_GAIN = 0.02;
/** Largest offset (CSS px) the cursor's motion can drag filaments by. */
export const LENS_DRAG_LIMIT = 12;

/**
 * Advances the cursor lens by `dt` seconds: a damped spring follows the pointer, presence fades
 * in and out, and the drag offset eases towards the spring's velocity so the field settles
 * gradually after the cursor stops.
 */
export const stepLens = (state: LensState, target: LensTarget, dt: number): LensState => {
	const step = Math.min(Math.max(dt, 0), 1 / 20);
	const next = { ...state };

	if (target.active && !next.initialised) {
		next.x = target.x;
		next.y = target.y;
		next.initialised = true;
	}

	if (next.initialised) {
		const ax = (target.x - next.x) * LENS_STIFFNESS - next.vx * LENS_DAMPING;
		const ay = (target.y - next.y) * LENS_STIFFNESS - next.vy * LENS_DAMPING;
		next.vx += ax * step;
		next.vy += ay * step;
		next.x += next.vx * step;
		next.y += next.vy * step;
	}

	const presenceRate = target.active ? 1.4 : 0.8;
	next.presence += ((target.active ? 1 : 0) - next.presence) * (1 - Math.exp(-step * presenceRate));

	let wantX = next.vx * DRAG_GAIN;
	let wantY = next.vy * DRAG_GAIN;
	const magnitude = Math.hypot(wantX, wantY);
	if (magnitude > LENS_DRAG_LIMIT) {
		wantX *= LENS_DRAG_LIMIT / magnitude;
		wantY *= LENS_DRAG_LIMIT / magnitude;
	}
	const ease = 1 - Math.exp(-step * 2.5);
	next.dragX += (wantX - next.dragX) * ease;
	next.dragY += (wantY - next.dragY) * ease;

	return next;
};
