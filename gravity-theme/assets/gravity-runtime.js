"use strict";
(() => {
  // src/theme.js
  var ROOT_CLASSES = [
    "dark",
    "gravity",
    "gravity-flow",
    "gravity-field",
    "gravity-eclipse",
    "gravity-eclipse-2",
    "eclipse-pearl"
  ];
  var gravityAssetBase = window.__gravityAssetBase ?? new URL("/static/gravity/", window.location.origin).href;
  var PEARL_IMAGE = new URL("ask-pearl-day-600.webp", gravityAssetBase).href;
  var GRAVITY_MODE_KEY = "gravityThemeMode";
  var getGravityMode = () => localStorage.getItem(GRAVITY_MODE_KEY) === "pearl" ? "pearl" : "eclipse";
  var applyRootTheme = () => {
    const root = document.documentElement;
    const needsLightRemoved = root.classList.contains("light");
    const missing = ROOT_CLASSES.some((name) => !root.classList.contains(name));
    if (needsLightRemoved) root.classList.remove("light");
    if (missing) ROOT_CLASSES.forEach((name) => root.classList.add(name));
    root.classList.toggle("gravity-pearl", getGravityMode() === "pearl");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#101113");
  };
  var setGravityMode = (mode) => {
    const nextMode = mode === "pearl" ? "pearl" : "eclipse";
    localStorage.setItem(GRAVITY_MODE_KEY, nextMode);
    applyRootTheme();
    window.dispatchEvent(new CustomEvent("gravity:modechange", { detail: { mode: nextMode } }));
  };
  var reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // src/renderer/gravityCurrent.ts
  var CURRENT_PATHS = [
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
        [1.05, 0],
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
  var CURRENT_SEGMENTS = 180;
  var FILAMENT_STRIDE = 6;
  var PARTICLE_STRIDE = 7;
  var MAX_CURRENT_PATHS = 8;
  var mulberry32 = (seed) => {
    let state = seed >>> 0;
    return () => {
      state = state + 1831565813 | 0;
      let t = Math.imul(state ^ state >>> 15, 1 | state);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  };
  var buildCurrentTemplate = (segments = CURRENT_SEGMENTS) => {
    const template = new Float32Array((segments + 1) * 4);
    for (let i = 0; i <= segments; i += 1) {
      const s = i / segments;
      template.set([s, -1, s, 1], i * 4);
    }
    return template;
  };
  var buildCurrentFilaments = (paths = CURRENT_PATHS) => {
    const count = paths.reduce((sum, path) => sum + path.filaments, 0);
    const filaments = new Float32Array(count * FILAMENT_STRIDE);
    let offset = 0;
    paths.forEach((path, pathIndex) => {
      const rand = mulberry32(path.seed);
      for (let i = 0; i < path.filaments; i += 1) {
        const across = (i + 0.5 + (rand() - 0.5) * 0.9) / path.filaments * 2 - 1;
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
  var buildCurrentParticles = (paths = CURRENT_PATHS) => {
    const count = paths.reduce((sum, path) => sum + path.particles + path.haze, 0);
    const particles = new Float32Array(count * PARTICLE_STRIDE);
    let offset = 0;
    paths.forEach((path, pathIndex) => {
      const rand = mulberry32(path.seed * 101 + 17);
      const laneCount = Math.max(20, Math.round(Math.sqrt(path.particles) * 0.5));
      for (let i = 0; i < path.particles; i += 1) {
        const highlight = rand() > 0.982;
        const lane = Math.floor(rand() * laneCount);
        const across = (lane + 0.5) / laneCount * 2 - 1 + (rand() - 0.5) * (1.2 / laneCount);
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
  var packCurrentUniforms = (paths = CURRENT_PATHS) => {
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

  // src/renderer/gravityFlow.ts
  var createLens = () => ({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    presence: 0,
    dragX: 0,
    dragY: 0,
    initialised: false
  });
  var LENS_STIFFNESS = 14;
  var LENS_DAMPING = 7.5;
  var DRAG_GAIN = 0.02;
  var LENS_DRAG_LIMIT = 12;
  var stepLens = (state, target, dt) => {
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

  // src/renderer/gravityCurrentRenderer.ts
  var GRAVITY_FIELD_GRADE = [0.16, 0.36, 0.98];
  var GRAVITY_PEARL_GRADE = [0.09, 0.58, 0.66];
  var STILL_TIME = 31;
  var BACKGROUND_VERT = (
    /* glsl */
    `#version 300 es
in vec2 a_corner;
void main() {
	gl_Position = vec4(a_corner, 0.0, 1.0);
}
`
  );
  var BACKGROUND_FRAG = (
    /* glsl */
    `#version 300 es
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
`
  );
  var ECLIPSE_BACKGROUND_FRAG = (
    /* glsl */
    `#version 300 es
precision highp float;
uniform vec2 u_view;
uniform float u_dpr;
uniform float u_time;
uniform float u_motion;
out vec4 o_color;

void main() {
	o_color = vec4(0.02, 0.021, 0.024, 1.0);
}
`
  );
  var PEARL_BACKGROUND_FRAG = (
    /* glsl */
    `#version 300 es
precision highp float;
uniform vec2 u_view;
uniform float u_dpr;
uniform float u_time;
uniform float u_motion;
out vec4 o_color;

void main() {
	vec2 frag = vec2(gl_FragCoord.x / u_dpr, u_view.y - gl_FragCoord.y / u_dpr);
	float y = frag.y / max(u_view.y, 1.0);
	vec3 color = vec3(0.969, 0.980, 0.992);
	color += (vec3(0.929, 0.953, 0.976) - color) * smoothstep(0.2, 1.0, y);
	o_color = vec4(color, 1.0);
}
`
  );
  var CURRENT_SHARED = (
    /* glsl */
    `
uniform vec2 u_view;
uniform float u_time;
uniform float u_motion;
uniform vec3 u_lens;
uniform vec2 u_drag;
uniform vec2 u_control[${MAX_CURRENT_PATHS * 4}];
uniform vec4 u_pathMotion[${MAX_CURRENT_PATHS}];
uniform vec4 u_pathLook[${MAX_CURRENT_PATHS}];
uniform float u_matte;

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
	vec2 uv = p / u_view;
	vec2 stage = (uv - vec2(0.58, 0.46)) / vec2(0.38, 0.35);
	float field = mix(0.05, 1.0, smoothstep(0.66, 1.24, length(stage)));
	float edge = smoothstep(0.5, 1.12, length((uv - vec2(0.55, 0.4)) / vec2(0.3, 0.24)));
	float floorLight = smoothstep(0.7, 1.0, uv.y);
	float side = smoothstep(0.16, 0.0, min(uv.x, 1.0 - uv.x));
	float eclipse = clamp(max(edge, max(floorLight, side)) * 1.35, 0.0, 1.45);
	return mix(field, eclipse, u_matte);
}

vec4 toClip(vec2 p) {
	vec2 clip = p / u_view * 2.0 - 1.0;
	return vec4(clip.x, -clip.y, 0.0, 1.0);
}
`
  );
  var FILAMENT_VERT = (
    /* glsl */
    `#version 300 es
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
`
  );
  var FILAMENT_FRAG = (
    /* glsl */
    `#version 300 es
precision highp float;
uniform float u_time;
uniform float u_motion;
uniform float u_level;
uniform float u_matte;
uniform float u_ink;
uniform vec3 u_grade;
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
	float energy = (core * imperfection * shimmer + feather) * v_brightness * 0.34 * u_level;
	vec3 blue = vec3(0.48, 0.7, 1.0);
	vec3 tint = mix(blue, vec3(0.96, 0.985, 1.0), v_white);
	tint = mix(tint, u_grade, u_matte);
	o_color = vec4(tint * energy, energy * u_ink);
}
`
  );
  var PARTICLE_VERT = (
    /* glsl */
    `#version 300 es
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
`
  );
  var PARTICLE_FRAG = (
    /* glsl */
    `#version 300 es
precision highp float;
uniform float u_level;
uniform float u_matte;
uniform float u_ink;
uniform vec3 u_grade;
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
	tint = mix(tint, u_grade, u_matte);
	float energy = profile * v_alpha * (v_kind > 0.5 && v_kind < 1.5 ? 1.5 : 1.0) * u_level;
	energy *= v_kind > 1.5 ? 1.0 - u_matte : 1.0;
	o_color = vec4(tint * energy, energy * u_ink);
}
`
  );
  var compile = (gl, type, source) => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("gravity-field: createShader failed");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`gravity-field: shader compile failed: ${log}`);
    }
    return shader;
  };
  var link = (gl, vert, frag) => {
    const program = gl.createProgram();
    if (!program) throw new Error("gravity-field: createProgram failed");
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
  var QUAD = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
  var createGravityCurrentRenderer = (canvas, options) => {
    const eclipse = options.treatment === "eclipse";
    const pearl2 = options.treatment === "pearl";
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      powerPreference: "low-power"
    });
    if (!gl) return null;
    let background;
    let filaments;
    let particles;
    try {
      background = link(
        gl,
        BACKGROUND_VERT,
        pearl2 ? PEARL_BACKGROUND_FRAG : eclipse ? ECLIPSE_BACKGROUND_FRAG : BACKGROUND_FRAG
      );
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
    const corner = gl.getAttribLocation(background, "a_corner");
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
    const templateLocation = gl.getAttribLocation(filaments, "a_template");
    gl.enableVertexAttribArray(templateLocation);
    gl.vertexAttribPointer(templateLocation, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, filamentBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, filamentData.filaments, gl.STATIC_DRAW);
    const filamentStride = FILAMENT_STRIDE * 4;
    const filamentA = gl.getAttribLocation(filaments, "a_filamentA");
    const filamentB = gl.getAttribLocation(filaments, "a_filamentB");
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
    const particleA = gl.getAttribLocation(particles, "a_particleA");
    const particleB = gl.getAttribLocation(particles, "a_particleB");
    gl.enableVertexAttribArray(particleA);
    gl.vertexAttribPointer(particleA, 4, gl.FLOAT, false, particleStride, 0);
    gl.enableVertexAttribArray(particleB);
    gl.vertexAttribPointer(particleB, 3, gl.FLOAT, false, particleStride, 16);
    gl.bindVertexArray(null);
    const uniform = (program, name) => gl.getUniformLocation(program, name);
    const backgroundUniforms = {
      view: uniform(background, "u_view"),
      dpr: uniform(background, "u_dpr"),
      time: uniform(background, "u_time"),
      motion: uniform(background, "u_motion")
    };
    const currentUniforms = (program) => ({
      view: uniform(program, "u_view"),
      dpr: uniform(program, "u_dpr"),
      time: uniform(program, "u_time"),
      motion: uniform(program, "u_motion"),
      lens: uniform(program, "u_lens"),
      drag: uniform(program, "u_drag"),
      control: uniform(program, "u_control"),
      pathMotion: uniform(program, "u_pathMotion"),
      pathLook: uniform(program, "u_pathLook"),
      level: uniform(program, "u_level"),
      matte: uniform(program, "u_matte"),
      ink: uniform(program, "u_ink"),
      grade: uniform(program, "u_grade")
    });
    const filamentUniforms = currentUniforms(filaments);
    const particleUniforms = currentUniforms(particles);
    const packed = packCurrentUniforms();
    for (const [program, uniforms] of [
      [filaments, filamentUniforms],
      [particles, particleUniforms]
    ]) {
      gl.useProgram(program);
      gl.uniform2fv(uniforms.control, packed.control);
      gl.uniform4fv(uniforms.pathMotion, packed.motion);
      gl.uniform4fv(uniforms.pathLook, packed.look);
    }
    const motion = options.reducedMotion ? 0 : 1;
    const level = eclipse ? 1.35 : pearl2 ? 1.2 : 1;
    const matte = eclipse || pearl2 ? 1 : 0;
    const ink = pearl2 ? 1 : 0;
    let grade = options.grade ?? (pearl2 ? GRAVITY_PEARL_GRADE : GRAVITY_FIELD_GRADE);
    let view = { width: 1, height: 1, dpr: 1 };
    let lens = createLens();
    const pointer = { x: 0, y: 0, active: false };
    let lastTime = null;
    const resize = (width, height, dpr) => {
      view = { width, height, dpr };
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
    };
    const setPointer = (x, y) => {
      if (!motion) return;
      pointer.x = x;
      pointer.y = y;
      pointer.active = true;
    };
    const clearPointer = () => {
      pointer.active = false;
    };
    const setGrade = (next) => {
      grade = next;
    };
    const applyCurrentUniforms = (program, uniforms, time) => {
      gl.useProgram(program);
      gl.uniform2f(uniforms.view, view.width, view.height);
      gl.uniform1f(uniforms.dpr, view.dpr);
      gl.uniform1f(uniforms.time, time);
      gl.uniform1f(uniforms.motion, motion);
      gl.uniform3f(uniforms.lens, lens.x, lens.y, lens.presence);
      gl.uniform2f(uniforms.drag, lens.dragX, lens.dragY);
      gl.uniform1f(uniforms.level, level);
      gl.uniform1f(uniforms.matte, matte);
      gl.uniform1f(uniforms.ink, ink);
      gl.uniform3f(uniforms.grade, grade[0], grade[1], grade[2]);
    };
    const frame = (timeMs) => {
      const seconds = timeMs / 1e3;
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
      gl.blendFunc(gl.ONE, pearl2 ? gl.ONE_MINUS_SRC_ALPHA : gl.ONE);
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
    return { resize, setPointer, clearPointer, setGrade, frame, destroy };
  };

  // src/field.js
  var mountField = () => {
    if (document.querySelector(".gravity-eclipse-atmosphere")) {
      return document.querySelector(".gravity-eclipse-atmosphere");
    }
    const atmosphere = document.createElement("div");
    atmosphere.className = "gravity-eclipse-atmosphere";
    atmosphere.setAttribute("aria-hidden", "true");
    atmosphere.innerHTML = `
		<div class="gravity-eclipse-atmosphere__halo"></div>
		<div class="gravity-eclipse-atmosphere__core"></div>
		<div class="gravity-eclipse-atmosphere__current"></div>
		<div class="gravity-eclipse-atmosphere__veil"></div>
		<canvas class="gravity-eclipse-atmosphere__canvas"></canvas>
	`;
    document.body.prepend(atmosphere);
    const canvas = atmosphere.querySelector("canvas");
    const motionOff = reducedMotion();
    if (motionOff) atmosphere.classList.add("is-paused");
    let renderer;
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let shiftRaf = 0;
    let fieldRaf = 0;
    let resizeTimer;
    const sizeField = () => {
      renderer?.resize(
        window.innerWidth,
        window.innerHeight,
        Math.min(window.devicePixelRatio || 1, 2)
      );
    };
    const paintShift = () => {
      shiftRaf = 0;
      if (document.hidden) return;
      currentX += (targetX - currentX) * 0.035;
      currentY += (targetY - currentY) * 0.035;
      atmosphere.style.setProperty("--eclipse-shift-x", `${currentX * 18}px`);
      atmosphere.style.setProperty("--eclipse-shift-y", `${currentY * 12}px`);
      if (!motionOff && (Math.abs(targetX - currentX) > 1e-3 || Math.abs(targetY - currentY) > 1e-3)) {
        shiftRaf = requestAnimationFrame(paintShift);
      }
    };
    const tickField = (time) => {
      fieldRaf = 0;
      if (!renderer || document.hidden || canvas.clientWidth === 0) return;
      renderer.frame(time);
      if (!motionOff) fieldRaf = requestAnimationFrame(tickField);
    };
    const start = () => {
      if (!shiftRaf) shiftRaf = requestAnimationFrame(paintShift);
      if (renderer && !fieldRaf) fieldRaf = requestAnimationFrame(tickField);
    };
    const applyFieldMode = () => {
      renderer?.destroy();
      renderer = createGravityCurrentRenderer(canvas, {
        reducedMotion: motionOff,
        treatment: getGravityMode(),
        grade: GRAVITY_PEARL_GRADE
      });
      sizeField();
      start();
    };
    applyFieldMode();
    window.addEventListener("gravity:modechange", applyFieldMode);
    window.addEventListener(
      "pointermove",
      (event) => {
        if (motionOff) return;
        targetX = (event.clientX / window.innerWidth - 0.5) * 2;
        targetY = (event.clientY / window.innerHeight - 0.5) * 2;
        renderer?.setPointer(event.clientX, event.clientY);
        start();
      },
      { passive: true }
    );
    document.addEventListener("pointerout", (event) => {
      if (event.relatedTarget) return;
      targetX = 0;
      targetY = 0;
      renderer?.clearPointer();
      start();
    });
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        sizeField();
        start();
      }, 120);
    });
    document.addEventListener("visibilitychange", () => {
      atmosphere.classList.toggle("is-paused", document.hidden || motionOff);
      if (!document.hidden) start();
    });
    return atmosphere;
  };

  // src/hooks.js
  var addClass = (node, name) => {
    if (node && !node.classList.contains(name)) node.classList.add(name);
  };
  var welcomeRoot = null;
  var welcomeComposer = null;
  var isNativeThemeSelect = (select) => {
    const values = new Set([...select.options].map((option) => option.value));
    return ["system", "dark", "oled-dark", "light"].every((value) => values.has(value));
  };
  var ensureThemeModeSelect = () => {
    const nativeSelect = [...document.querySelectorAll("select")].find(isNativeThemeSelect);
    if (!nativeSelect) return;
    const nativeWrapper = nativeSelect.parentElement;
    if (!nativeWrapper) return;
    nativeWrapper.hidden = true;
    const row = nativeWrapper.closest(".group\\/setting-row") || nativeWrapper.parentElement;
    let modeSelect = row?.querySelector(".gravity-theme-mode-select");
    if (!modeSelect) {
      const wrapper = document.createElement("div");
      wrapper.className = "gravity-theme-mode-select-wrap";
      modeSelect = document.createElement("select");
      modeSelect.className = `gravity-theme-mode-select ${nativeSelect.className}`;
      modeSelect.setAttribute("aria-label", "Gravity appearance");
      modeSelect.innerHTML = `
			<option value="eclipse">\u{1F318} Gravity Eclipse</option>
			<option value="pearl">\u{1FAE7} Gravity Pearl</option>
		`;
      modeSelect.addEventListener("change", () => setGravityMode(modeSelect.value));
      wrapper.appendChild(modeSelect);
      nativeWrapper.insertAdjacentElement("afterend", wrapper);
    }
    modeSelect.value = getGravityMode();
  };
  var markWelcome = () => {
    const composer = document.getElementById("message-input-container");
    if (!composer) {
      welcomeRoot = null;
      welcomeComposer = null;
      return null;
    }
    if (welcomeRoot?.isConnected && welcomeComposer === composer && welcomeRoot.contains(composer)) {
      addClass(composer, "message-composer");
      return welcomeRoot;
    }
    if (welcomeRoot?.isConnected) welcomeRoot.classList.remove("chat-welcome");
    welcomeRoot = null;
    welcomeComposer = null;
    const suggestions = document.getElementById("suggestions-heading");
    if (!suggestions) return null;
    const welcome = composer.closest("div.m-auto") || suggestions.closest("div.m-auto") || composer.parentElement?.parentElement;
    if (!welcome) return null;
    welcomeRoot = welcome;
    welcomeComposer = composer;
    addClass(welcome, "chat-welcome");
    const title = welcome.querySelector("h2");
    if (title) {
      addClass(title, "chat-welcome-title");
      const heading = title.closest("div.w-full") || title.parentElement?.parentElement;
      addClass(heading, "chat-welcome-heading");
      const hero = title.parentElement;
      addClass(hero, "chat-welcome-hero");
      const model = hero?.querySelector("img")?.closest("div.flex");
      addClass(model?.parentElement, "chat-welcome-model");
    }
    addClass(
      composer.closest("div.py-3") || composer.parentElement,
      "chat-welcome-composer"
    );
    addClass(
      suggestions.closest("div.mx-auto") || suggestions.parentElement?.parentElement,
      "chat-welcome-suggestions"
    );
    addClass(composer, "message-composer");
    return welcome;
  };
  var markChrome = () => {
    ensureThemeModeSelect();
    document.querySelectorAll(".app.relative > div, .app > div.h-screen").forEach((node) => {
      if (node.classList.contains("gravity-atmosphere") || node.classList.contains("gravity-eclipse-atmosphere")) {
        return;
      }
      addClass(node, "app-shell");
    });
    document.querySelectorAll('[role="navigation"]').forEach((nav) => {
      if (nav.className.includes("w-[calc(42px")) addClass(nav, "app-sidebar-rail");
      else addClass(nav, "app-sidebar-panel");
    });
    document.querySelectorAll("#sidebar-new-chat-button").forEach((node) => addClass(node, "app-sidebar-new-chat"));
    addClass(document.getElementById("message-input-container"), "message-composer");
    document.querySelectorAll("div.rounded-3xl").forEach((node) => {
      if (node.id === "message-input-container" || node.closest(".chat-welcome-composer")) {
        node.classList.remove("user-message-bubble");
        return;
      }
      if (node.className.includes("bg-gray-50") || node.className.includes("dark:bg-gray-850")) {
        addClass(node, "user-message-bubble");
      }
    });
    document.querySelectorAll('[role="dialog"][aria-modal="true"]').forEach((dialog) => {
      addClass(dialog.querySelector(":scope > div"), "app-modal-surface");
    });
    document.querySelectorAll('[role="dialog"] .rounded-2xl, [role="alertdialog"] .rounded-2xl').forEach((node) => {
      if (node.className.includes("dark:bg-gray-900") || node.className.includes("bg-gray-50")) {
        addClass(node, "app-confirm-dialog");
        addClass(node, "app-modal-surface");
      }
    });
    document.querySelectorAll("div.mt-auto.w-full").forEach((node) => {
      if (node.className.includes("dark:bg-gray-900") || node.className.includes("bg-gray-50")) {
        addClass(node, "app-drawer-surface");
      }
    });
    document.querySelectorAll('[role="status"][aria-live="polite"]').forEach((node) => {
      addClass(node, "app-notification-toast");
    });
  };
  var syncSuggestions = () => {
    const welcome = document.querySelector(".chat-welcome");
    if (!welcome) return;
    const editor = document.getElementById("chat-input");
    const typing = Boolean(editor?.innerText?.trim() || editor?.textContent?.trim());
    welcome.querySelectorAll(".suggestion-frame, .chat-welcome-suggestions").forEach((node) => {
      if (typing) {
        node.style.setProperty("opacity", "0", "important");
        node.style.setProperty("visibility", "hidden", "important");
        node.style.setProperty("pointer-events", "none", "important");
      } else {
        node.style.removeProperty("opacity");
        node.style.removeProperty("visibility");
        node.style.removeProperty("pointer-events");
      }
    });
  };
  var applyHooks = () => {
    markChrome();
    const welcome = markWelcome();
    syncSuggestions();
    return welcome;
  };
  var observeHooks = (onChange) => {
    let scheduled = false;
    const run = () => {
      scheduled = false;
      const welcome = applyHooks();
      onChange?.(welcome);
    };
    run();
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(run);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener("input", syncSuggestions, true);
    document.addEventListener("keyup", syncSuggestions, true);
    return observer;
  };

  // src/pearl.js
  var pearl;
  var anchor;
  var resizeObserver;
  var playing = false;
  var pearlImageForMode = () => getGravityMode() === "pearl" ? `url('${PEARL_IMAGE}')` : "none";
  var applyPearlMode = () => {
    pearl?.style.setProperty("--pearl-image", pearlImageForMode());
  };
  var PEARL_SHIFT_X = 52;
  var place = () => {
    if (!anchor || !pearl) return;
    const rect = anchor.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const left = rect.left - PEARL_SHIFT_X;
    pearl.style.position = "fixed";
    pearl.style.left = `${left}px`;
    pearl.style.top = `${rect.top}px`;
    pearl.style.margin = "0";
    pearl.style.zIndex = "60";
    pearl.style.setProperty("--fx", `${window.innerWidth / 2 - (left + rect.width / 2)}px`);
    pearl.style.setProperty("--fy", `${window.innerHeight / 2 - (rect.top + rect.height / 2)}px`);
  };
  var track = (event) => {
    const rect = pearl.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    pearl.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
    pearl.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
    const inset = 0.276;
    const inner = 1 - inset * 2;
    pearl.style.setProperty("--ix", `${((x - inset) / inner * 100).toFixed(1)}%`);
    pearl.style.setProperty("--iy", `${((y - inset) / inner * 100).toFixed(1)}%`);
  };
  var pulse = () => {
    pearl.classList.remove("is-pulse");
    void pearl.offsetWidth;
    pearl.classList.add("is-pulse");
  };
  var buildPearl = () => {
    const node = document.createElement("span");
    node.className = "pearl";
    node.setAttribute("aria-hidden", "true");
    node.style.setProperty("--pearl-image", pearlImageForMode());
    node.innerHTML = `
		<i class="pearl-current"></i>
		<i class="pearl-aura"></i>
		<i class="pearl-glow"></i>
		<i class="pearl-bloom"></i>
		<i class="pearl-ripples"><b></b><b></b><b></b></i>
		<i class="pearl-touch"></i>
		<i class="pearl-halo pearl-halo-b"></i>
		<i class="pearl-halo"></i>
		<i class="pearl-core"></i>
		<i class="pearl-flow"></i>
		<i class="pearl-flow2"></i>
		<i class="pearl-sheen"></i>
		<i class="pearl-touch-in"></i>
		<button type="button" class="pearl-hit" aria-hidden="true" tabindex="-1"></button>
	`;
    const hit = node.querySelector(".pearl-hit");
    hit.addEventListener("pointerenter", (event) => {
      track(event);
      node.classList.add("is-touch");
    });
    hit.addEventListener("pointermove", track);
    hit.addEventListener("pointerleave", () => node.classList.remove("is-touch"));
    hit.addEventListener("click", pulse);
    return node;
  };
  window.addEventListener("gravity:modechange", applyPearlMode);
  var unmountPearl = () => {
    playing = false;
    resizeObserver?.disconnect();
    resizeObserver = void 0;
    window.removeEventListener("resize", place);
    pearl?.remove();
    anchor?.remove();
    document.querySelectorAll(".pearl-pool").forEach((node) => node.remove());
    pearl = void 0;
    anchor = void 0;
  };
  var mountPearl = (welcome) => {
    if (!welcome) {
      unmountPearl();
      return;
    }
    if (pearl && welcome.contains(anchor)) {
      place();
      return;
    }
    unmountPearl();
    const host = welcome.querySelector(".chat-welcome-model") || welcome.querySelector("h2")?.parentElement;
    if (!host) return;
    anchor = document.createElement("span");
    anchor.className = "pearl-anchor";
    anchor.setAttribute("aria-hidden", "true");
    host.appendChild(anchor);
    const poolA = document.createElement("span");
    poolA.className = "pearl-pool pearl-pool-a";
    poolA.setAttribute("aria-hidden", "true");
    const poolB = document.createElement("span");
    poolB.className = "pearl-pool pearl-pool-b";
    poolB.setAttribute("aria-hidden", "true");
    document.body.append(poolA, poolB);
    pearl = buildPearl();
    document.body.appendChild(pearl);
    place();
    resizeObserver = new ResizeObserver(() => place());
    resizeObserver.observe(anchor);
    const container = document.getElementById("chat-container");
    if (container) resizeObserver.observe(container);
    window.addEventListener("resize", place);
    if (!reducedMotion()) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          playing = true;
          place();
          pearl.classList.add("pearl--enter");
          document.documentElement.classList.add("pl-enter");
        });
      });
    }
  };

  // src/index.js
  var boot = () => {
    if (window.__gravityEclipse) return;
    window.__gravityEclipse = true;
    window.__gravityEclipseBuild = "route-ready-2026-11-10";
    applyRootTheme();
    const outsideApp = /\/(auth|error|watch|s)(\/|$)/.test(window.location.pathname);
    if (outsideApp) {
      document.documentElement.classList.add("gravity-ready");
    } else {
      document.documentElement.classList.add("gravity-booting");
    }
    mountField();
    const themeGuard = new MutationObserver(() => applyRootTheme());
    themeGuard.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    let revealed = false;
    let routeReadyTimer;
    const setReady = () => {
      if (!document.documentElement.classList.contains("gravity-ready")) {
        performance.mark("gravity-ready");
        document.documentElement.dataset.gravityReadyAt = performance.now().toFixed(1);
      }
      if (routeReadyTimer) window.clearInterval(routeReadyTimer);
      document.documentElement.classList.remove("gravity-booting");
      document.documentElement.classList.add("gravity-ready");
    };
    const revealWithoutEntrance = () => {
      if (revealed) return;
      revealed = true;
      setReady();
    };
    const reveal = (welcome) => {
      if (revealed || !welcome || !document.getElementById("message-input-container")) return;
      revealed = true;
      mountPearl(welcome);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setReady();
        });
      });
    };
    const isNonWelcomePageReady = () => {
      const path = window.location.pathname.replace(/\/+$/, "") || "/";
      const appBasePath = (window.__gravityAppBasePath ?? "/").replace(/\/+$/, "") || "/";
      return path !== appBasePath && Boolean(document.querySelector(".app-shell, #auth-page"));
    };
    observeHooks((welcome) => {
      if (isNonWelcomePageReady()) {
        if (!revealed) revealWithoutEntrance();
        else if (revealed) mountPearl(null);
        return;
      }
      if (welcome) {
        if (!revealed) reveal(welcome);
        else mountPearl(welcome);
      } else if (revealed) {
        mountPearl(null);
      }
    });
    routeReadyTimer = window.setInterval(() => {
      if (revealed) {
        window.clearInterval(routeReadyTimer);
      } else if (isNonWelcomePageReady()) {
        revealWithoutEntrance();
      }
    }, 25);
    const finishBoot = () => {
      if (revealed) return;
      revealed = true;
      setReady();
    };
    if (outsideApp) revealed = true;
    const scheduleReveal = () => window.setTimeout(finishBoot, 8e3);
    if (document.readyState === "complete") scheduleReveal();
    else window.addEventListener("load", scheduleReveal, { once: true });
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
