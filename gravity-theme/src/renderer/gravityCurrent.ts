/**
 * Geometry for the Gravity Field backdrop.
 *
 * A small network of broad Bezier streams wraps around the calm centre stage. Hairline filaments,
 * path-bound micro-particles, travelling highlights and low-alpha haze all share these trajectories,
 * so the result reads as one electromagnetic field rather than disconnected effects.
 */

export type Point = readonly [number, number];

export type CurrentPath = {
	ctrl: readonly [Point, Point, Point, Point];
	width: number;
	flowAmp: number;
	flowFreq: number;
	flowSpeed: number;
	intensity: number;
	white: number;
	filaments: number;
	particles: number;
	haze: number;
	seed: number;
};

export const CURRENT_PATHS: readonly CurrentPath[] = [
	// Main left-to-right sweep beneath the interface.
	{
		ctrl: [
			[-0.1, 0.58],
			[0.2, 0.82],
			[0.64, 0.82],
			[1.1, 0.5]
		],
		width: 0.22,
		flowAmp: 0.018,
		flowFreq: 1.1,
		flowSpeed: 0.018,
		intensity: 0.8,
		white: 0.48,
		filaments: 22,
		particles: 5200,
		haze: 36,
		seed: 7
	},
	// Lower companion stream; overlaps the main sweep into a luminous floor.
	{
		ctrl: [
			[-0.08, 0.78],
			[0.24, 1.03],
			[0.7, 0.98],
			[1.1, 0.67]
		],
		width: 0.2,
		flowAmp: 0.015,
		flowFreq: 1.35,
		flowSpeed: 0.014,
		intensity: 0.95,
		white: 0.72,
		filaments: 26,
		particles: 6800,
		haze: 48,
		seed: 19
	},
	// Left arc rises into the top sweep, visually connecting both sides of the field.
	{
		ctrl: [
			[0.03, 0.88],
			[0.08, 0.48],
			[0.2, 0.15],
			[0.48, -0.04]
		],
		width: 0.15,
		flowAmp: 0.02,
		flowFreq: 0.9,
		flowSpeed: 0.012,
		intensity: 0.62,
		white: 0.3,
		filaments: 16,
		particles: 3900,
		haze: 24,
		seed: 31
	},
	// Faint top canopy continues the left arc towards the upper-right.
	{
		ctrl: [
			[0.22, 0.1],
			[0.5, -0.09],
			[0.78, -0.01],
			[1.08, 0.17]
		],
		width: 0.1,
		flowAmp: 0.022,
		flowFreq: 0.8,
		flowSpeed: 0.01,
		intensity: 0.34,
		white: 0.22,
		filaments: 10,
		particles: 2600,
		haze: 12,
		seed: 43
	},
	// Right return curve bends back down into the main lower sweep.
	{
		ctrl: [
			[1.05, 0.0],
			[0.86, 0.2],
			[0.9, 0.42],
			[1.08, 0.59]
		],
		width: 0.13,
		flowAmp: 0.019,
		flowFreq: 1.05,
		flowSpeed: 0.013,
		intensity: 0.58,
		white: 0.34,
		filaments: 16,
		particles: 3600,
		haze: 22,
		seed: 59
	},
	// Intricate lower-centre fold where the reference is brightest.
	{
		ctrl: [
			[0.08, 0.94],
			[0.34, 0.78],
			[0.58, 0.9],
			[0.86, 1.08]
		],
		width: 0.1,
		flowAmp: 0.013,
		flowFreq: 1.6,
		flowSpeed: 0.02,
		intensity: 1,
		white: 0.82,
		filaments: 22,
		particles: 6500,
		haze: 40,
		seed: 71
	}
];

export const CURRENT_SEGMENTS = 180;
export const FILAMENT_STRIDE = 6;
export const PARTICLE_STRIDE = 7;
export const MAX_CURRENT_PATHS = 8;

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
	return [
		u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
		u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]
	];
};

/** Shared triangle-strip template: (distance along path, extrusion side). */
export const buildCurrentTemplate = (segments = CURRENT_SEGMENTS) => {
	const template = new Float32Array((segments + 1) * 4);
	for (let i = 0; i <= segments; i += 1) {
		const s = i / segments;
		template.set([s, -1, s, 1], i * 4);
	}
	return template;
};

