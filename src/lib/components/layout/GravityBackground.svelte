<script lang="ts">
	import { onDestroy, onMount } from 'svelte';

	import { theme } from '$lib/stores';
	import { createGravityRenderer, type GravityRenderer } from '$lib/utils/gravityRenderer';

	let canvas: HTMLCanvasElement;
	let renderer: GravityRenderer | null = null;
	let raf = 0;
	let resizeTimer: ReturnType<typeof setTimeout> | undefined;
	let reducedMotion = false;
	let mounted = false;

	const sizeToWindow = () => {
		renderer?.resize(
			window.innerWidth,
			window.innerHeight,
			Math.min(window.devicePixelRatio || 1, 2)
		);
	};

	const tick = (time: number) => {
		raf = 0;
		if (!renderer || document.hidden || canvas.clientWidth === 0) return;
		renderer.frame(time);
		if (!reducedMotion) raf = requestAnimationFrame(tick);
	};

	const start = () => {
		if (!mounted || raf) return;
		if (!renderer) {
			renderer = createGravityRenderer(canvas, { reducedMotion });
			sizeToWindow();
		}
		raf = requestAnimationFrame(tick);
	};

	const stop = () => {
		if (raf) cancelAnimationFrame(raf);
		raf = 0;
	};

	// Only the Gravity theme pays for the GPU work.
	$: if (mounted) {
		if ($theme === 'gravity') start();
		else stop();
	}

	const onResize = () => {
		clearTimeout(resizeTimer);
		resizeTimer = setTimeout(() => {
			sizeToWindow();
			if ($theme === 'gravity') start();
		}, 120);
	};

	const onPointerMove = (event: PointerEvent) => {
		if (reducedMotion) return;
		renderer?.setPointer(event.clientX, event.clientY);
		if ($theme === 'gravity') start();
	};

	const onPointerOut = (event: PointerEvent) => {
		if (!event.relatedTarget) renderer?.clearPointer();
	};

	const onVisibility = () => {
		if (!document.hidden && $theme === 'gravity') start();
	};

	onMount(() => {
		reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		mounted = true;

		window.addEventListener('resize', onResize);
		window.addEventListener('pointermove', onPointerMove, { passive: true });
		document.addEventListener('pointerout', onPointerOut);
		document.addEventListener('visibilitychange', onVisibility);
	});

	onDestroy(() => {
		stop();
		clearTimeout(resizeTimer);
		renderer?.destroy();
		renderer = null;
		if (typeof window === 'undefined') return;
		window.removeEventListener('resize', onResize);
		window.removeEventListener('pointermove', onPointerMove);
		document.removeEventListener('pointerout', onPointerOut);
		document.removeEventListener('visibilitychange', onVisibility);
	});
</script>

<div class="gravity-atmosphere" aria-hidden="true">
	<canvas class="gravity-atmosphere__canvas" bind:this={canvas}></canvas>
</div>

<style>
	.gravity-atmosphere {
		position: fixed;
		inset: 0;
		z-index: 0;
		display: none;
		overflow: hidden;
		pointer-events: none;
		background: var(--gravity-gradient-canvas);
		contain: strict;
	}

	:global(html.gravity:not(.gravity-flow)) .gravity-atmosphere {
		display: block;
	}

	.gravity-atmosphere__canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}
</style>
