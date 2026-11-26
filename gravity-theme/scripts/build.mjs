import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const runtimePath = join(root, 'assets/gravity-runtime.js');

const bundled = spawnSync(
	'npx',
	[
		'--yes',
		'esbuild@0.25.12',
		join(root, 'src/index.js'),
		'--bundle',
		'--format=iife',
		`--outfile=${runtimePath}`,
		'--target=es2022',
		'--legal-comments=none'
	],
	{ stdio: 'inherit', cwd: root }
);

if (bundled.status !== 0) {
	process.exit(bundled.status ?? 1);
}

const customCss = [
	readFileSync(join(root, 'css/gravity-eclipse-2.css'), 'utf8'),
	readFileSync(join(root, 'css/overlay.css'), 'utf8')
].join('\n\n');

writeFileSync(join(root, 'custom.css'), customCss);

const runtime = readFileSync(runtimePath);
const version = createHash('sha256')
	.update(runtime)
	.update(customCss)
	.digest('hex')
	.slice(0, 16);

writeFileSync(
	join(root, 'assets/manifest.json'),
	`${JSON.stringify({ version })}\n`
);

const bootstrap = `(() => {
	const loaderUrl = new URL(document.currentScript?.src ?? '/static/loader.js', location.href);
	const staticBase = new URL('./', loaderUrl);
	const gravityBase = new URL('gravity/', staticBase);
	window.__gravityAssetBase = gravityBase.href;
	window.__gravityAppBasePath = new URL('../', staticBase).pathname;

	const load = (version) => {
		const suffix = '?v=' + encodeURIComponent(version);

		const style = document.createElement('link');
		style.rel = 'stylesheet';
		style.href = new URL('custom.css' + suffix, staticBase).href;
		style.dataset.gravityRuntime = version;
		document.head.appendChild(style);

		const script = document.createElement('script');
		script.src = new URL('gravity-runtime.js' + suffix, gravityBase).href;
		script.dataset.gravityRuntime = version;
		document.head.appendChild(script);
	};

	fetch(new URL('manifest.json', gravityBase), {
		cache: 'no-store',
		credentials: 'same-origin'
	})
		.then((response) => {
			if (!response.ok) throw new Error('Gravity manifest unavailable');
			return response.json();
		})
		.then(({ version }) => load(version))
		.catch(() => load(Date.now().toString(36)));
})();
`;

writeFileSync(join(root, 'loader.js'), bootstrap);
console.log(`wrote Gravity overlay ${version}`);
