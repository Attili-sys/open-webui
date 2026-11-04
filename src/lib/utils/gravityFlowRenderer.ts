/**
 * WebGL2 renderer for the Gravity Flow backdrop: an atmospheric blue-to-white sky and a few hundred
 * hair-fine filaments arranged in twisting silk ribbons, with highlights travelling along them and
 * a spring-eased cursor lens that bends the field.
 *
 * Filaments are instanced triangle strips. The vertex shader evaluates each ribbon's Bezier edges,
 * twist and undulation, applies the lens, and extrudes a few pixels either side so the fragment
 * shader can draw an anti-aliased core with a faint glow. Blending is additive, so folds where
 * filaments converge bloom on their own.
 */

import {
	FLOW_SEGMENTS,
	RIBBONS,
	STRAND_STRIDE,
	buildStrandTemplate,
	buildStrands,
	createLens,
	packRibbonUniforms,
	stepLens,
	type LensState
} from './gravityFlow';

export type GravityFlowRenderer = {
	resize: (width: number, height: number, dpr: number) => void;
	setPointer: (x: number, y: number) => void;
	clearPointer: () => void;
	frame: (timeMs: number) => void;
	destroy: () => void;
};

const RIBBON_COUNT = RIBBONS.length;

/** Fixed time used for the single still frame shown to reduced-motion users. */
const STILL_TIME = 24;

const BACKGROUND_VERT = /* glsl */ `#version 300 es
in vec2 a_corner;
void main() {
	gl_Position = vec4(a_corner, 0.0, 1.0);
}
`;

const BACKGROUND_FRAG = /* glsl */ `#version 300 es
precision highp float;
uniform vec2 u_view;
uniform float u_dpr;
uniform float u_time;
uniform float u_motion;
out vec4 o_color;

float hash12(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

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

// Written as a sum of deltas: a chain of mix() calls here is miscompiled by WebKit's Metal
// backend (the blue channel comes out wrong).
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

float glow(vec2 uv, vec2 center, vec2 extent, float aspect) {
	vec2 d = (uv - center) / extent * vec2(aspect, 1.0);
	return exp(-dot(d, d));
}

void main() {
	vec2 frag = vec2(gl_FragCoord.x / u_dpr, u_view.y - gl_FragCoord.y / u_dpr);
	vec2 uv = frag / u_view;
	float aspect = u_view.x / u_view.y;
	float t = u_time * u_motion;

	vec3 color = sky(clamp(uv.y + (0.5 - uv.x) * 0.05, 0.0, 1.0));

	// Slow aurora texture in the blue upper half.
	vec2 q = vec2(uv.x * aspect, uv.y) * 1.4;
	float warp = fbm(q + vec2(t * 0.01, -t * 0.007));
	float aurora = fbm(q * 1.8 + warp * 1.6 - vec2(t * 0.015, t * 0.005));
	float upper = 1.0 - smoothstep(0.55, 0.85, uv.y);
	color += vec3(0.27, 0.51, 1.0) * (aurora - 0.45) * 0.1 * upper;

	// Light pools behind the ribbons.
	color += vec3(0.43, 0.65, 1.0) * 0.2 * glow(uv, vec2(0.92, 0.1), vec2(0.5, 0.3), aspect);
	color += vec3(0.39, 0.61, 1.0) * 0.12 * glow(uv, vec2(0.22, 0.6), vec2(0.26, 0.48), aspect);
	color += vec3(0.62, 0.78, 1.0) * 0.14 * glow(uv, vec2(0.82, 0.86), vec2(0.42, 0.2), aspect);

	// Misty floor: soft drifting cloud along the bottom edge.
	float cloud = fbm(vec2(uv.x * aspect * 1.3 + t * 0.008, uv.y * 3.2 - t * 0.004));
	float mist = smoothstep(0.74, 1.02, uv.y + (cloud - 0.5) * 0.22);
	color += (vec3(0.93, 0.96, 1.0) - color) * mist * 0.42;

	// Deepen the top corners.
	float corner = glow(uv, vec2(0.0, 0.0), vec2(0.7, 0.45), aspect)
		+ glow(uv, vec2(1.0, -0.1), vec2(0.4, 0.3), aspect) * 0.4;
	color *= 1.0 - 0.3 * min(corner, 1.0);

	color += (hash12(gl_FragCoord.xy + fract(u_time) * 97.0) - 0.5) / 255.0 * 1.5;
	o_color = vec4(color, 1.0);
}
`;

