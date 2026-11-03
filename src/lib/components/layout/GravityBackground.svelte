<div class="gravity-atmosphere" aria-hidden="true">
	<div class="gravity-atmosphere__mesh"></div>
	<div class="gravity-atmosphere__particles gravity-atmosphere__particles--near"></div>
	<div class="gravity-atmosphere__particles gravity-atmosphere__particles--far"></div>
	<div class="gravity-atmosphere__orbit gravity-atmosphere__orbit--wide"></div>
	<div class="gravity-atmosphere__orbit gravity-atmosphere__orbit--tight"></div>
	<div class="gravity-atmosphere__horizon"></div>
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
		isolation: isolate;
	}

	:global(html.gravity) .gravity-atmosphere {
		display: block;
	}

	.gravity-atmosphere__mesh,
	.gravity-atmosphere__particles,
	.gravity-atmosphere__orbit,
	.gravity-atmosphere__horizon {
		position: absolute;
	}

	.gravity-atmosphere__mesh {
		inset: -20%;
		background:
			var(--gravity-gradient-aurora), var(--gravity-gradient-ambient),
			var(--gravity-gradient-vignette);
		filter: saturate(112%);
		animation: gravity-breathe 16s ease-in-out infinite alternate;
	}

	.gravity-atmosphere__particles {
		inset: -12%;
		background-image: var(--gravity-particle-texture);
		transform-origin: 50% 70%;
	}

	.gravity-atmosphere__particles--near {
		background-size: 11rem 9rem;
		opacity: 0.34;
		mask-image: linear-gradient(to bottom, transparent 3%, black 34%, black 78%, transparent 100%);
		-webkit-mask-image: linear-gradient(
			to bottom,
			transparent 3%,
			black 34%,
			black 78%,
			transparent 100%
		);
		animation: gravity-drift 28s linear infinite;
	}

	.gravity-atmosphere__particles--far {
		background-size: 17rem 14rem;
		opacity: 0.2;
		filter: blur(0.35px);
		mask-image: radial-gradient(ellipse at 56% 62%, black, transparent 72%);
		-webkit-mask-image: radial-gradient(ellipse at 56% 62%, black, transparent 72%);
		animation: gravity-drift-reverse 40s linear infinite;
	}

	.gravity-atmosphere__orbit {
		left: 50%;
		top: 61%;
		border: 1px solid var(--gravity-orbit-line);
		border-radius: 50%;
		box-shadow:
			0 0 3rem var(--gravity-orbit-glow),
			inset 0 0 2rem var(--gravity-orbit-glow);
		mask-image: linear-gradient(90deg, transparent 2%, black 27%, black 73%, transparent 98%);
		-webkit-mask-image: linear-gradient(
			90deg,
			transparent 2%,
			black 27%,
			black 73%,
			transparent 98%
		);
		transform: translate(-50%, -50%) rotate(-8deg);
	}

	.gravity-atmosphere__orbit--wide {
		width: 112vw;
		height: 39vw;
		min-height: 22rem;
		animation: gravity-orbit 24s ease-in-out infinite alternate;
	}

	.gravity-atmosphere__orbit--tight {
		width: 76vw;
		height: 24vw;
		min-height: 14rem;
		opacity: 0.48;
		transform: translate(-50%, -50%) rotate(7deg);
		animation: gravity-orbit-tight 20s ease-in-out infinite alternate;
	}

	.gravity-atmosphere__horizon {
		inset-inline: -10%;
		bottom: -34%;
		height: 64%;
		border-radius: 50% 50% 0 0;
		background: var(--gravity-gradient-horizon);
		filter: blur(2.2rem);
		opacity: 0.7;
	}

	@keyframes gravity-breathe {
		from {
			transform: scale(1) translate3d(-1%, -0.5%, 0);
		}
		to {
			transform: scale(1.04) translate3d(1%, 0.75%, 0);
		}
	}

	@keyframes gravity-drift {
		from {
			transform: rotate(-2deg) translate3d(-1.5%, 0, 0);
		}
		to {
			transform: rotate(2deg) translate3d(1.5%, -2%, 0);
		}
	}

	@keyframes gravity-drift-reverse {
		from {
			transform: rotate(3deg) translate3d(1%, -1%, 0);
		}
		to {
			transform: rotate(-2deg) translate3d(-1%, 1.5%, 0);
		}
	}

	@keyframes gravity-orbit {
		from {
			transform: translate(-50%, -50%) rotate(-8deg) scale(0.98);
			opacity: 0.42;
		}
		to {
			transform: translate(-50%, -50%) rotate(-5deg) scale(1.025);
			opacity: 0.72;
		}
	}

	@keyframes gravity-orbit-tight {
		from {
			transform: translate(-50%, -50%) rotate(7deg) scale(1.02);
		}
		to {
			transform: translate(-50%, -50%) rotate(4deg) scale(0.97);
		}
	}

	@media (max-width: 48rem) {
		.gravity-atmosphere__mesh {
			inset: -10% -65%;
			animation-duration: 24s;
		}

		.gravity-atmosphere__particles--far,
		.gravity-atmosphere__orbit--tight {
			display: none;
		}

		.gravity-atmosphere__orbit--wide {
			width: 180vw;
			height: 72vw;
		}

		.gravity-atmosphere__orbit--tight {
			width: 136vw;
			height: 52vw;
		}

		.gravity-atmosphere__horizon {
			bottom: -18%;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.gravity-atmosphere__mesh {
			animation: none;
		}

		.gravity-atmosphere__particles,
		.gravity-atmosphere__orbit {
			display: none;
		}

		.gravity-atmosphere__horizon {
			filter: blur(1rem);
		}
	}
</style>