/**
 * Per-filament data: path, offset, seed, core width, opacity and white mix.
 * Offsets are jittered rather than evenly spaced, avoiding rigid parallel bands.
 */
export const buildCurrentFilaments = (paths: readonly CurrentPath[] = CURRENT_PATHS) => {
	const count = paths.reduce((sum, path) => sum + path.filaments, 0);
	const filaments = new Float32Array(count * FILAMENT_STRIDE);
	let offset = 0;

	paths.forEach((path, pathIndex) => {
		const rand = mulberry32(path.seed);
		for (let i = 0; i < path.filaments; i += 1) {
			const across = ((i + 0.5 + (rand() - 0.5) * 0.9) / path.filaments) * 2 - 1;
			filaments.set(
				[
					pathIndex,
					Math.max(-1, Math.min(1, across)),
					rand(),
					0.3 + Math.pow(rand(), 2.2) * 0.55,
					0.24 + Math.pow(rand(), 0.85) * 0.5,
					Math.max(0, Math.min(1, path.white + (rand() - 0.5) * 0.22))
				],
				offset
			);
			offset += FILAMENT_STRIDE;
		}
	});

	return { filaments, count };
};

/**
 * Per-particle data: path, initial progress, offset, seed, size, opacity and kind.
 * Kind 0 is a micro-particle, 1 a rare travelling highlight, and 2 a soft path-bound haze mote.
 */
export const buildCurrentParticles = (paths: readonly CurrentPath[] = CURRENT_PATHS) => {
	const count = paths.reduce((sum, path) => sum + path.particles + path.haze, 0);
	const particles = new Float32Array(count * PARTICLE_STRIDE);
	let offset = 0;

	paths.forEach((path, pathIndex) => {
		const rand = mulberry32(path.seed * 101 + 17);
		const laneCount = Math.max(20, Math.round(Math.sqrt(path.particles) * 0.5));
		for (let i = 0; i < path.particles; i += 1) {
			const highlight = rand() > 0.982;
			const lane = Math.floor(rand() * laneCount);
			const across = ((lane + 0.5) / laneCount) * 2 - 1 + (rand() - 0.5) * (1.2 / laneCount);
			particles.set(
				[
					pathIndex,
					rand(),
					across,
					rand(),
					highlight ? 1.25 + rand() * 1.5 : 0.42 + Math.pow(rand(), 2.2) * 1.05,
					highlight ? 0.62 + rand() * 0.34 : 0.15 + Math.pow(rand(), 1.5) * 0.52,
					highlight ? 1 : 0
				],
				offset
			);
			offset += PARTICLE_STRIDE;
		}

		for (let i = 0; i < path.haze; i += 1) {
			particles.set(
				[
					pathIndex,
					(i + 0.5 + (rand() - 0.5) * 0.6) / path.haze,
					(rand() * 2 - 1) * 0.7,
					rand(),
					24 + rand() * 44,
					0.01 + rand() * 0.016,
					2
				],
				offset
			);
			offset += PARTICLE_STRIDE;
		}
	});

	return { particles, count };
};

export const packCurrentUniforms = (paths: readonly CurrentPath[] = CURRENT_PATHS) => {
	if (paths.length > MAX_CURRENT_PATHS) {
		throw new Error(`Gravity Field supports at most ${MAX_CURRENT_PATHS} paths`);
	}

	const control = new Float32Array(MAX_CURRENT_PATHS * 8);
	const motion = new Float32Array(MAX_CURRENT_PATHS * 4);
	const look = new Float32Array(MAX_CURRENT_PATHS * 4);
	paths.forEach((path, index) => {
		path.ctrl.forEach((point, pointIndex) => control.set(point, index * 8 + pointIndex * 2));
		motion.set([path.width, path.flowAmp, path.flowFreq, path.flowSpeed], index * 4);
		look.set([path.intensity, path.white, path.seed, 0], index * 4);
	});
	return { control, motion, look };
};
