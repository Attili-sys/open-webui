/**
 * Procedural dot field for the Gravity theme.
 *
 * The field is a handful of curved "sheets". Each sheet sits between two cubic Bezier edges and is
 * sampled as perspective-spaced rows and columns, so dots bunch up near one edge and along the
 * far end of the curve. Rows ripple across the band, and a seeded generator keeps every render
 * identical. Geometry is built and packed here (pure, testable); `gravityRenderer` draws it.
 */

export type FieldDot = {
	x: number;
	y: number;
	/** Radius in CSS pixels. */
	r: number;
	/** 0..1 */
	a: number;
	/** 0 = white, 1 = pale blue */
	tone: 0 | 1;
};

export type FieldHaze = { x: number; y: number; r: number; a: number };

export type GravityField = {
	dots: FieldDot[];
	haze: FieldHaze[];
	sparkles: FieldDot[];
};

type Point = readonly [number, number];

type Sheet = {
	a: readonly Point[];
	b: readonly Point[];
	rows: number;
	cols: number;
	rowGamma: number;
	colGamma: number;
	ridge: number;
	spread: number;
	density: number;
	waveAmp: number;
	waveFreq: number;
	wavePhase: number;
	hazeCount: number;
	hazeAlpha: number;
	seed: number;
};

const SHEETS: readonly Sheet[] = [
	// Top-right sweep
	{
		a: [
			[0.62, 0.2],
			[0.77, 0.13],
			[0.93, 0.02],
			[1.08, -0.08]
		],
		b: [
			[0.72, 0.32],
			[0.85, 0.23],
			[0.99, 0.12],
			[1.1, 0.04]
		],
		rows: 44,
		cols: 980,
		rowGamma: 1.25,
		colGamma: 0.85,
		ridge: 0.42,
		spread: 0.3,
		density: 0.95,
		waveAmp: 0.05,
		waveFreq: 1.6,
		wavePhase: 5.4,
		hazeCount: 60,
		hazeAlpha: 0.065,
		seed: 7
	},
	// Left arc rising from the lower-left
	{
		a: [
			[0.13, 1.04],
			[0.14, 0.72],
			[0.2, 0.36],
			[0.38, 0.0]
		],
		b: [
			[0.3, 1.04],
			[0.3, 0.74],
			[0.34, 0.44],
			[0.46, 0.1]
		],
		rows: 48,
		cols: 1050,
		rowGamma: 1.5,
		colGamma: 0.9,
		ridge: 0.28,
		spread: 0.28,
		density: 0.9,
		waveAmp: 0.04,
		waveFreq: 1.3,
		wavePhase: 4.2,
		hazeCount: 80,
		hazeAlpha: 0.06,
		seed: 23
	},
	// Bottom-right wave dissolving into the pale floor
	{
		a: [
			[0.4, 1.06],
			[0.62, 0.98],
			[0.84, 0.82],
			[1.08, 0.56]
		],
		b: [
			[0.5, 1.1],
			[0.74, 1.06],
			[0.96, 0.94],
			[1.1, 0.78]
		],
		rows: 52,
		cols: 1100,
		rowGamma: 1.35,
		colGamma: 0.8,
		ridge: 0.36,
		spread: 0.3,
		density: 1,
		waveAmp: 0.075,
		waveFreq: 2.1,
		wavePhase: 6.1,
		hazeCount: 90,
		hazeAlpha: 0.075,
		seed: 41
	},
	// Faint thread above the headline
	{
		a: [
			[0.18, 0.32],
			[0.3, 0.16],
			[0.46, 0.05],
			[0.62, -0.02]
		],
		b: [
			[0.22, 0.37],
			[0.34, 0.21],
			[0.5, 0.09],
			[0.66, 0.02]
		],
		rows: 12,
		cols: 280,
		rowGamma: 1,
		colGamma: 1,
		ridge: 0.5,
		spread: 0.55,
		density: 0.45,
		waveAmp: 0.06,
		waveFreq: 1.2,
		wavePhase: 2.2,
		hazeCount: 0,
		hazeAlpha: 0,
		seed: 59
	}
];

