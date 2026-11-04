import { describe, expect, it } from 'vitest';

import {
	DOT_STRIDE,
	HAZE_STRIDE,
	buildGravityField,
	cubicBezier,
	mulberry32,
	packGravityField
} from './gravityField';

describe('mulberry32', () => {
	it('is deterministic for a seed and stays within [0, 1)', () => {
		const first = mulberry32(42);
		const second = mulberry32(42);
		for (let i = 0; i < 100; i += 1) {
			const value = first();
			expect(value).toBe(second());
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThan(1);
		}
	});
});

describe('cubicBezier', () => {
	const curve = [
		[0, 0],
		[0.25, 1],
		[0.75, 1],
		[1, 0]
	] as const;

	it('hits both end points', () => {
		expect(cubicBezier(curve, 0)).toEqual([0, 0]);
		expect(cubicBezier(curve, 1)).toEqual([1, 0]);
	});

	it('is symmetric for a symmetric curve', () => {
		const mid = cubicBezier(curve, 0.5);
		expect(mid[0]).toBeCloseTo(0.5, 6);
		expect(mid[1]).toBeCloseTo(0.75, 6);
	});
});

describe('buildGravityField', () => {
	it('produces identical fields for the same viewport', () => {
		const first = buildGravityField(1440, 900);
		const second = buildGravityField(1440, 900);
		expect(second.dots).toEqual(first.dots);
		expect(second.haze).toEqual(first.haze);
		expect(second.sparkles).toEqual(first.sparkles);
	});

	it('fills the sheets densely without leaving the viewport margin', () => {
		const width = 1440;
		const height = 900;
		const { dots, haze, sparkles } = buildGravityField(width, height);

		expect(dots.length).toBeGreaterThan(8000);
		expect(haze.length).toBeGreaterThan(0);
		expect(sparkles.length).toBeGreaterThan(0);

		for (const dot of dots) {
			expect(dot.x).toBeGreaterThanOrEqual(-8);
			expect(dot.x).toBeLessThanOrEqual(width + 8);
			expect(dot.y).toBeGreaterThanOrEqual(-8);
			expect(dot.y).toBeLessThanOrEqual(height + 8);
			expect(dot.a).toBeGreaterThanOrEqual(0);
			expect(dot.a).toBeLessThanOrEqual(1);
			expect(dot.r).toBeGreaterThan(0);
		}
	});

	it('keeps dots small so they read as points, not blobs', () => {
		const { dots } = buildGravityField(1440, 900);
		expect(Math.max(...dots.map((dot) => dot.r))).toBeLessThan(2);
	});
});

describe('packGravityField', () => {
	it('interleaves sheet dots, then sparkles, then haze', () => {
		const field = buildGravityField(1280, 720);
		const packed = packGravityField(field);

		expect(packed.dotCount).toBe(field.dots.length + field.sparkles.length);
		expect(packed.dots.length).toBe(packed.dotCount * DOT_STRIDE);
		expect(packed.haze.length).toBe(field.haze.length * HAZE_STRIDE);

		const first = field.dots[0];
		expect(Array.from(packed.dots.slice(0, DOT_STRIDE))).toEqual(
			[first.x, first.y, first.r, first.a, first.tone].map(Math.fround)
		);

		const sparkle = field.sparkles[0];
		const sparkleOffset = field.dots.length * DOT_STRIDE;
		expect(packed.dots[sparkleOffset + 4]).toBe(2 + sparkle.tone);
	});
});
