/**
 * WebGL2 renderer for Gravity Field.
 *
 * It renders a shared network of curved streams in three layers: feathered atmospheric haze,
 * thousands of path-bound micro-particles, and sparse hairline filaments. All layers evaluate the
 * same curves and coherent displacement on the GPU, so they move as one fluid electromagnetic
 * field. A spring-eased cursor lens gently refracts nearby paths.
 */

import {
	CURRENT_SEGMENTS,
	FILAMENT_STRIDE,
	MAX_CURRENT_PATHS,
	PARTICLE_STRIDE,
	buildCurrentFilaments,
	buildCurrentParticles,
	buildCurrentTemplate,
	packCurrentUniforms
} from './gravityCurrent';
import { createLens, stepLens, type LensState } from './gravityFlow';

export type GravityCurrentRenderer = {
	resize: (width: number, height: number, dpr: number) => void;
	setPointer: (x: number, y: number) => void;
	clearPointer: () => void;
	frame: (timeMs: number) => void;
	destroy: () => void;
};

const STILL_TIME = 31;

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

// Delta-sum form avoids a WebKit/Metal compiler bug that corrupts the blue channel in chained mix().
vec3 sky(float y) {
	vec3 c = vec3(4.0, 14.0, 53.0);
	c += (vec3(8.0, 31.0, 106.0) - vec3(4.0, 14.0, 53.0)) * smoothstep(0.0, 0.25, y);
	c += (vec3(17.0, 56.0, 164.0) - vec3(8.0, 31.0, 106.0)) * smoothstep(0.2, 0.51, y);
	c += (vec3(42.0, 99.0, 213.0) - vec3(17.0, 56.0, 164.0)) * smoothstep(0.47, 0.71, y);
	c += (vec3(108.0, 159.0, 237.0) - vec3(42.0, 99.0, 213.0)) * smoothstep(0.68, 0.84, y);
	c += (vec3(201.0, 222.0, 250.0) - vec3(108.0, 159.0, 237.0)) * smoothstep(0.82, 0.94, y);
	c += (vec3(242.0, 247.0, 255.0) - vec3(201.0, 222.0, 250.0)) * smoothstep(0.93, 1.0, y);
	return c / 255.0;
}

float glow(vec2 uv, vec2 centre, vec2 extent, float aspect) {
	vec2 d = (uv - centre) / extent * vec2(aspect, 1.0);
	return exp(-dot(d, d));
}

void main() {
	vec2 frag = vec2(gl_FragCoord.x / u_dpr, u_view.y - gl_FragCoord.y / u_dpr);
	vec2 uv = frag / u_view;
	float aspect = u_view.x / u_view.y;
	float t = u_time * u_motion;
	vec3 color = sky(clamp(uv.y + (0.5 - uv.x) * 0.045, 0.0, 1.0));

	// Very low-frequency scattering gives the blue depth without reading as an effect layer.
	vec2 q = vec2(uv.x * aspect, uv.y) * 1.25;
	float warp = fbm(q + vec2(t * 0.006, -t * 0.004));
	float atmosphere = fbm(q * 1.7 + warp * 1.3 - vec2(t * 0.009, 0.0));
	float upper = 1.0 - smoothstep(0.56, 0.88, uv.y);
	color += vec3(0.22, 0.43, 0.95) * (atmosphere - 0.47) * 0.075 * upper;

	// Volumetric pools sit under the shared stream network, strongest along the floor.
	color += vec3(0.36, 0.61, 1.0) * 0.12 * glow(uv, vec2(0.12, 0.58), vec2(0.3, 0.5), aspect);
	color += vec3(0.48, 0.7, 1.0) * 0.13 * glow(uv, vec2(0.86, 0.72), vec2(0.48, 0.24), aspect);
	color += vec3(0.86, 0.93, 1.0) * 0.2 * glow(uv, vec2(0.52, 0.94), vec2(0.72, 0.17), aspect);

	float cloud = fbm(vec2(uv.x * aspect * 1.2 + t * 0.004, uv.y * 3.0));
	float mist = smoothstep(0.76, 1.02, uv.y + (cloud - 0.5) * 0.16);
	color += (vec3(0.94, 0.97, 1.0) - color) * mist * 0.36;

	float corner = glow(uv, vec2(0.0), vec2(0.72, 0.45), aspect)
		+ glow(uv, vec2(1.0, -0.08), vec2(0.42, 0.3), aspect) * 0.35;
	color *= 1.0 - 0.28 * min(corner, 1.0);

	color += (hash12(gl_FragCoord.xy + fract(u_time) * 83.0) - 0.5) / 255.0 * 1.4;
	o_color = vec4(color, 1.0);
}
`;

const CURRENT_SHARED = /* glsl */ `
uniform vec2 u_view;
uniform float u_time;
uniform float u_motion;
uniform vec3 u_lens;
uniform vec2 u_drag;
uniform vec2 u_control[${MAX_CURRENT_PATHS * 4}];
uniform vec4 u_pathMotion[${MAX_CURRENT_PATHS}];
uniform vec4 u_pathLook[${MAX_CURRENT_PATHS}];

