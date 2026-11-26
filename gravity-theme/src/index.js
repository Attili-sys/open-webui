import { applyRootTheme } from './theme.js';
import { mountField } from './field.js';
import { observeHooks } from './hooks.js';
import { mountPearl } from './pearl.js';

const boot = () => {
	if (window.__gravityEclipse) return;
	window.__gravityEclipse = true;
	window.__gravityEclipseBuild = 'route-ready-2026-11-10';

	applyRootTheme();
	const outsideApp = /\/(auth|error|watch|s)(\/|$)/.test(window.location.pathname);
	if (outsideApp) {
		document.documentElement.classList.add('gravity-ready');
	} else {
		document.documentElement.classList.add('gravity-booting');
	}
	mountField();

	const themeGuard = new MutationObserver(() => applyRootTheme());
	themeGuard.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

	let revealed = false;
	let routeReadyTimer;
	const setReady = () => {
		if (!document.documentElement.classList.contains('gravity-ready')) {
			performance.mark('gravity-ready');
			document.documentElement.dataset.gravityReadyAt = performance.now().toFixed(1);
		}
		if (routeReadyTimer) window.clearInterval(routeReadyTimer);
		document.documentElement.classList.remove('gravity-booting');
		document.documentElement.classList.add('gravity-ready');
	};

	const revealWithoutEntrance = () => {
		if (revealed) return;
		revealed = true;
		setReady();
	};

	const reveal = (welcome) => {
		if (revealed || !welcome || !document.getElementById('message-input-container')) return;
		revealed = true;
		mountPearl(welcome);
		requestAnimationFrame(() => {
			// mountPearl arms the entrance on its second animation frame.
			// Release the first-paint curtain in that same frame, after the
			// entrance styles are active, so hydrated UI never flashes first.
			requestAnimationFrame(() => {
				setReady();
			});
		});
	};

	const isNonWelcomePageReady = () => {
		const path = window.location.pathname.replace(/\/+$/, '') || '/';
		const appBasePath =
			(window.__gravityAppBasePath ?? '/').replace(/\/+$/, '') || '/';
		return (
			path !== appBasePath &&
			Boolean(document.querySelector('.app-shell, #auth-page'))
		);
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

	const scheduleReveal = () => window.setTimeout(finishBoot, 8000);
	if (document.readyState === 'complete') scheduleReveal();
	else window.addEventListener('load', scheduleReveal, { once: true });
};

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
	boot();
}