/** Small, fast, seeded PRNG so a given viewport always paints the same field. */
export const mulberry32 = (seed: number) => {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

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

export const buildGravityField = (width: number, height: number): GravityField => {
	const scale = clamp(height / 900, 0.8, 1.45);
	const dots: FieldDot[] = [];
	const haze: FieldHaze[] = [];

	for (const sheet of SHEETS) {
		const rand = mulberry32(sheet.seed);

		for (let row = 0; row < sheet.rows; row += 1) {
			const base = row / (sheet.rows - 1);
			const v = Math.pow(base, sheet.rowGamma);
			const ridgeWeight = Math.exp(-(((v - sheet.ridge) / sheet.spread) ** 2));

			for (let col = 0; col < sheet.cols; col += 1) {
				const s = clamp(
					Math.pow((col + 0.5 + (rand() - 0.5) * 0.45) / sheet.cols, sheet.colGamma),
					0,
					1
				);
				const endFade = Math.pow(Math.sin(Math.PI * s), 0.6);
				const keep = endFade * (0.2 + 0.8 * ridgeWeight) * sheet.density;
				if (rand() > keep) continue;

				const a = cubicBezier(sheet.a, s);
				const b = cubicBezier(sheet.b, s);
				const ripple =
					Math.sin(s * sheet.waveFreq * Math.PI * 2 + v * sheet.wavePhase) *
					sheet.waveAmp *
					(0.35 + v);
				const t = v + ripple + (rand() - 0.5) * 0.004;

				const x = (a[0] + (b[0] - a[0]) * t + (rand() - 0.5) * 0.0008) * width;
				const y = (a[1] + (b[1] - a[1]) * t + (rand() - 0.5) * 0.0008) * height;
				if (x < -8 || x > width + 8 || y < -8 || y > height + 8) continue;

				const brightness = 0.2 + 0.8 * Math.pow(rand(), 1.7);
				dots.push({
					x,
					y,
					r: (0.5 + 1.2 * Math.pow(rand(), 3.2)) * scale,
					a: clamp(brightness * (0.35 + 0.65 * ridgeWeight) * (0.5 + 0.5 * endFade), 0, 1),
					tone: rand() < 0.32 ? 1 : 0
				});
			}
		}

		for (let i = 0; i < sheet.hazeCount; i += 1) {
			const s = (i + 0.5) / sheet.hazeCount;
			const endFade = Math.pow(Math.sin(Math.PI * s), 0.8);
			const a = cubicBezier(sheet.a, s);
			const b = cubicBezier(sheet.b, s);
			const t = sheet.ridge + (rand() - 0.5) * 0.3;
			haze.push({
				x: (a[0] + (b[0] - a[0]) * t) * width,
				y: (a[1] + (b[1] - a[1]) * t) * height,
				r: height * (0.1 + 0.16 * rand()),
				a: sheet.hazeAlpha * endFade
			});
		}
	}

	const sparkleRand = mulberry32(97);
	const sparkles: FieldDot[] = [];
	for (let i = 0; i < 520; i += 1) {
		const x = sparkleRand() * width;
		const y = Math.pow(sparkleRand(), 1.35) * height * 0.82;
		sparkles.push({
			x,
			y,
			r: (0.45 + sparkleRand() * 0.85) * scale,
			a: 0.2 + sparkleRand() * 0.6,
			tone: sparkleRand() < 0.4 ? 1 : 0
		});
	}

	return { dots, haze, sparkles };
};

/** Floats per vertex in {@link packGravityField}'s dot buffer: x, y, radius, alpha, kind. */
export const DOT_STRIDE = 5;

/** Floats per haze record: x, y, radius, alpha. */
export const HAZE_STRIDE = 4;

/**
 * Flattens a field into GPU-ready buffers. Dot `kind` is 0/1 for white/blue sheet dots and 2/3 for
 * white/blue sparkles, which twinkle more strongly.
 */
export const packGravityField = (field: GravityField) => {
	const dotCount = field.dots.length + field.sparkles.length;
	const dots = new Float32Array(dotCount * DOT_STRIDE);
	let offset = 0;
	const push = (dot: FieldDot, kindBase: number) => {
		dots[offset] = dot.x;
		dots[offset + 1] = dot.y;
		dots[offset + 2] = dot.r;
		dots[offset + 3] = dot.a;
		dots[offset + 4] = kindBase + dot.tone;
		offset += DOT_STRIDE;
	};
	for (const dot of field.dots) push(dot, 0);
	for (const dot of field.sparkles) push(dot, 2);

	const haze = new Float32Array(field.haze.length * HAZE_STRIDE);
	field.haze.forEach((spot, index) => {
		haze.set([spot.x, spot.y, spot.r, spot.a], index * HAZE_STRIDE);
	});

	return { dots, dotCount, haze, hazeCount: field.haze.length };
};