const float TAU = 6.28318530718;
const float LENS_RADIUS = 230.0;

vec2 curve(int path, float s) {
	int k = path * 4;
	float u = 1.0 - s;
	return u * u * u * u_control[k]
		+ 3.0 * u * u * s * u_control[k + 1]
		+ 3.0 * u * s * s * u_control[k + 2]
		+ s * s * s * u_control[k + 3];
}

vec2 curveTangent(int path, float s) {
	int k = path * 4;
	float u = 1.0 - s;
	return 3.0 * u * u * (u_control[k + 1] - u_control[k])
		+ 6.0 * u * s * (u_control[k + 2] - u_control[k + 1])
		+ 3.0 * s * s * (u_control[k + 3] - u_control[k + 2]);
}

vec2 currentPoint(int path, float s, float offset, float seed, out float lensInfluence) {
	vec4 motion = u_pathMotion[path];
	vec2 centre = curve(path, s) * u_view;
	vec2 tangent = normalize(curveTangent(path, s) * u_view + vec2(0.0001, 0.0));
	vec2 normal = vec2(-tangent.y, tangent.x);

	float t = u_time * u_motion;
	float flowWave = sin(s * motion.z * TAU + seed * 5.0 + t * 0.14)
		+ sin(s * motion.z * 2.17 * TAU - seed * 9.0 - t * 0.09) * 0.36;
	float widthShape = 0.58 + 0.42 * sin(s * 3.14159265);
	float spacing = offset * motion.x * u_view.y * widthShape;
	spacing *= 0.88 + 0.12 * sin(s * 8.0 + seed * 19.0);
	spacing += flowWave * motion.y * u_view.y;
	spacing += sin(s * 25.0 + seed * 41.0 - t * 0.17) * u_view.y * 0.0015;
	vec2 p = centre + normal * spacing;

	vec2 d = p - u_lens.xy;
	float r2 = dot(d, d);
	lensInfluence = exp(-r2 / (LENS_RADIUS * LENS_RADIUS)) * u_lens.z;
	p += d * 0.055 * lensInfluence;
	p += u_drag * exp(-r2 / (LENS_RADIUS * LENS_RADIUS * 1.8)) * u_lens.z;
	return p;
}

float stageMask(vec2 p) {
	vec2 stage = (p / u_view - vec2(0.58, 0.46)) / vec2(0.38, 0.35);
	return mix(0.05, 1.0, smoothstep(0.66, 1.24, length(stage)));
}

vec4 toClip(vec2 p) {
	vec2 clip = p / u_view * 2.0 - 1.0;
	return vec4(clip.x, -clip.y, 0.0, 1.0);
}
`;

const FILAMENT_VERT = /* glsl */ `#version 300 es
precision highp float;
${CURRENT_SHARED}
uniform float u_dpr;
in vec2 a_template;
in vec3 a_filamentA;
in vec3 a_filamentB;
out float v_across;
out float v_core;
out float v_brightness;
out float v_white;
out float v_distance;
out float v_seed;

