import { describe, expect, it } from 'vitest';

import {
	FLOW_SEGMENTS,
	LENS_DRAG_LIMIT,
	RIBBONS,
	STRAND_STRIDE,
	buildStrandTemplate,
	buildStrands,
	createLens,
	packRibbonUniforms,
	ribbonLength,
	stepLens,
	type LensState
} from './gravityFlow';

describe('buildStrandTemplate', () => {
	it('emits an (s, side) pair on both sides of every segment boundary', () => {
		const template = buildStrandTemplate(4);
		expect(Array.from(template)).toEqual([
			0, -1, 0, 1, 0.25, -1, 0.25, 1, 0.5, -1, 0.5, 1, 0.75, -1, 0.75, 1, 1, -1, 1, 1
		]);
	});

	it('defaults to the shared segment count', () => {
		expect(buildStrandTemplate().length).toBe((FLOW_SEGMENTS + 1) * 4);
	});
});

describe('buildStrands', () => {
	it('creates hundreds of filaments, deterministically', () => {
		const first = buildStrands();
		const second = buildStrands();
		const expected = RIBBONS.reduce((sum, ribbon) => sum + ribbon.strands, 0);

		expect(first.count).toBe(expected);
		expect(first.count).toBeGreaterThanOrEqual(200);
		expect(first.strands.length).toBe(expected * STRAND_STRIDE);
		expect(Array.from(second.strands)).toEqual(Array.from(first.strands));
	});

	it('keeps across-ribbon positions and gains in range and ribbons in order', () => {
		const { strands, count } = buildStrands();
		let previousRibbon = 0;
		for (let i = 0; i < count; i += 1) {
			const [v, ribbon, seed, gain] = strands.slice(i * STRAND_STRIDE, (i + 1) * STRAND_STRIDE);
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThanOrEqual(1);
			expect(ribbon).toBeGreaterThanOrEqual(previousRibbon);
			expect(seed).toBeGreaterThanOrEqual(0);
			expect(seed).toBeLessThan(1);
			expect(gain).toBeGreaterThan(0.4);
			expect(gain).toBeLessThanOrEqual(1);
			previousRibbon = ribbon;
		}
	});
});

describe('ribbonLength', () => {
	it('measures a straight ribbon exactly and scales with the viewport', () => {
		const straight = {
			...RIBBONS[0],
			a: [
				[0, 0],
				[1 / 3, 0],
				[2 / 3, 0],
				[1, 0]
			],
			b: [
				[0, 0.2],
				[1 / 3, 0.2],
				[2 / 3, 0.2],
				[1, 0.2]
			]
		} as const;

		expect(ribbonLength(straight, 1000, 500)).toBeCloseTo(1000, 6);
		expect(ribbonLength(straight, 2000, 500)).toBeCloseTo(2000, 6);
	});
});

describe('packRibbonUniforms', () => {
	it('lays out control points, shape, flow and look per ribbon', () => {
		const packed = packRibbonUniforms(RIBBONS, 1440, 900);
		const ribbon = RIBBONS[1];

		expect(packed.ctrl.length).toBe(RIBBONS.length * 16);
		expect(Array.from(packed.ctrl.slice(16, 18))).toEqual(ribbon.a[0].map(Math.fround));
		expect(Array.from(packed.ctrl.slice(24, 26))).toEqual(ribbon.b[0].map(Math.fround));
		expect(packed.shape[4]).toBeCloseTo(ribbon.twist, 6);
		expect(packed.flow[4]).toBeCloseTo(ribbon.flowAmp, 6);
		expect(packed.look[7]).toBeCloseTo(ribbonLength(ribbon, 1440, 900), 2);
	});
});

describe('stepLens', () => {
	const run = (state: LensState, target: Parameters<typeof stepLens>[1], seconds: number) => {
		let next = state;
		for (let t = 0; t < seconds; t += 1 / 60) next = stepLens(next, target, 1 / 60);
		return next;
	};

	it('snaps to the first pointer position, then springs towards later ones', () => {
		const first = stepLens(createLens(), { x: 100, y: 200, active: true }, 1 / 60);
		expect(first.x).toBeCloseTo(100, 6);
		expect(first.y).toBeCloseTo(200, 6);

		const moving = stepLens(first, { x: 400, y: 200, active: true }, 1 / 60);
		expect(moving.x).toBeGreaterThan(100);
		expect(moving.x).toBeLessThan(400);
		expect(moving.dragX).toBeGreaterThan(0);
	});

	it('settles on the target with no residual drag', () => {
		const settled = run(createLens(), { x: 300, y: 300, active: true }, 0.1);
		const after = run(settled, { x: 700, y: 120, active: true }, 4);

		expect(after.x).toBeCloseTo(700, 0);
		expect(after.y).toBeCloseTo(120, 0);
		expect(Math.hypot(after.dragX, after.dragY)).toBeLessThan(0.5);
		expect(after.presence).toBeGreaterThan(0.99);
	});

	it('fades presence out when the pointer leaves and caps the drag offset', () => {
		const active = run(createLens(), { x: 0, y: 0, active: true }, 0.1);
		const flung = run(active, { x: 5000, y: 0, active: true }, 0.25);
		expect(Math.hypot(flung.dragX, flung.dragY)).toBeLessThanOrEqual(LENS_DRAG_LIMIT + 1e-4);

		const gone = run(flung, { x: 5000, y: 0, active: false }, 6);
		expect(gone.presence).toBeLessThan(0.01);
	});

	it('ignores negative and oversized time steps', () => {
		const lens = stepLens(createLens(), { x: 10, y: 10, active: true }, 1 / 60);
		expect(stepLens(lens, { x: 500, y: 10, active: true }, -1).x).toBeCloseTo(lens.x, 6);
		const big = stepLens(lens, { x: 500, y: 10, active: true }, 10);
		const capped = stepLens(lens, { x: 500, y: 10, active: true }, 1 / 20);
		expect(big.x).toBeCloseTo(capped.x, 6);
	});
});
