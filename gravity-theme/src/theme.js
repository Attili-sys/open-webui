export const ROOT_CLASSES = [
	'dark',
	'gravity',
	'gravity-flow',
	'gravity-field',
	'gravity-eclipse',
	'gravity-eclipse-2',
	'eclipse-pearl'
];

const gravityAssetBase =
	window.__gravityAssetBase ?? new URL('/static/gravity/', window.location.origin).href;

export const PEARL_IMAGE = new URL('ask-pearl-day-600.webp', gravityAssetBase).href;
export const GRAVITY_MODE_KEY = 'gravityThemeMode';

export const getGravityMode = () =>
	localStorage.getItem(GRAVITY_MODE_KEY) === 'pearl' ? 'pearl' : 'eclipse';

export const applyRootTheme = () => {
	const root = document.documentElement;
	const needsLightRemoved = root.classList.contains('light');
	const missing = ROOT_CLASSES.some((name) => !root.classList.contains(name));
	if (needsLightRemoved) root.classList.remove('light');
	if (missing) ROOT_CLASSES.forEach((name) => root.classList.add(name));
	// A forced toggle only writes when the class changes, so the observer can settle.
	root.classList.toggle('gravity-pearl', getGravityMode() === 'pearl');
	document
		.querySelector('meta[name="theme-color"]')
		?.setAttribute('content', '#101113');
};

export const setGravityMode = (mode) => {
	const nextMode = mode === 'pearl' ? 'pearl' : 'eclipse';
	localStorage.setItem(GRAVITY_MODE_KEY, nextMode);
	applyRootTheme();
	window.dispatchEvent(new CustomEvent('gravity:modechange', { detail: { mode: nextMode } }));
};

export const reducedMotion = () =>
	window.matchMedia('(prefers-reduced-motion: reduce)').matches;
