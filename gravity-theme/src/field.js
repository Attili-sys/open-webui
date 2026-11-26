import { createGravityCurrentRenderer, GRAVITY_PEARL_GRADE } from './renderer/gravityCurrentRenderer.ts';
import { getGravityMode, reducedMotion } from './theme.js';

export const mountField = () => {
	if (document.querySelector('.gravity-eclipse-atmosphere')) {
		return document.querySelector('.gravity-eclipse-atmosphere');
	}

	const atmosphere = document.createElement('div');
	atmosphere.className = 'gravity-eclipse-atmosphere';
	atmosphere.setAttribute('aria-hidden', 'true');
	atmosphere.innerHTML = `
		<div class="gravity-eclipse-atmosphere__halo"></div>
		<div class="gravity-eclipse-atmosphere__core"></div>
		<div class="gravity-eclipse-atmosphere__current"></div>
		<div class="gravity-eclipse-atmosphere__veil"></div>
		<canvas class="gravity-eclipse-atmosphere__canvas"></canvas>
	`;
	document.body.prepend(atmosphere);

	const canvas = atmosphere.querySelector('canvas');
	const motionOff = reducedMotion();
	if (motionOff) atmosphere.classList.add('is-paused');

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
		atmosphere.style.setProperty('--eclipse-shift-x', `${currentX * 18}px`);
		atmosphere.style.setProperty('--eclipse-shift-y', `${currentY * 12}px`);
		if (
			!motionOff &&
			(Math.abs(targetX - currentX) > 0.001 || Math.abs(targetY - currentY) > 0.001)
		) {
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
	window.addEventListener('gravity:modechange', applyFieldMode);

	window.addEventListener(
		'pointermove',
		(event) => {
			if (motionOff) return;
			targetX = (event.clientX / window.innerWidth - 0.5) * 2;
			targetY = (event.clientY / window.innerHeight - 0.5) * 2;
			renderer?.setPointer(event.clientX, event.clientY);
			start();
		},
		{ passive: true }
	);

	document.addEventListener('pointerout', (event) => {
		if (event.relatedTarget) return;
		targetX = 0;
		targetY = 0;
		renderer?.clearPointer();
		start();
	});

	window.addEventListener('resize', () => {
		clearTimeout(resizeTimer);
		resizeTimer = setTimeout(() => {
			sizeField();
			start();
		}, 120);
	});

	document.addEventListener('visibilitychange', () => {
		atmosphere.classList.toggle('is-paused', document.hidden || motionOff);
		if (!document.hidden) start();
	});

	return atmosphere;
};
