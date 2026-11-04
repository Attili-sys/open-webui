/**
 * WebGL2 renderer for the Gravity backdrop: an animated aurora gradient, soft haze along the dot
 * sheets, and the sheets themselves, which flow slowly and part around the pointer.
 *
 * Everything is drawn into one opaque canvas with additive blending, so dense regions bloom
 * naturally. All motion is computed in the vertex shaders; the CPU only eases the pointer.
 */

import { DOT_STRIDE, HAZE_STRIDE, buildGravityField, packGravityField } from './gravityField';

export type GravityRenderer = {
	resize: (width: number, height: number, dpr: number) => void;
	/** Pointer position in CSS pixels, or null when it leaves the window. */
	setPointer: (x: number, y: number) => void;
	clearPointer: () => void;
	frame: (timeMs: number) => void;
	destroy: () => void;
};

const SHARED = /* glsl */ `
uniform vec2 u_view;
uniform float u_time;
uniform float u_motion;
uniform vec3 u_pointer;

float hash12(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

// Slow, coherent undulation shared by dots and haze so the glow travels with the sheets.
vec2 sheetFlow(vec2 n, float t) {
	return vec2(
		sin(n.y * 4.1 + t * 0.21) * 0.006 + sin(n.x * 7.3 - t * 0.17) * 0.003,
		sin(n.x * 5.2 + n.y * 1.7 + t * 0.27) * 0.013 + cos(n.x * 11.0 - t * 0.33) * 0.004
	) * u_view * u_motion;
}

// Pointer field: pushes points outward with a little swirl. Returns offset (xy) and strength (z).
vec3 pointerField(vec2 p, float radius, float push) {
	vec2 d = p - u_pointer.xy;
	float dist = length(d);
	float f = exp(-(dist * dist) / (radius * radius)) * u_pointer.z;
	vec2 dir = dist > 0.001 ? d / dist : vec2(0.0);
	return vec3((dir * push + vec2(-dir.y, dir.x) * push * 0.35) * f, f);
}

vec4 toClip(vec2 p) {
	vec2 clip = (p / u_view) * 2.0 - 1.0;
	return vec4(clip.x, -clip.y, 0.0, 1.0);
}
`;

const BACKGROUND_VERT = /* glsl */ `#version 300 es
in vec2 a_corner;
void main() {
	gl_Position = vec4(a_corner, 0.0, 1.0);
}
`;

