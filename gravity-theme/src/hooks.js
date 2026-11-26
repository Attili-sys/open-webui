import { getGravityMode, setGravityMode } from './theme.js';

const addClass = (node, name) => {
	if (node && !node.classList.contains(name)) node.classList.add(name);
};

let welcomeRoot = null;
let welcomeComposer = null;

const isNativeThemeSelect = (select) => {
	const values = new Set([...select.options].map((option) => option.value));
	return ['system', 'dark', 'oled-dark', 'light'].every((value) => values.has(value));
};

const ensureThemeModeSelect = () => {
	const nativeSelect = [...document.querySelectorAll('select')].find(isNativeThemeSelect);
	if (!nativeSelect) return;

	const nativeWrapper = nativeSelect.parentElement;
	if (!nativeWrapper) return;
	nativeWrapper.hidden = true;

	const row = nativeWrapper.closest('.group\\/setting-row') || nativeWrapper.parentElement;
	let modeSelect = row?.querySelector('.gravity-theme-mode-select');
	if (!modeSelect) {
		const wrapper = document.createElement('div');
		wrapper.className = 'gravity-theme-mode-select-wrap';

		modeSelect = document.createElement('select');
		modeSelect.className = `gravity-theme-mode-select ${nativeSelect.className}`;
		modeSelect.setAttribute('aria-label', 'Gravity appearance');
		modeSelect.innerHTML = `
			<option value="eclipse">🌘 Gravity Eclipse</option>
			<option value="pearl">🫧 Gravity Pearl</option>
		`;
		modeSelect.addEventListener('change', () => setGravityMode(modeSelect.value));
		wrapper.appendChild(modeSelect);
		nativeWrapper.insertAdjacentElement('afterend', wrapper);
	}

	modeSelect.value = getGravityMode();
};

const markWelcome = () => {
	const composer = document.getElementById('message-input-container');
	if (!composer) {
		welcomeRoot = null;
		welcomeComposer = null;
		return null;
	}

	// Suggestions deliberately disappear while the user types. Once the welcome
	// screen has been identified, keep that identity for as long as it still owns
	// the same composer instead of treating normal typing as a route change.
	if (
		welcomeRoot?.isConnected &&
		welcomeComposer === composer &&
		welcomeRoot.contains(composer)
	) {
		addClass(composer, 'message-composer');
		return welcomeRoot;
	}

	if (welcomeRoot?.isConnected) welcomeRoot.classList.remove('chat-welcome');
	welcomeRoot = null;
	welcomeComposer = null;

	const suggestions = document.getElementById('suggestions-heading');
	if (!suggestions) return null;

	const welcome =
		composer.closest('div.m-auto') ||
		suggestions.closest('div.m-auto') ||
		composer.parentElement?.parentElement;
	if (!welcome) return null;

	welcomeRoot = welcome;
	welcomeComposer = composer;
	addClass(welcome, 'chat-welcome');

	const title = welcome.querySelector('h2');
	if (title) {
		addClass(title, 'chat-welcome-title');
		const heading = title.closest('div.w-full') || title.parentElement?.parentElement;
		addClass(heading, 'chat-welcome-heading');
		const hero = title.parentElement;
		addClass(hero, 'chat-welcome-hero');
		const model = hero?.querySelector('img')?.closest('div.flex');
		addClass(model?.parentElement, 'chat-welcome-model');
	}

	addClass(
		composer.closest('div.py-3') || composer.parentElement,
		'chat-welcome-composer'
	);
	addClass(
		suggestions.closest('div.mx-auto') || suggestions.parentElement?.parentElement,
		'chat-welcome-suggestions'
	);
	addClass(composer, 'message-composer');
	return welcome;
};

const markChrome = () => {
	ensureThemeModeSelect();

	document.querySelectorAll('.app.relative > div, .app > div.h-screen').forEach((node) => {
		if (
			node.classList.contains('gravity-atmosphere') ||
			node.classList.contains('gravity-eclipse-atmosphere')
		) {
			return;
		}
		addClass(node, 'app-shell');
	});

	document.querySelectorAll('[role="navigation"]').forEach((nav) => {
		if (nav.className.includes('w-[calc(42px')) addClass(nav, 'app-sidebar-rail');
		else addClass(nav, 'app-sidebar-panel');
	});

	document
		.querySelectorAll('#sidebar-new-chat-button')
		.forEach((node) => addClass(node, 'app-sidebar-new-chat'));

	addClass(document.getElementById('message-input-container'), 'message-composer');

	document.querySelectorAll('div.rounded-3xl').forEach((node) => {
		if (node.id === 'message-input-container' || node.closest('.chat-welcome-composer')) {
			node.classList.remove('user-message-bubble');
			return;
		}
		if (node.className.includes('bg-gray-50') || node.className.includes('dark:bg-gray-850')) {
			addClass(node, 'user-message-bubble');
		}
	});

	document.querySelectorAll('[role="dialog"][aria-modal="true"]').forEach((dialog) => {
		addClass(dialog.querySelector(':scope > div'), 'app-modal-surface');
	});

	document.querySelectorAll('[role="dialog"] .rounded-2xl, [role="alertdialog"] .rounded-2xl').forEach((node) => {
		if (node.className.includes('dark:bg-gray-900') || node.className.includes('bg-gray-50')) {
			addClass(node, 'app-confirm-dialog');
			addClass(node, 'app-modal-surface');
		}
	});

	document.querySelectorAll('div.mt-auto.w-full').forEach((node) => {
		if (node.className.includes('dark:bg-gray-900') || node.className.includes('bg-gray-50')) {
			addClass(node, 'app-drawer-surface');
		}
	});

	document.querySelectorAll('[role="status"][aria-live="polite"]').forEach((node) => {
		addClass(node, 'app-notification-toast');
	});
};

const syncSuggestions = () => {
	const welcome = document.querySelector('.chat-welcome');
	if (!welcome) return;
	const editor = document.getElementById('chat-input');
	const typing = Boolean(editor?.innerText?.trim() || editor?.textContent?.trim());
	welcome.querySelectorAll('.suggestion-frame, .chat-welcome-suggestions').forEach((node) => {
		if (typing) {
			node.style.setProperty('opacity', '0', 'important');
			node.style.setProperty('visibility', 'hidden', 'important');
			node.style.setProperty('pointer-events', 'none', 'important');
		} else {
			node.style.removeProperty('opacity');
			node.style.removeProperty('visibility');
			node.style.removeProperty('pointer-events');
		}
	});
};

export const applyHooks = () => {
	markChrome();
	const welcome = markWelcome();
	syncSuggestions();
	return welcome;
};

export const observeHooks = (onChange) => {
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
	document.addEventListener('input', syncSuggestions, true);
	document.addEventListener('keyup', syncSuggestions, true);
	return observer;
};
