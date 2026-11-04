<script lang="ts">
	import { onDestroy, onMount } from 'svelte';

	import { theme } from '$lib/stores';
	import {
		createGravityCurrentRenderer,
		type GravityCurrentRenderer
	} from '$lib/utils/gravityCurrentRenderer';

	let atmosphere: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let renderer: GravityCurrentRenderer | null = null;
	let mounted = false;
	let reducedMotion = false;
	let paused = false;
	let raf = 0;
	let fieldRaf = 0;
	let resizeTimer: ReturnType<typeof setTimeout> | undefined;
	let targetX = 0;
	let targetY = 0;
	let currentX = 0;
	let currentY = 0;

	const paint = () => {
		raf = 0;
		if (!mounted || $theme !== 'gravity-eclipse' || document.hidden) return;

		currentX += (targetX - currentX) * 0.035;
		currentY += (targetY - currentY) * 0.035;
		atmosphere.style.setProperty('--eclipse-shift-x', `${currentX * 18}px`);
		atmosphere.style.setProperty('--eclipse-shift-y', `${currentY * 12}px`);

		if (
			!reducedMotion &&
			(Math.abs(targetX - currentX) > 0.001 || Math.abs(targetY - currentY) > 0.001)
		) {
			raf = requestAnimationFrame(paint);
		}
	};

	const sizeField = () => {
		renderer?.resize(
			window.innerWidth,
			window.innerHeight,
			Math.min(window.devicePixelRatio || 1, 2)
		);
	};

	const tickField = (time: number) => {
		fieldRaf = 0;
		if (!renderer || document.hidden || $theme !== 'gravity-eclipse' || canvas.clientWidth === 0) {
			return;
		}
		renderer.frame(time);
		if (!reducedMotion) fieldRaf = requestAnimationFrame(tickField);
	};

	const startField = () => {
		if (!mounted || fieldRaf || $theme !== 'gravity-eclipse') return;
		if (!renderer) {
			renderer = createGravityCurrentRenderer(canvas, {
				reducedMotion,
				treatment: 'eclipse'
			});
			sizeField();
		}
		fieldRaf = requestAnimationFrame(tickField);
	};

	const stopField = () => {
		if (fieldRaf) cancelAnimationFrame(fieldRaf);
		fieldRaf = 0;
	};

	const start = () => {
		if (!mounted || $theme !== 'gravity-eclipse') return;
		if (!raf) raf = requestAnimationFrame(paint);
		startField();
	};

	const onPointerMove = (event: PointerEvent) => {
		if ($theme !== 'gravity-eclipse') return;
		if (!reducedMotion) {
			targetX = (event.clientX / window.innerWidth - 0.5) * 2;
			targetY = (event.clientY / window.innerHeight - 0.5) * 2;
			renderer?.setPointer(event.clientX, event.clientY);
		}
		start();
	};

	const onPointerOut = (event: PointerEvent) => {
		if (event.relatedTarget) return;
		targetX = 0;
		targetY = 0;
		renderer?.clearPointer();
		start();
	};

	const onResize = () => {
		clearTimeout(resizeTimer);
		resizeTimer = setTimeout(() => {
			sizeField();
			start();
		}, 120);
	};

	const onVisibility = () => {
		paused = document.hidden;
		if (!document.hidden) start();
	};

	$: if (mounted) {
		if ($theme === 'gravity-eclipse') start();
		else {
			if (raf) cancelAnimationFrame(raf);
			raf = 0;
			stopField();
		}
	}

	onMount(() => {
		reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		mounted = true;
		window.addEventListener('resize', onResize);
		window.addEventListener('pointermove', onPointerMove, { passive: true });
		document.addEventListener('pointerout', onPointerOut);
		document.addEventListener('visibilitychange', onVisibility);
		start();
	});

	onDestroy(() => {
		mounted = false;
		if (raf) cancelAnimationFrame(raf);
		stopField();
		clearTimeout(resizeTimer);
		renderer?.destroy();
		renderer = null;
		window.removeEventListener('resize', onResize);
		window.removeEventListener('pointermove', onPointerMove);
		document.removeEventListener('pointerout', onPointerOut);
		document.removeEventListener('visibilitychange', onVisibility);
	});
</script>

<div
	class="gravity-eclipse-atmosphere"
	class:is-paused={paused || reducedMotion}
	bind:this={atmosphere}
	aria-hidden="true"
>
	<div class="gravity-eclipse-atmosphere__halo"></div>
	<div class="gravity-eclipse-atmosphere__core"></div>
	<div class="gravity-eclipse-atmosphere__current"></div>
	<div class="gravity-eclipse-atmosphere__veil"></div>
	<canvas class="gravity-eclipse-atmosphere__canvas" bind:this={canvas}></canvas>