const FILAMENT_VERT = /* glsl */ `#version 300 es
precision highp float;
uniform vec2 u_view;
uniform float u_dpr;
uniform float u_time;
uniform float u_motion;
uniform vec3 u_lens;
uniform vec2 u_drag;
uniform vec2 u_ctrl[${RIBBON_COUNT * 8}];
uniform vec4 u_shape[${RIBBON_COUNT}];
uniform vec4 u_flow[${RIBBON_COUNT}];
uniform vec4 u_look[${RIBBON_COUNT}];

in vec2 a_template;
in vec4 a_strand;

out float v_across;
out float v_halfCore;
out float v_len;
out float v_s;
out float v_seed;
out float v_bright;
out float v_white;
out float v_bead;

const float HALF_WIDTH = 3.5;
const float LENS_RADIUS = 230.0;

vec2 bezier(int k, float s) {
	float u = 1.0 - s;
	return u * u * u * u_ctrl[k]
		+ 3.0 * u * u * s * u_ctrl[k + 1]
		+ 3.0 * u * s * s * u_ctrl[k + 2]
		+ s * s * s * u_ctrl[k + 3];
}

// One filament of a twisting ribbon. fold is 1 where the ribbon turns edge-on; depth is +-1
// towards or away from the viewer.
vec2 strandPoint(int r, float s, out float fold, out float depth) {
	vec4 shape = u_shape[r];
	vec4 flow = u_flow[r];
	float t = u_time;
	float fs = s * flow.y * 6.2831853;
	float n = sin(fs + t * flow.z + flow.w) * 0.6 + sin(fs * 2.3 - t * flow.z * 0.8 + flow.w * 1.7) * 0.4;
	float theta = s * shape.x + t * shape.y + shape.z + n * 0.5;
	float c = cos(theta);
	float v = a_strand.x - 0.5;
	float across = 0.5 + v * shape.w * (0.3 + 0.7 * c) + n * flow.x;
	across += sin(s * 11.0 + a_strand.z * 40.0 + t * 0.12) * 0.006;
	across += sin(s * 23.0 - t * 0.16 + a_strand.z * 17.0) * 0.002;
	fold = 1.0 - abs(c);
	depth = v * sin(theta) * 2.0;
	return mix(bezier(r * 8, s), bezier(r * 8 + 4, s), across) * u_view;
}

// Gravitational-lens style disturbance: filaments bow gently away from the cursor and are drawn a
// little along its motion. Strength is spring-eased on the CPU.
vec2 applyLens(vec2 p, out float influence) {
	vec2 d = p - u_lens.xy;
	float r2 = dot(d, d);
	influence = exp(-r2 / (LENS_RADIUS * LENS_RADIUS)) * u_lens.z;
	vec2 offset = d * 0.075 * influence;
	offset += u_drag * exp(-r2 / (LENS_RADIUS * LENS_RADIUS * 1.8)) * u_lens.z;
	return p + offset;
}

void main() {
	int r = int(a_strand.y + 0.5);
	float s = a_template.x;
	float h = 0.5 / ${FLOW_SEGMENTS}.0;

	float fold0;
	float fold1;
	float depth0;
	float depth1;
	float lens0;
	float lens1;
	vec2 pa = applyLens(strandPoint(r, max(s - h, 0.0), fold0, depth0), lens0);
	vec2 pb = applyLens(strandPoint(r, min(s + h, 1.0), fold1, depth1), lens1);
	vec2 p = (pa + pb) * 0.5;
	vec2 tangent = normalize(pb - pa + vec2(0.00001, 0.0));
	vec2 normal = vec2(-tangent.y, tangent.x);

	float side = a_template.y;
	vec2 position = p + normal * side * HALF_WIDTH;

	vec4 look = u_look[r];
	float fold = (fold0 + fold1) * 0.5;
	float depth = (depth0 + depth1) * 0.5;
	float lensInfluence = (lens0 + lens1) * 0.5;

	float ends = smoothstep(0.0, 0.14, s) * smoothstep(1.0, 0.8, s);
	float edges = smoothstep(0.0, 0.1, a_strand.x) * smoothstep(1.0, 0.9, a_strand.x);
	float bright = look.x * a_strand.w * ends * (0.4 + 0.6 * edges);
	bright *= 0.7 + 0.3 * fold * fold;
	bright *= clamp(0.85 + 0.35 * depth, 0.4, 1.3);

	// Keep the centre of the stage calm so the chat interface sits on clean negative space.
	vec2 stage = (p / u_view - vec2(0.6, 0.45)) / vec2(0.3, 0.3);
	bright *= mix(0.12, 1.0, smoothstep(0.55, 1.2, length(stage)));
	bright *= 1.0 + lensInfluence * 0.15;

	v_across = side * HALF_WIDTH;
	v_halfCore = max(0.42, 0.62 / u_dpr);
	v_len = s * look.w;
	v_s = s;
	v_seed = a_strand.z;
	v_bead = look.y;
	v_bright = bright * 0.5;
	v_white = clamp(look.z + fold * 0.3 + (p.y / u_view.y - 0.6) * 0.6, 0.0, 1.0);

	vec2 clip = position / u_view * 2.0 - 1.0;
	gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}
`;

