import { describe, expect, it } from 'vitest';

import {
	CURRENT_PATHS,
	CURRENT_SEGMENTS,
	FILAMENT_STRIDE,
	MAX_CURRENT_PATHS,
	PARTICLE_STRIDE,
	buildCurrentFilaments,
	buildCurrentParticles,
	buildCurrentTemplate,
	cubicBezier,
	packCurrentUniforms
} from './gravityCurrent';

describe('buildCurrentTemplate', () => {
	it('emits both extrusion sides at every segment boundary', () => {
		expect(Array.from(buildCurrentTemplate(2))).toEqual([
			0, -1, 0, 1, 0.5, -1, 0.5, 1, 1, -1, 1, 1
		]);
		expect(buildCurrentTemplate().length).toBe((CURRENT_SEGMENTS + 1) * 4);
	});
});

describe('buildCurrentFilaments', () => {
	it('builds deterministic, irregular hairlines for every path', () => {
		const first = buildCurrentFilaments();
		const second = buildCurrentFilaments();
		const expected = CURRENT_PATHS.reduce((sum, path) => sum + path.filaments, 0);

		expect(first.count).toBe(expected);
		expect(first.count).toBeGreaterThan(40);
		expect(first.filaments.length).toBe(expected * FILAMENT_STRIDE);
		expect(Array.from(second.filaments)).toEqual(Array.from(first.filaments));
	});

	it('keeps offsets, widths, opacity and colour mix in range', () => {
		const { filaments, count } = buildCurrentFilaments();
		for (let i = 0; i < count; i += 1) {
			const [, offset, seed, width, opacity, white] = filaments.slice(
				i * FILAMENT_STRIDE,
				(i + 1) * FILAMENT_STRIDE
			);
			expect(offset).toBeGreaterThanOrEqual(-1);
			expect(offset).toBeLessThanOrEqual(1);
			expect(seed).toBeGreaterThanOrEqual(0);
			expect(seed).toBeLessThan(1);
			expect(width).toBeGreaterThan(0);
			expect(width).toBeLessThan(1);
			expect(opacity).toBeGreaterThan(0);
			expect(opacity).toBeLessThanOrEqual(1);
			expect(white).toBeGreaterThanOrEqual(0);
			expect(white).toBeLessThanOrEqual(1);
		}
	});
});

describe('buildCurrentParticles', () => {
	it('builds thousands of deterministic path-bound particles', () => {
		const first = buildCurrentParticles();
		const second = buildCurrentParticles();
		const expected = CURRENT_PATHS.reduce((sum, path) => sum + path.particles + path.haze, 0);

		expect(first.count).toBe(expected);
		expect(first.count).toBeGreaterThan(20_000);
		expect(first.particles.length).toBe(expected * PARTICLE_STRIDE);
		expect(Array.from(second.particles)).toEqual(Array.from(first.particles));
	});

	it('uses only micro-particle, highlight and haze kinds', () => {
		const { particles, count } = buildCurrentParticles();
		const kinds = new Set<number>();
		for (let i = 0; i < count; i += 1) {
			kinds.add(particles[i * PARTICLE_STRIDE + 6]);
		}
		expect([...kinds].sort()).toEqual([0, 1, 2]);
	});
});

describe('packCurrentUniforms', () => {
	it('packs each curve and pads unused uniform slots', () => {
		const packed = packCurrentUniforms();
		expect(packed.control.length).toBe(MAX_CURRENT_PATHS * 8);
		expect(packed.motion.length).toBe(MAX_CURRENT_PATHS * 4);
		expect(packed.look.length).toBe(MAX_CURRENT_PATHS * 4);
		expect(Array.from(packed.control.slice(0, 2))).toEqual(
			CURRENT_PATHS[0].ctrl[0].map(Math.fround)
		);
		expect(packed.motion[0]).toBeCloseTo(CURRENT_PATHS[0].width, 6);
		expect(packed.look[0]).toBeCloseTo(CURRENT_PATHS[0].intensity, 6);
		expect(Array.from(packed.control.slice(CURRENT_PATHS.length * 8))).toEqual(
			new Array((MAX_CURRENT_PATHS - CURRENT_PATHS.length) * 8).fill(0)
		);
	});

	it('rejects more paths than the shader uniform contract supports', () => {
		const tooMany = new Array(MAX_CURRENT_PATHS + 1).fill(CURRENT_PATHS[0]);
		expect(() => packCurrentUniforms(tooMany)).toThrow(/at most/);
	});
});

describe('cubicBezier', () => {
	it('hits both curve endpoints', () => {
		const curve = CURRENT_PATHS[0].ctrl;
		expect(cubicBezier(curve, 0)).toEqual(curve[0]);
		expect(cubicBezier(curve, 1)).toEqual(curve[3]);
	});
});