void main() {
	int path = int(a_filamentA.x + 0.5);
	float s = a_template.x;
	float seed = a_filamentA.z;
	float h = 0.5 / ${CURRENT_SEGMENTS}.0;
	float lensA;
	float lensB;
	vec2 pa = currentPoint(path, max(0.0, s - h), a_filamentA.y, seed, lensA);
	vec2 pb = currentPoint(path, min(1.0, s + h), a_filamentA.y, seed, lensB);
	vec2 p = (pa + pb) * 0.5;
	vec2 tangent = normalize(pb - pa + vec2(0.0001, 0.0));
	vec2 normal = vec2(-tangent.y, tangent.x);

	float halfWidth = 2.6;
	vec2 position = p + normal * a_template.y * halfWidth;
	float ends = smoothstep(0.0, 0.08, s) * smoothstep(1.0, 0.92, s);
	float lens = (lensA + lensB) * 0.5;
	float pathGain = u_pathLook[path].x;
	float irregular = 0.84 + 0.16 * sin(s * 17.0 + seed * 53.0);

	v_across = a_template.y * halfWidth;
	v_core = max(0.28, a_filamentB.x / u_dpr);
	v_brightness = pathGain * a_filamentB.y * ends * irregular * stageMask(p) * (1.0 + lens * 0.08);
	v_white = mix(a_filamentB.z, 0.08, smoothstep(0.66, 0.94, p.y / u_view.y));
	v_distance = s * length(curveTangent(path, s) * u_view);
	v_seed = seed;
	gl_Position = toClip(position);
}
`;

const FILAMENT_FRAG = /* glsl */ `#version 300 es
precision highp float;
uniform float u_time;
uniform float u_motion;
in float v_across;
in float v_core;
in float v_brightness;
in float v_white;
in float v_distance;
in float v_seed;
out vec4 o_color;

void main() {
	float d = abs(v_across);
	float core = exp(-(d * d) / (2.0 * v_core * v_core));
	float feather = exp(-(d * d) / 4.2) * 0.03;
	float imperfection = 0.64 + 0.36 * pow(0.5 + 0.5 * sin(v_distance * 0.075 + v_seed * 47.0), 1.7);
	float shimmer = 0.93 + 0.07 * sin(v_distance * 0.035 - u_time * 0.35 * u_motion + v_seed * 67.0);
	float energy = (core * imperfection * shimmer + feather) * v_brightness * 0.34;
	vec3 blue = vec3(0.48, 0.7, 1.0);
	vec3 tint = mix(blue, vec3(0.96, 0.985, 1.0), v_white);
	o_color = vec4(tint * energy, 0.0);
}
`;

const PARTICLE_VERT = /* glsl */ `#version 300 es
precision highp float;
${CURRENT_SHARED}
uniform float u_dpr;
in vec4 a_particleA;
in vec3 a_particleB;
out float v_alpha;
out float v_kind;
out float v_white;
out float v_seed;

void main() {
	int path = int(a_particleA.x + 0.5);
	float kind = a_particleB.z;
	float baseSpeed = u_pathMotion[path].w;
	float speedScale = kind > 1.5 ? 0.16 : (kind > 0.5 ? 1.8 : 0.55 + a_particleA.w * 0.7);
	float s = fract(a_particleA.y + u_time * u_motion * baseSpeed * speedScale);
	float lens;
	vec2 p = currentPoint(path, s, a_particleA.z, a_particleA.w, lens);
	float ends = smoothstep(0.0, 0.07, s) * smoothstep(1.0, 0.93, s);
	float calm = stageMask(p);
	float pulse = kind > 0.5 && kind < 1.5
		? 0.68 + 0.32 * sin(u_time * 0.7 * u_motion + a_particleA.w * 71.0)
		: 1.0;

	v_alpha = a_particleB.y * u_pathLook[path].x * ends * calm * pulse * 1.25;
	v_alpha *= kind > 1.5 ? 1.0 : 1.0 + lens * 0.12;
	v_kind = kind;
	float baseWhite = clamp(u_pathLook[path].y + (kind > 0.5 ? 0.2 : 0.0), 0.0, 1.0);
	v_white = mix(baseWhite, 0.05, smoothstep(0.66, 0.94, p.y / u_view.y));
	v_seed = a_particleA.w;
	gl_PointSize = max(1.0, a_particleB.x * u_dpr * (kind > 1.5 ? 1.0 : 1.0 + lens * 0.12));
	gl_Position = toClip(p);
}
`;

const PARTICLE_FRAG = /* glsl */ `#version 300 es
precision highp float;
in float v_alpha;
in float v_kind;
in float v_white;
in float v_seed;
out vec4 o_color;