const BACKGROUND_FRAG = /* glsl */ `#version 300 es
precision highp float;
${SHARED}
uniform float u_dpr;
out vec4 o_color;

float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(
		mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
		mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x),
		u.y
	);
}

float fbm(vec2 p) {
	float value = 0.0;
	float amp = 0.5;
	for (int i = 0; i < 4; i++) {
		value += amp * noise(p);
		p = mat2(1.6, 1.2, -1.2, 1.6) * p;
		amp *= 0.5;
	}
	return value;
}

vec3 rgb8(vec3 c) {
	return c / 255.0;
}

// Royal-blue sky that fades into a pale floor. Written as a sum of deltas: a chain of mix() calls
// here is miscompiled by WebKit's Metal backend (the blue channel comes out wrong).
vec3 sky(float y) {
	vec3 c = vec3(5.0, 14.0, 54.0);
	c += (vec3(9.0, 32.0, 108.0) - vec3(5.0, 14.0, 54.0)) * smoothstep(0.0, 0.26, y);
	c += (vec3(19.0, 58.0, 168.0) - vec3(9.0, 32.0, 108.0)) * smoothstep(0.2, 0.52, y);
	c += (vec3(38.0, 94.0, 208.0) - vec3(19.0, 58.0, 168.0)) * smoothstep(0.48, 0.72, y);
	c += (vec3(98.0, 148.0, 232.0) - vec3(38.0, 94.0, 208.0)) * smoothstep(0.7, 0.86, y);
	c += (vec3(192.0, 215.0, 248.0) - vec3(98.0, 148.0, 232.0)) * smoothstep(0.84, 0.95, y);
	c += (vec3(238.0, 244.0, 255.0) - vec3(192.0, 215.0, 248.0)) * smoothstep(0.94, 1.0, y);
	return c / 255.0;
}

float glow(vec2 uv, vec2 center, vec2 size, float aspect) {
	vec2 d = (uv - center) / size;
	d.x *= aspect;
	return exp(-dot(d, d));
}

void main() {
	vec2 frag = vec2(gl_FragCoord.x / u_dpr, u_view.y - gl_FragCoord.y / u_dpr);
	vec2 uv = frag / u_view;
	float aspect = u_view.x / u_view.y;
	float t = u_time * u_motion;

	// Gentle diagonal tilt so the light reads as coming from the upper right.
	vec3 color = sky(clamp(uv.y + (0.5 - uv.x) * 0.05, 0.0, 1.0));

	// Aurora: two layers of slow domain-warped noise, strongest in the blue upper half.
	vec2 q = vec2(uv.x * aspect, uv.y) * 1.4;
	float warp = fbm(q + vec2(t * 0.012, -t * 0.008));
	float aurora = fbm(q * 1.8 + warp * 1.6 - vec2(t * 0.018, t * 0.006));
	float upper = 1.0 - smoothstep(0.55, 0.85, uv.y);
	color += rgb8(vec3(70.0, 130.0, 255.0)) * (aurora - 0.45) * 0.22 * upper;

	// Broad light pools that sit behind the sheets.
	float flicker = 0.92 + 0.08 * sin(t * 0.2);
	color += rgb8(vec3(110.0, 165.0, 255.0)) * 0.22 * glow(uv, vec2(0.86, 0.12), vec2(0.6, 0.32), aspect) * flicker;
	color += rgb8(vec3(100.0, 155.0, 255.0)) * 0.13 * glow(uv, vec2(0.18, 0.62), vec2(0.28, 0.5), aspect);
	color += rgb8(vec3(150.0, 195.0, 255.0)) * 0.07 * glow(uv, vec2(0.55, 0.36), vec2(0.45, 0.26), aspect);
	color += rgb8(vec3(255.0, 255.0, 255.0)) * 0.1 * glow(uv, vec2(0.72, 1.0), vec2(0.6, 0.14), aspect);

	// Deepen the top corners.
	float corner = glow(uv, vec2(0.0, 0.0), vec2(0.7, 0.45), aspect) + glow(uv, vec2(1.0, -0.1), vec2(0.4, 0.3), aspect) * 0.4;
	color *= 1.0 - 0.32 * clamp(corner, 0.0, 1.0);

	// Soft light that follows the pointer.
	vec2 pd = (frag - u_pointer.xy) / 320.0;
	color += rgb8(vec3(120.0, 170.0, 255.0)) * 0.07 * exp(-dot(pd, pd)) * u_pointer.z * upper;

	// Dither away 8-bit banding in the long gradient.
	color += (hash12(gl_FragCoord.xy + fract(u_time) * 97.0) - 0.5) / 255.0 * 1.5;

	o_color = vec4(color, 1.0);
}
`;

const HAZE_VERT = /* glsl */ `#version 300 es
${SHARED}
in vec2 a_corner;
in vec4 a_haze;
out vec2 v_local;
out float v_alpha;
void main() {
	vec2 center = a_haze.xy + sheetFlow(a_haze.xy / u_view, u_time);
	vec3 pf = pointerField(center, 260.0, 30.0);
	center += pf.xy;
	v_local = a_corner;
	v_alpha = a_haze.w * 0.5 * (1.0 + pf.z * 0.6);
	gl_Position = toClip(center + a_corner * a_haze.z);
}
`;

const HAZE_FRAG = /* glsl */ `#version 300 es
precision mediump float;
in vec2 v_local;
in float v_alpha;
out vec4 o_color;
void main() {
	float r = length(v_local);
	float a = r < 0.35 ? mix(0.9, 0.38, r / 0.35) : mix(0.38, 0.0, clamp((r - 0.35) / 0.65, 0.0, 1.0));
	vec3 tint = mix(vec3(0.86, 0.92, 1.0), vec3(0.67, 0.78, 1.0), clamp(r, 0.0, 1.0));
	o_color = vec4(tint * a * v_alpha, 0.0);
}
`;