const FILAMENT_FRAG = /* glsl */ `#version 300 es
precision highp float;
uniform float u_time;
uniform float u_motion;

in float v_across;
in float v_halfCore;
in float v_len;
in float v_s;
in float v_seed;
in float v_bright;
in float v_white;
in float v_bead;

out vec4 o_color;

void main() {
	float d = abs(v_across);
	float core = exp(-(d * d) / (2.0 * v_halfCore * v_halfCore));
	float halo = exp(-(d * d) / 6.0) * 0.045;

	// Fine beading gives the filaments their stippled, light-thread texture.
	float beadWave = 0.5 + 0.5 * cos(v_len * 1.25 + v_seed * 31.0);
	beadWave *= beadWave;
	float bead = mix(1.0, 0.18 + 1.3 * beadWave * beadWave, v_bead);

	// Highlights travelling slowly along each filament.
	float phase = fract(v_s * 1.1 - u_time * (0.012 + 0.016 * v_seed) + v_seed * 7.0);
	float pulse = exp(-pow((phase - 0.5) * 18.0, 2.0)) * u_motion;
	float shimmer = 0.92 + 0.08 * sin(v_len * 0.05 - u_time * 0.5 * u_motion + v_seed * 50.0);

	float energy = (core * bead * shimmer + halo) * v_bright * (1.0 + pulse * 0.7);
	vec3 tint = vec3(0.55, 0.74, 1.0);
	tint += (vec3(1.0) - tint) * clamp(v_white + pulse * 0.2 + core * 0.15, 0.0, 1.0);
	o_color = vec4(tint * energy, 0.0);
}
`;

const compile = (gl: WebGL2RenderingContext, type: number, source: string) => {
	const shader = gl.createShader(type);
	if (!shader) throw new Error('gravity-flow: createShader failed');
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const log = gl.getShaderInfoLog(shader);
		gl.deleteShader(shader);
		throw new Error(`gravity-flow: shader compile failed: ${log}`);
	}
	return shader;
};

const link = (gl: WebGL2RenderingContext, vert: string, frag: string) => {
	const program = gl.createProgram();
	if (!program) throw new Error('gravity-flow: createProgram failed');
	const vs = compile(gl, gl.VERTEX_SHADER, vert);
	const fs = compile(gl, gl.FRAGMENT_SHADER, frag);
	gl.attachShader(program, vs);
	gl.attachShader(program, fs);
	gl.linkProgram(program);
	gl.deleteShader(vs);
	gl.deleteShader(fs);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		throw new Error(`gravity-flow: program link failed: ${gl.getProgramInfoLog(program)}`);
	}
	return program;
};

const QUAD = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);

/**
 * Creates the renderer, or returns null when WebGL2 is unavailable (the CSS gradient behind the
 * canvas remains as the fallback).
 */