void main() {
	vec2 d = gl_PointCoord - 0.5;
	float r = length(d) * 2.0;
	if (r > 1.0) discard;

	float profile;
	if (v_kind > 1.5) {
		profile = exp(-r * r * 3.0);
	} else if (v_kind > 0.5) {
		profile = exp(-r * r * 2.8);
	} else {
		profile = 1.0 - smoothstep(0.12, 1.0, r);
	}

	vec3 blue = vec3(0.32, 0.59, 1.0);
	vec3 tint = mix(blue, vec3(0.97, 0.99, 1.0), v_white);
	float energy = profile * v_alpha * (v_kind > 0.5 && v_kind < 1.5 ? 1.5 : 1.0);
	o_color = vec4(tint * energy, 0.0);
}
`;

const compile = (gl: WebGL2RenderingContext, type: number, source: string) => {
	const shader = gl.createShader(type);
	if (!shader) throw new Error('gravity-field: createShader failed');
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const log = gl.getShaderInfoLog(shader);
		gl.deleteShader(shader);
		throw new Error(`gravity-field: shader compile failed: ${log}`);
	}
	return shader;
};

const link = (gl: WebGL2RenderingContext, vert: string, frag: string) => {
	const program = gl.createProgram();
	if (!program) throw new Error('gravity-field: createProgram failed');
	const vs = compile(gl, gl.VERTEX_SHADER, vert);
	const fs = compile(gl, gl.FRAGMENT_SHADER, frag);
	gl.attachShader(program, vs);
	gl.attachShader(program, fs);
	gl.linkProgram(program);
	gl.deleteShader(vs);
	gl.deleteShader(fs);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		throw new Error(`gravity-field: program link failed: ${gl.getProgramInfoLog(program)}`);
	}
	return program;
};

const QUAD = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);

export const createGravityCurrentRenderer = (
	canvas: HTMLCanvasElement,
	options: { reducedMotion: boolean }
): GravityCurrentRenderer | null => {
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
	let particles: WebGLProgram;
	try {
		background = link(gl, BACKGROUND_VERT, BACKGROUND_FRAG);
		filaments = link(gl, FILAMENT_VERT, FILAMENT_FRAG);
		particles = link(gl, PARTICLE_VERT, PARTICLE_FRAG);
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

	const template = buildCurrentTemplate();
	const filamentData = buildCurrentFilaments();
	const templateBuffer = gl.createBuffer();
	const filamentBuffer = gl.createBuffer();
	const filamentVao = gl.createVertexArray();
	gl.bindVertexArray(filamentVao);
	gl.bindBuffer(gl.ARRAY_BUFFER, templateBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, template, gl.STATIC_DRAW);
	const templateLocation = gl.getAttribLocation(filaments, 'a_template');
	gl.enableVertexAttribArray(templateLocation);
	gl.vertexAttribPointer(templateLocation, 2, gl.FLOAT, false, 0, 0);
	gl.bindBuffer(gl.ARRAY_BUFFER, filamentBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, filamentData.filaments, gl.STATIC_DRAW);
	const filamentStride = FILAMENT_STRIDE * 4;
	const filamentA = gl.getAttribLocation(filaments, 'a_filamentA');
	const filamentB = gl.getAttribLocation(filaments, 'a_filamentB');
	gl.enableVertexAttribArray(filamentA);
	gl.vertexAttribPointer(filamentA, 3, gl.FLOAT, false, filamentStride, 0);
	gl.vertexAttribDivisor(filamentA, 1);
	gl.enableVertexAttribArray(filamentB);
	gl.vertexAttribPointer(filamentB, 3, gl.FLOAT, false, filamentStride, 12);
	gl.vertexAttribDivisor(filamentB, 1);

	const particleData = buildCurrentParticles();
	const particleBuffer = gl.createBuffer();
	const particleVao = gl.createVertexArray();
	gl.bindVertexArray(particleVao);
	gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, particleData.particles, gl.STATIC_DRAW);
	const particleStride = PARTICLE_STRIDE * 4;
	const particleA = gl.getAttribLocation(particles, 'a_particleA');
	const particleB = gl.getAttribLocation(particles, 'a_particleB');
	gl.enableVertexAttribArray(particleA);
	gl.vertexAttribPointer(particleA, 4, gl.FLOAT, false, particleStride, 0);
	gl.enableVertexAttribArray(particleB);
	gl.vertexAttribPointer(particleB, 3, gl.FLOAT, false, particleStride, 16);
	gl.bindVertexArray(null);

	const uniform = (program: WebGLProgram, name: string) => gl.getUniformLocation(program, name);
	const backgroundUniforms = {
		view: uniform(background, 'u_view'),
		dpr: uniform(background, 'u_dpr'),
		time: uniform(background, 'u_time'),
		motion: uniform(background, 'u_motion')
	};
	const currentUniforms = (program: WebGLProgram) => ({
		view: uniform(program, 'u_view'),
		dpr: uniform(program, 'u_dpr'),
		time: uniform(program, 'u_time'),
		motion: uniform(program, 'u_motion'),
		lens: uniform(program, 'u_lens'),
		drag: uniform(program, 'u_drag'),
		control: uniform(program, 'u_control'),
		pathMotion: uniform(program, 'u_pathMotion'),
		pathLook: uniform(program, 'u_pathLook')
	});
	const filamentUniforms = currentUniforms(filaments);
	const particleUniforms = currentUniforms(particles);

	const packed = packCurrentUniforms();
	for (const [program, uniforms] of [
		[filaments, filamentUniforms],
		[particles, particleUniforms]
	] as const) {
		gl.useProgram(program);
		gl.uniform2fv(uniforms.control, packed.control);
		gl.uniform4fv(uniforms.pathMotion, packed.motion);
		gl.uniform4fv(uniforms.pathLook, packed.look);
	}

	const motion = options.reducedMotion ? 0 : 1;
	let view = { width: 1, height: 1, dpr: 1 };
	let lens: LensState = createLens();
	const pointer = { x: 0, y: 0, active: false };
	let lastTime: number | null = null;

	const resize = (width: number, height: number, dpr: number) => {
		view = { width, height, dpr };
		canvas.width = Math.max(1, Math.round(width * dpr));
		canvas.height = Math.max(1, Math.round(height * dpr));
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

	const applyCurrentUniforms = (
		program: WebGLProgram,
		uniforms: ReturnType<typeof currentUniforms>,
		time: number
	) => {
		gl.useProgram(program);
		gl.uniform2f(uniforms.view, view.width, view.height);
		gl.uniform1f(uniforms.dpr, view.dpr);
		gl.uniform1f(uniforms.time, time);
		gl.uniform1f(uniforms.motion, motion);
		gl.uniform3f(uniforms.lens, lens.x, lens.y, lens.presence);
		gl.uniform2f(uniforms.drag, lens.dragX, lens.dragY);
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
		gl.uniform2f(backgroundUniforms.view, view.width, view.height);
		gl.uniform1f(backgroundUniforms.dpr, view.dpr);
		gl.uniform1f(backgroundUniforms.time, time);
		gl.uniform1f(backgroundUniforms.motion, motion);
		gl.bindVertexArray(backgroundVao);
		gl.drawArrays(gl.TRIANGLES, 0, 6);

		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE);

		// Haze and particles sit below the hairline filaments.
		applyCurrentUniforms(particles, particleUniforms, time);
		gl.bindVertexArray(particleVao);
		gl.drawArrays(gl.POINTS, 0, particleData.count);

		applyCurrentUniforms(filaments, filamentUniforms, time);
		gl.bindVertexArray(filamentVao);
		gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, template.length / 2, filamentData.count);
		gl.bindVertexArray(null);
	};

	const destroy = () => {
		gl.deleteBuffer(quadBuffer);
		gl.deleteBuffer(templateBuffer);
		gl.deleteBuffer(filamentBuffer);
		gl.deleteBuffer(particleBuffer);
		gl.deleteVertexArray(backgroundVao);
		gl.deleteVertexArray(filamentVao);
		gl.deleteVertexArray(particleVao);
		gl.deleteProgram(background);
		gl.deleteProgram(filaments);
		gl.deleteProgram(particles);
	};

	return { resize, setPointer, clearPointer, frame, destroy };
};