const DOT_VERT = /* glsl */ `#version 300 es
${SHARED}
uniform float u_dpr;
in vec2 a_pos;
in vec2 a_radiusAlpha;
in float a_kind;
out float v_alpha;
out vec3 v_color;
void main() {
	float h = hash12(a_pos);
	float t = u_time;
	vec2 p = a_pos + sheetFlow(a_pos / u_view, t);
	p += vec2(sin(t * 0.6 + h * 40.0), cos(t * 0.5 + h * 31.0)) * 1.3 * u_motion;

	vec3 pf = pointerField(p, 140.0, 36.0);
	p += pf.xy;

	bool sparkle = a_kind >= 2.0;
	float twinkle = sparkle
		? 0.55 + 0.45 * sin(t * (0.8 + h * 1.6) + h * 60.0)
		: 0.86 + 0.14 * sin(t * (0.5 + h) + h * 50.0);
	twinkle = mix(sparkle ? 0.8 : 1.0, twinkle, u_motion);

	float size = a_radiusAlpha.x * 2.8 * u_dpr * (1.0 + pf.z * 0.4);
	// Points below a pixel vanish; keep them at one pixel and fade instead.
	float fade = clamp(size, 0.0, 1.0);
	gl_PointSize = max(size, 1.0);

	vec3 tone = mod(a_kind, 2.0) > 0.5 ? vec3(0.78, 0.88, 1.0) : vec3(1.0);
	v_color = mix(tone, vec3(1.0), pf.z * 0.6);
	v_alpha = a_radiusAlpha.y * twinkle * fade * (1.0 + pf.z * 0.8);
	gl_Position = toClip(p);
}
`;

const DOT_FRAG = /* glsl */ `#version 300 es
precision mediump float;
in float v_alpha;
in vec3 v_color;
out vec4 o_color;
void main() {
	float r = length(gl_PointCoord - 0.5) * 2.0;
	if (r > 1.0) discard;
	float a = r < 0.4 ? mix(1.0, 0.8, r / 0.4) : mix(0.8, 0.0, (r - 0.4) / 0.6);
	o_color = vec4(v_color * a * v_alpha, 0.0);
}
`;

const compile = (gl: WebGL2RenderingContext, type: number, source: string) => {
	const shader = gl.createShader(type);
	if (!shader) throw new Error('gravity: createShader failed');
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const log = gl.getShaderInfoLog(shader);
		gl.deleteShader(shader);
		throw new Error(`gravity: shader compile failed: ${log}`);
	}
	return shader;
};

const link = (gl: WebGL2RenderingContext, vert: string, frag: string) => {
	const program = gl.createProgram();
	if (!program) throw new Error('gravity: createProgram failed');
	const vs = compile(gl, gl.VERTEX_SHADER, vert);
	const fs = compile(gl, gl.FRAGMENT_SHADER, frag);
	gl.attachShader(program, vs);
	gl.attachShader(program, fs);
	gl.linkProgram(program);
	gl.deleteShader(vs);
	gl.deleteShader(fs);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		throw new Error(`gravity: program link failed: ${gl.getProgramInfoLog(program)}`);
	}
	return program;
};

const QUAD = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);

/**
 * Creates the renderer, or returns null when WebGL2 is unavailable (the CSS gradient behind the
 * canvas remains as the fallback).
 */
