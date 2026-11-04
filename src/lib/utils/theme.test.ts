import { describe, expect, it } from 'vitest';

import { applyAppTheme, isDarkTheme, resolveAppTheme } from './theme';

const createThemeDocument = () => {
	const classes = new Set(['her', 'light']);
	const properties = new Map<string, string>([['--color-gray-900', '#000000']]);
	let metaColor = '';

	return {
		classes,
		properties,
		get metaColor() {
			return metaColor;
		},
		root: {
			classList: {
				add: (...tokens: string[]) => tokens.forEach((token) => classes.add(token)),
				remove: (...tokens: string[]) => tokens.forEach((token) => classes.delete(token))
			},
			style: {
				setProperty: (property: string, value: string) => properties.set(property, value),
				removeProperty: (property: string) => properties.delete(property)
			}
		},
		metaThemeColor: {
			setAttribute: (_name: string, value: string) => {
				metaColor = value;
			}
		}
	};
};

describe('resolveAppTheme', () => {
	it('maps Gravity onto the shared dark class without inline gray overrides', () => {
		expect(resolveAppTheme('gravity')).toEqual({
			classes: ['dark', 'gravity'],
			isDark: true,
			metaColor: '#050c18',
			grayPalette: null
		});
	});

	it('layers Gravity Flow on top of the Gravity classes', () => {
		expect(resolveAppTheme('gravity-flow')).toEqual({
			classes: ['dark', 'gravity', 'gravity-flow'],
			isDark: true,
			metaColor: '#050c18',
			grayPalette: null
		});
	});

	it('layers Gravity Field on the complete Gravity Flow theme', () => {
		expect(resolveAppTheme('gravity-field')).toEqual({
			classes: ['dark', 'gravity', 'gravity-flow', 'gravity-field'],
			isDark: true,
			metaColor: '#050c18',
			grayPalette: null
		});
	});

	it('layers Gravity Eclipse on the complete Gravity Field theme', () => {
		expect(resolveAppTheme('gravity-eclipse')).toEqual({
			classes: ['dark', 'gravity', 'gravity-flow', 'gravity-field', 'gravity-eclipse'],
			isDark: true,
			metaColor: '#101113',
			grayPalette: null
		});
	});

	it('resolves the system theme from the current color-scheme preference', () => {
		expect(resolveAppTheme('system', false).classes).toEqual(['light']);
		expect(resolveAppTheme('system', true).classes).toEqual(['dark']);
		expect(isDarkTheme('system', true)).toBe(true);
		expect(isDarkTheme('system', false)).toBe(false);
	});
});

describe('applyAppTheme', () => {
	it('clears stale theme classes and OLED variables when switching to Gravity', () => {
		const themeDocument = createThemeDocument();

		applyAppTheme('gravity', themeDocument);

		expect([...themeDocument.classes]).toEqual(['dark', 'gravity']);
		expect(themeDocument.properties.size).toBe(0);
		expect(themeDocument.metaColor).toBe('#050c18');
	});

	it('drops the Gravity Flow class when switching back to plain Gravity', () => {
		const themeDocument = createThemeDocument();

		applyAppTheme('gravity-eclipse', themeDocument);
		expect([...themeDocument.classes]).toEqual([
			'dark',
			'gravity',
			'gravity-flow',
			'gravity-field',
			'gravity-eclipse'
		]);

		applyAppTheme('gravity', themeDocument);
		expect([...themeDocument.classes]).toEqual(['dark', 'gravity']);
	});

	it('applies the OLED palette and replaces it when switching to light', () => {
		const themeDocument = createThemeDocument();

		applyAppTheme('oled-dark', themeDocument);
		expect(themeDocument.properties.get('--color-gray-900')).toBe('#000000');

		applyAppTheme('light', themeDocument);
		expect([...themeDocument.classes]).toEqual(['light']);
		expect(themeDocument.properties.size).toBe(0);
		expect(themeDocument.metaColor).toBe('#ffffff');
	});
});
