(() => {
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
