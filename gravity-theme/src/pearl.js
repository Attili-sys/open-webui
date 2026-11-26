import { getGravityMode, PEARL_IMAGE, reducedMotion } from './theme.js';

let pearl;
let anchor;
let resizeObserver;
let playing = false;

const pearlImageForMode = () =>
	getGravityMode() === 'pearl' ? `url('${PEARL_IMAGE}')` : 'none';

const applyPearlMode = () => {
	pearl?.style.setProperty('--pearl-image', pearlImageForMode());
};

const PEARL_SHIFT_X = 52;

const place = () => {
	if (!anchor || !pearl) return;
	const rect = anchor.getBoundingClientRect();
	if (!rect.width || !rect.height) return;
	const left = rect.left - PEARL_SHIFT_X;
	pearl.style.position = 'fixed';
	pearl.style.left = `${left}px`;
	pearl.style.top = `${rect.top}px`;
	pearl.style.margin = '0';
	pearl.style.zIndex = '60';
	pearl.style.setProperty('--fx', `${window.innerWidth / 2 - (left + rect.width / 2)}px`);
	pearl.style.setProperty('--fy', `${window.innerHeight / 2 - (rect.top + rect.height / 2)}px`);
};

const track = (event) => {
	const rect = pearl.getBoundingClientRect();
	if (!rect.width || !rect.height) return;
	const x = (event.clientX - rect.left) / rect.width;
	const y = (event.clientY - rect.top) / rect.height;
	pearl.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
	pearl.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
	const inset = 0.276;
	const inner = 1 - inset * 2;
	pearl.style.setProperty('--ix', `${(((x - inset) / inner) * 100).toFixed(1)}%`);
	pearl.style.setProperty('--iy', `${(((y - inset) / inner) * 100).toFixed(1)}%`);
};

const pulse = () => {
	pearl.classList.remove('is-pulse');
	void pearl.offsetWidth;
	pearl.classList.add('is-pulse');
};

const buildPearl = () => {
	const node = document.createElement('span');
	node.className = 'pearl';
	node.setAttribute('aria-hidden', 'true');
	node.style.setProperty('--pearl-image', pearlImageForMode());
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
	const hit = node.querySelector('.pearl-hit');
	hit.addEventListener('pointerenter', (event) => {
		track(event);
		node.classList.add('is-touch');
	});
	hit.addEventListener('pointermove', track);
	hit.addEventListener('pointerleave', () => node.classList.remove('is-touch'));
	hit.addEventListener('click', pulse);
	return node;
};

window.addEventListener('gravity:modechange', applyPearlMode);

export const unmountPearl = () => {
	playing = false;
	resizeObserver?.disconnect();
	resizeObserver = undefined;
	window.removeEventListener('resize', place);
	pearl?.remove();
	anchor?.remove();
	document.querySelectorAll('.pearl-pool').forEach((node) => node.remove());
	pearl = undefined;
	anchor = undefined;
};

export const mountPearl = (welcome) => {
	if (!welcome) {
		unmountPearl();
		return;
	}
	if (pearl && welcome.contains(anchor)) {
		place();
		return;
	}

	unmountPearl();
	const host = welcome.querySelector('.chat-welcome-model') || welcome.querySelector('h2')?.parentElement;
	if (!host) return;

	anchor = document.createElement('span');
	anchor.className = 'pearl-anchor';
	anchor.setAttribute('aria-hidden', 'true');
	host.appendChild(anchor);

	const poolA = document.createElement('span');
	poolA.className = 'pearl-pool pearl-pool-a';
	poolA.setAttribute('aria-hidden', 'true');
	const poolB = document.createElement('span');
	poolB.className = 'pearl-pool pearl-pool-b';
	poolB.setAttribute('aria-hidden', 'true');
	// Keep fixed pools on the viewport. The welcome container is translated,
	// which would otherwise make fixed positioning relative to the centered UI.
	document.body.append(poolA, poolB);

	pearl = buildPearl();
	document.body.appendChild(pearl);
	place();

	resizeObserver = new ResizeObserver(() => place());
	resizeObserver.observe(anchor);
	const container = document.getElementById('chat-container');
	if (container) resizeObserver.observe(container);
	window.addEventListener('resize', place);

	if (!reducedMotion()) {
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				playing = true;
				place();
				pearl.classList.add('pearl--enter');
				document.documentElement.classList.add('pl-enter');
			});
		});
	}
};

export const pearlIsPlaying = () => playing;
