export const APP_THEME_CLASSES = [
	'dark',
	'light',
	'oled-dark',
	'her',
	'gravity',
	'gravity-flow',
	'gravity-field'
] as const;

export const THEME_GRAY_PROPERTIES = [
	'--color-gray-800',
	'--color-gray-850',
	'--color-gray-900',
	'--color-gray-950'
] as const;

const DARK_GRAY_PALETTE = {
	'--color-gray-800': '#333',
	'--color-gray-850': '#262626',
	'--color-gray-900': '#171717',
	'--color-gray-950': '#0d0d0d'
} as const;

const OLED_GRAY_PALETTE = {
	'--color-gray-800': '#101010',
	'--color-gray-850': '#050505',
	'--color-gray-900': '#000000',
	'--color-gray-950': '#000000'
} as const;

type ThemeGrayPalette = Partial<Record<(typeof THEME_GRAY_PROPERTIES)[number], string>>;

export type AppThemeResolution = {
	classes: string[];
	isDark: boolean;
	metaColor: string;
	grayPalette: ThemeGrayPalette | null;
};

type ThemeRoot = {
	classList: {
		add: (...tokens: string[]) => void;
		remove: (...tokens: string[]) => void;
	};
	style: {
		setProperty: (property: string, value: string) => void;
		removeProperty: (property: string) => unknown;
	};
};

type MetaThemeColor = {
	setAttribute: (name: string, value: string) => void;
};

type ApplyAppThemeOptions = {
	root?: ThemeRoot;
	metaThemeColor?: MetaThemeColor | null;
	prefersDark?: boolean;
};

export const resolveAppTheme = (theme: string, prefersDark = false): AppThemeResolution => {
	if (theme === 'system') {
		return {
			classes: [prefersDark ? 'dark' : 'light'],
			isDark: prefersDark,
			metaColor: prefersDark ? '#171717' : '#ffffff',
			grayPalette: null
		};
	}

	if (theme === 'light') {
		return {
			classes: ['light'],
			isDark: false,
			metaColor: '#ffffff',
			grayPalette: null
		};
	}

	if (theme === 'her') {
		return {
			classes: ['light', 'her'],
			isDark: false,
			metaColor: '#983724',
			grayPalette: null
		};
	}

	if (theme === 'gravity') {
		return {
			classes: ['dark', 'gravity'],
			isDark: true,
			metaColor: '#050c18',
			grayPalette: null
		};
	}

	// Gravity Flow inherits every Gravity style and layers its own `gravity-flow` overrides on top.
	if (theme === 'gravity-flow') {
		return {
			classes: ['dark', 'gravity', 'gravity-flow'],
			isDark: true,
			metaColor: '#050c18',
			grayPalette: null
		};
	}

	// Gravity Field keeps the complete Gravity Flow UI and replaces only its background renderer.
	if (theme === 'gravity-field') {
		return {
			classes: ['dark', 'gravity', 'gravity-flow', 'gravity-field'],
			isDark: true,
			metaColor: '#050c18',
			grayPalette: null
		};
	}

	if (theme === 'oled-dark') {
		return {
			classes: ['dark'],
			isDark: true,
			metaColor: '#000000',
			grayPalette: OLED_GRAY_PALETTE
		};
	}

	return {
		classes: ['dark'],
		isDark: true,
		metaColor: '#171717',
		grayPalette: theme === 'dark' ? DARK_GRAY_PALETTE : null
	};
};

export const isDarkTheme = (theme: string, prefersDark = false) =>
	resolveAppTheme(theme, prefersDark).isDark;

export const applyAppTheme = (
	theme: string,
	{ root, metaThemeColor, prefersDark = false }: ApplyAppThemeOptions = {}
) => {
	const resolution = resolveAppTheme(theme, prefersDark);
	const themeRoot =
		root ?? (typeof document !== 'undefined' ? document.documentElement : undefined);

	if (!themeRoot) {
		return resolution;
	}

	APP_THEME_CLASSES.forEach((themeClass) => {
		themeRoot.classList.remove(themeClass);
	});
	resolution.classes.forEach((themeClass) => {
		themeRoot.classList.add(themeClass);
	});

	THEME_GRAY_PROPERTIES.forEach((property) => {
		themeRoot.style.removeProperty(property);
	});
	Object.entries(resolution.grayPalette ?? {}).forEach(([property, value]) => {
		themeRoot.style.setProperty(property, value);
	});

	const themeColor =
		metaThemeColor ??
		(typeof document !== 'undefined'
			? document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
			: null);
	themeColor?.setAttribute('content', resolution.metaColor);

	return resolution;
};
