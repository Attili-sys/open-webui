<script lang="ts">
	import { onDestroy, onMount } from 'svelte';

	import { theme } from '$lib/stores';
	import {
		createGravityFlowRenderer,
		type GravityFlowRenderer
	} from '$lib/utils/gravityFlowRenderer';

	let canvas: HTMLCanvasElement;
	let renderer: GravityFlowRenderer | null = null;
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
			renderer = createGravityFlowRenderer(canvas, { reducedMotion });
			sizeToWindow();
		}
		raf = requestAnimationFrame(tick);
	};

	const stop = () => {
		if (raf) cancelAnimationFrame(raf);
		raf = 0;
	};

	// Only the Gravity Flow theme pays for the GPU work.
	$: if (mounted) {
		if ($theme === 'gravity-flow') start();
		else stop();
	}

	const onResize = () => {
		clearTimeout(resizeTimer);
		resizeTimer = setTimeout(() => {
			sizeToWindow();
			if ($theme === 'gravity-flow') start();
		}, 120);
	};

	const onPointerMove = (event: PointerEvent) => {
		if (reducedMotion) return;
		renderer?.setPointer(event.clientX, event.clientY);
		if ($theme === 'gravity-flow') start();
	};

	const onPointerOut = (event: PointerEvent) => {
		if (!event.relatedTarget) renderer?.clearPointer();
	};

	const onVisibility = () => {
		if (!document.hidden && $theme === 'gravity-flow') start();
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

<div class="gravity-flow-atmosphere" aria-hidden="true">
	<canvas class="gravity-flow-atmosphere__canvas" bind:this={canvas}></canvas>
</div>

<style>
	.gravity-flow-atmosphere {
		position: fixed;
		inset: 0;
		z-index: 0;
		display: none;
		overflow: hidden;
		pointer-events: none;
		background: var(--gravity-gradient-canvas);
		contain: strict;
	}

	:global(html.gravity-flow) .gravity-flow-atmosphere {
		display: block;
	}

	.gravity-flow-atmosphere__canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}
</style>