</div>

<style>
	.gravity-eclipse-atmosphere {
		--eclipse-shift-x: 0px;
		--eclipse-shift-y: 0px;
		position: fixed;
		inset: 0;
		z-index: 0;
		display: none;
		overflow: hidden;
		pointer-events: none;
		background:
			radial-gradient(ellipse 76% 66% at 57% 51%, rgb(13 25 70 / 0.28), transparent 65%),
			linear-gradient(120deg, #111214 0%, #0d0e10 46%, #101113 100%);
		contain: strict;
	}

	:global(html.gravity-eclipse) .gravity-eclipse-atmosphere {
		display: block;
	}

	:global(html.gravity-eclipse.high-contrast) .gravity-eclipse-atmosphere {
		display: none;
	}

	.gravity-eclipse-atmosphere::after {
		content: '';
		position: absolute;
		z-index: 1;
		inset: 0;
		background: radial-gradient(
			ellipse 62% 55% at 57% 50%,
			transparent 32%,
			rgb(0 0 0 / 0.56) 100%
		);
	}

	.gravity-eclipse-atmosphere__halo,
	.gravity-eclipse-atmosphere__core,
	.gravity-eclipse-atmosphere__current,
	.gravity-eclipse-atmosphere__veil {
		position: absolute;
		left: calc(57% + var(--eclipse-shift-x));
		top: calc(53% + var(--eclipse-shift-y));
		border-radius: 50%;
		transform: translate(-50%, -50%);
		will-change: transform, opacity;
	}

	.gravity-eclipse-atmosphere__halo {
		width: min(78rem, 86vw);
		aspect-ratio: 2.05 / 1;
		background: radial-gradient(
			ellipse,
			rgb(36 86 214 / 0.42) 0%,
			rgb(24 62 176 / 0.28) 34%,
			rgb(12 30 91 / 0.14) 62%,
			transparent 78%
		);
		filter: blur(3.6rem);
		animation: eclipse-breathe 11s ease-in-out infinite alternate;
	}

	.gravity-eclipse-atmosphere__core {
		width: min(52rem, 58vw);
		aspect-ratio: 2.2 / 1;
		background:
			radial-gradient(ellipse at 42% 48%, rgb(72 122 255 / 0.62), transparent 46%),
			radial-gradient(ellipse at 70% 56%, rgb(28 68 190 / 0.46), transparent 58%);
		filter: blur(2.4rem);
		animation: eclipse-drift 17s ease-in-out infinite alternate;
	}

	.gravity-eclipse-atmosphere__current {
		width: min(28rem, 34vw);
		aspect-ratio: 1.7 / 1;
		background: radial-gradient(
			ellipse,
			rgb(126 164 255 / 0.72) 0%,
			rgb(62 108 245 / 0.34) 42%,
			transparent 72%
		);
		filter: blur(1.8rem);
		animation: eclipse-current 13s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite alternate;
	}

	.gravity-eclipse-atmosphere__canvas {
		position: absolute;
		z-index: 2;
		inset: 0;
		width: 100%;
		height: 100%;
	}

	.gravity-eclipse-atmosphere__veil {
		width: min(70rem, 76vw);
		aspect-ratio: 2.35 / 1;
		border: 1px solid rgb(110 146 240 / 0.08);
		box-shadow:
			0 0 5rem rgb(42 86 210 / 0.16),
			inset 0 0 6rem rgb(70 112 235 / 0.1);
		filter: blur(0.8rem);
		animation: eclipse-veil 19s ease-in-out infinite alternate;
	}

	.gravity-eclipse-atmosphere.is-paused :is(div) {
		animation-play-state: paused;
	}

	@keyframes eclipse-breathe {
		from {
			opacity: 0.62;
			transform: translate(-50%, -50%) scale(0.94);
		}
		to {
			opacity: 1;
			transform: translate(-50%, -50%) scale(1.06);
		}
	}

	@keyframes eclipse-drift {
		from {
			opacity: 0.48;
			transform: translate(-58%, -46%) scale(0.94);
		}
		to {
			opacity: 0.92;
			transform: translate(-42%, -54%) scale(1.08);
		}
	}

	@keyframes eclipse-current {
		from {
			opacity: 0.28;
			transform: translate(-92%, -58%) scale(0.86);
		}
		to {
			opacity: 0.86;
			transform: translate(-18%, -42%) scale(1.12);
		}
	}

	@keyframes eclipse-veil {
		from {
			opacity: 0.35;
		}
		to {
			opacity: 0.8;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.gravity-eclipse-atmosphere__halo,
		.gravity-eclipse-atmosphere__core,
		.gravity-eclipse-atmosphere__current,
		.gravity-eclipse-atmosphere__veil {
			animation: none;
		}
	}
</style>