export const createGravityRenderer = (
	canvas: HTMLCanvasElement,
	options: { reducedMotion: boolean }
): GravityRenderer | null => {
	const gl = canvas.getContext('webgl2', {
		alpha: false,
		antialias: false,
		depth: false,
		stencil: false,
		premultipliedAlpha: false,
		powerPreference: 'low-power'
	});
	if (!gl) return null;

	let background: WebGLProgram;
	let haze: WebGLProgram;
	let dots: WebGLProgram;
	try {
		background = link(gl, BACKGROUND_VERT, BACKGROUND_FRAG);
		haze = link(gl, HAZE_VERT, HAZE_FRAG);
		dots = link(gl, DOT_VERT, DOT_FRAG);
	} catch (error) {
		console.warn(error);
		return null;
	}

	const quadBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW);

	const backgroundVao = gl.createVertexArray();
	gl.bindVertexArray(backgroundVao);
	const bgCorner = gl.getAttribLocation(background, 'a_corner');
	gl.enableVertexAttribArray(bgCorner);
	gl.vertexAttribPointer(bgCorner, 2, gl.FLOAT, false, 0, 0);

	const hazeBuffer = gl.createBuffer();
	const hazeVao = gl.createVertexArray();
	gl.bindVertexArray(hazeVao);
	gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
	const hazeCorner = gl.getAttribLocation(haze, 'a_corner');
	gl.enableVertexAttribArray(hazeCorner);
	gl.vertexAttribPointer(hazeCorner, 2, gl.FLOAT, false, 0, 0);
	gl.bindBuffer(gl.ARRAY_BUFFER, hazeBuffer);
	const hazeAttr = gl.getAttribLocation(haze, 'a_haze');
	gl.enableVertexAttribArray(hazeAttr);
	gl.vertexAttribPointer(hazeAttr, 4, gl.FLOAT, false, HAZE_STRIDE * 4, 0);
	gl.vertexAttribDivisor(hazeAttr, 1);

	const dotBuffer = gl.createBuffer();
	const dotVao = gl.createVertexArray();
	gl.bindVertexArray(dotVao);
	gl.bindBuffer(gl.ARRAY_BUFFER, dotBuffer);
	const stride = DOT_STRIDE * 4;
	const aPos = gl.getAttribLocation(dots, 'a_pos');
	const aRadiusAlpha = gl.getAttribLocation(dots, 'a_radiusAlpha');
	const aKind = gl.getAttribLocation(dots, 'a_kind');
	gl.enableVertexAttribArray(aPos);
	gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride, 0);
	gl.enableVertexAttribArray(aRadiusAlpha);
	gl.vertexAttribPointer(aRadiusAlpha, 2, gl.FLOAT, false, stride, 8);
	gl.enableVertexAttribArray(aKind);
	gl.vertexAttribPointer(aKind, 1, gl.FLOAT, false, stride, 16);
	gl.bindVertexArray(null);

	const uniforms = (program: WebGLProgram) => ({
		view: gl.getUniformLocation(program, 'u_view'),
		time: gl.getUniformLocation(program, 'u_time'),
		motion: gl.getUniformLocation(program, 'u_motion'),
		pointer: gl.getUniformLocation(program, 'u_pointer'),
		dpr: gl.getUniformLocation(program, 'u_dpr')
	});
	const programs = [
		{ program: background, u: uniforms(background) },
		{ program: haze, u: uniforms(haze) },
		{ program: dots, u: uniforms(dots) }
	];

	const motion = options.reducedMotion ? 0 : 1;
	let view = { width: 1, height: 1, dpr: 1 };
	let dotCount = 0;
	let hazeCount = 0;
	const pointer = { x: 0, y: 0, tx: 0, ty: 0, strength: 0, target: 0, seen: false };

	const resize = (width: number, height: number, dpr: number) => {
		view = { width, height, dpr };
		canvas.width = Math.max(1, Math.round(width * dpr));
		canvas.height = Math.max(1, Math.round(height * dpr));

		const packed = packGravityField(buildGravityField(width, height));
		dotCount = packed.dotCount;
		hazeCount = packed.hazeCount;
		gl.bindBuffer(gl.ARRAY_BUFFER, dotBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, packed.dots, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, hazeBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, packed.haze, gl.STATIC_DRAW);
	};

	const setPointer = (x: number, y: number) => {
		pointer.tx = x;
		pointer.ty = y;
		if (!pointer.seen) {
			pointer.x = x;
			pointer.y = y;
			pointer.seen = true;
		}
		pointer.target = 1;
	};

	const clearPointer = () => {
		pointer.target = 0;
	};

	const frame = (timeMs: number) => {
		pointer.x += (pointer.tx - pointer.x) * 0.14;
		pointer.y += (pointer.ty - pointer.y) * 0.14;
		pointer.strength += (pointer.target - pointer.strength) * 0.06;

		const time = timeMs / 1000;
		gl.viewport(0, 0, canvas.width, canvas.height);

		for (const { program, u } of programs) {
			gl.useProgram(program);
			gl.uniform2f(u.view, view.width, view.height);
			gl.uniform1f(u.time, time);
			gl.uniform1f(u.motion, motion);
			gl.uniform3f(u.pointer, pointer.x, pointer.y, pointer.strength);
			if (u.dpr) gl.uniform1f(u.dpr, view.dpr);
		}

		gl.disable(gl.BLEND);
		gl.useProgram(background);
		gl.bindVertexArray(backgroundVao);
		gl.drawArrays(gl.TRIANGLES, 0, 6);

		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE);

		gl.useProgram(haze);
		gl.bindVertexArray(hazeVao);
		gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, hazeCount);

		gl.useProgram(dots);
		gl.bindVertexArray(dotVao);
		gl.drawArrays(gl.POINTS, 0, dotCount);
		gl.bindVertexArray(null);
	};

	const destroy = () => {
		gl.deleteBuffer(quadBuffer);
		gl.deleteBuffer(hazeBuffer);
		gl.deleteBuffer(dotBuffer);
		gl.deleteVertexArray(backgroundVao);
		gl.deleteVertexArray(hazeVao);
		gl.deleteVertexArray(dotVao);
		gl.deleteProgram(background);
		gl.deleteProgram(haze);
		gl.deleteProgram(dots);
	};

	return { resize, setPointer, clearPointer, frame, destroy };
};