export const createGravityFlowRenderer = (
	canvas: HTMLCanvasElement,
	options: { reducedMotion: boolean }
): GravityFlowRenderer | null => {
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
	let filaments: WebGLProgram;
	try {
		background = link(gl, BACKGROUND_VERT, BACKGROUND_FRAG);
		filaments = link(gl, FILAMENT_VERT, FILAMENT_FRAG);
	} catch (error) {
		console.warn(error);
		return null;
	}

	const quadBuffer = gl.createBuffer();
	const backgroundVao = gl.createVertexArray();
	gl.bindVertexArray(backgroundVao);
	gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW);
	const corner = gl.getAttribLocation(background, 'a_corner');
	gl.enableVertexAttribArray(corner);
	gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);

	const template = buildStrandTemplate();
	const { strands, count: strandCount } = buildStrands();
	const templateBuffer = gl.createBuffer();
	const strandBuffer = gl.createBuffer();
	const filamentVao = gl.createVertexArray();
	gl.bindVertexArray(filamentVao);
	gl.bindBuffer(gl.ARRAY_BUFFER, templateBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, template, gl.STATIC_DRAW);
	const aTemplate = gl.getAttribLocation(filaments, 'a_template');
	gl.enableVertexAttribArray(aTemplate);
	gl.vertexAttribPointer(aTemplate, 2, gl.FLOAT, false, 0, 0);
	gl.bindBuffer(gl.ARRAY_BUFFER, strandBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, strands, gl.STATIC_DRAW);
	const aStrand = gl.getAttribLocation(filaments, 'a_strand');
	gl.enableVertexAttribArray(aStrand);
	gl.vertexAttribPointer(aStrand, 4, gl.FLOAT, false, STRAND_STRIDE * 4, 0);
	gl.vertexAttribDivisor(aStrand, 1);
	gl.bindVertexArray(null);
	const templateVertices = template.length / 2;

	const uniform = (program: WebGLProgram, name: string) => gl.getUniformLocation(program, name);
	const bg = {
		view: uniform(background, 'u_view'),
		dpr: uniform(background, 'u_dpr'),
		time: uniform(background, 'u_time'),
		motion: uniform(background, 'u_motion')
	};
	const fl = {
		view: uniform(filaments, 'u_view'),
		dpr: uniform(filaments, 'u_dpr'),
		time: uniform(filaments, 'u_time'),
		motion: uniform(filaments, 'u_motion'),
		lens: uniform(filaments, 'u_lens'),
		drag: uniform(filaments, 'u_drag'),
		ctrl: uniform(filaments, 'u_ctrl'),
		shape: uniform(filaments, 'u_shape'),
		flow: uniform(filaments, 'u_flow'),
		look: uniform(filaments, 'u_look')
	};

	const motion = options.reducedMotion ? 0 : 1;
	let view = { width: 1, height: 1, dpr: 1 };
	let lens: LensState = createLens();
	const pointer = { x: 0, y: 0, active: false };
	let lastTime: number | null = null;

	const resize = (width: number, height: number, dpr: number) => {
		view = { width, height, dpr };
		canvas.width = Math.max(1, Math.round(width * dpr));
		canvas.height = Math.max(1, Math.round(height * dpr));

		const packed = packRibbonUniforms(RIBBONS, width, height);
		gl.useProgram(filaments);
		gl.uniform2fv(fl.ctrl, packed.ctrl);
		gl.uniform4fv(fl.shape, packed.shape);
		gl.uniform4fv(fl.flow, packed.flow);
		gl.uniform4fv(fl.look, packed.look);
	};

	const setPointer = (x: number, y: number) => {
		if (!motion) return;
		pointer.x = x;
		pointer.y = y;
		pointer.active = true;
	};

	const clearPointer = () => {
		pointer.active = false;
	};

	const frame = (timeMs: number) => {
		const seconds = timeMs / 1000;
		const dt = lastTime === null ? 0 : seconds - lastTime;
		lastTime = seconds;
		lens = stepLens(lens, pointer, dt);
		const time = motion ? seconds : STILL_TIME;

		gl.viewport(0, 0, canvas.width, canvas.height);

		gl.disable(gl.BLEND);
		gl.useProgram(background);
		gl.uniform2f(bg.view, view.width, view.height);
		gl.uniform1f(bg.dpr, view.dpr);
		gl.uniform1f(bg.time, time);
		gl.uniform1f(bg.motion, motion);
		gl.bindVertexArray(backgroundVao);
		gl.drawArrays(gl.TRIANGLES, 0, 6);

		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE);
		gl.useProgram(filaments);
		gl.uniform2f(fl.view, view.width, view.height);
		gl.uniform1f(fl.dpr, view.dpr);
		gl.uniform1f(fl.time, time);
		gl.uniform1f(fl.motion, motion);
		gl.uniform3f(fl.lens, lens.x, lens.y, lens.presence);
		gl.uniform2f(fl.drag, lens.dragX, lens.dragY);
		gl.bindVertexArray(filamentVao);
		gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, templateVertices, strandCount);
		gl.bindVertexArray(null);
	};

	const destroy = () => {
		gl.deleteBuffer(quadBuffer);
		gl.deleteBuffer(templateBuffer);
		gl.deleteBuffer(strandBuffer);
		gl.deleteVertexArray(backgroundVao);
		gl.deleteVertexArray(filamentVao);
		gl.deleteProgram(background);
		gl.deleteProgram(filaments);
	};

	return { resize, setPointer, clearPointer, frame, destroy };
};
