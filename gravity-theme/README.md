# Gravity theme for Open WebUI

Gravity is a visual overlay for the **unmodified** official Open WebUI image. It ships two looks:

| Mode | Description |
| --- | --- |
| Gravity Eclipse (default) | Dark charcoal surface, dark glass pearl, teal field |
| Gravity Pearl | Daylight palette with the photographic pearl |

Users switch modes in **Settings → General → Theme**.

No Open WebUI source file is changed. The overlay uses the two customization hooks that the official
`app.html` already loads and that ship empty in the official image:

- `/static/custom.css`
- `/static/loader.js`

Upstream releases can therefore be adopted by bumping the base image tag; there is nothing to merge.

Current base: **Open WebUI `v0.13.3`** (`ghcr.io/open-webui/open-webui:v0.13.3`).

## Layout

```text
gravity-theme/
├── src/                  # runtime source (edit these)
│   └── renderer/         # WebGL field renderer
├── css/                  # stylesheet source (edit these)
├── scripts/build.mjs     # build script
├── custom.css            # generated
├── loader.js             # generated, stable bootstrap
├── assets/               # served at /static/gravity/
│   ├── gravity-runtime.js   # generated
│   ├── manifest.json        # generated content version
│   └── ask-pearl-day-600.webp
└── Dockerfile            # deployment image
```

Generated files are committed so the image build needs no Node.js toolchain.

## How it loads

1. `custom.css` loads first and paints a charcoal first-paint curtain so native components never flash.
2. `loader.js` (deferred) fetches `/static/gravity/manifest.json` with `cache: no-store`.
3. It then loads `gravity-runtime.js?v=<version>` and `custom.css?v=<version>`. A new build gets new URLs, so
   browsers never run a stale overlay.
4. The runtime applies root classes, mounts the field and pearl, and tags Open WebUI DOM nodes for styling.
5. The curtain lifts when the current route is ready. If the runtime fails, CSS lifts it after 8 seconds.

Asset URLs are derived from the `loader.js` URL, so the overlay also works when Open WebUI is served under a
path prefix.

## Build

Requires Node.js 18+ and network access on first run (`npx` fetches the pinned `esbuild@0.25.12`).

```bash
node gravity-theme/scripts/build.mjs
```

The build is deterministic. CI can enforce that committed output matches source:

```bash
node gravity-theme/scripts/build.mjs && git diff --exit-code -- gravity-theme
```

## Local development

```bash
node gravity-theme/scripts/build.mjs
docker compose -f docker-compose.gravity.yaml up -d
```

Open <http://localhost:8080>. The compose file mounts the overlay read-only into the official image, so a rebuild
plus a browser refresh is enough; no container restart is needed. Optional variables: `WEBUI_DOCKER_TAG`,
`OPEN_WEBUI_PORT`, `OLLAMA_BASE_URL`, `WEBUI_SECRET_KEY`.

## Deployment image

The `Dockerfile` copies the overlay into the official image. It does not rebuild Open WebUI.

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --build-arg OPEN_WEBUI_VERSION=v0.13.3 \
  -f gravity-theme/Dockerfile \
  -t <registry>/<image>:v0.13.3-<git-sha> \
  --push gravity-theme
```

Use immutable tags (Open WebUI version plus commit). Do not deploy floating tags such as `main` or `latest`.

## Kubernetes notes

- **`WEBUI_SECRET_KEY` must be set from a Secret.** When it is empty, Open WebUI generates a key inside the
  container filesystem, so every restart logs all users out and multiple replicas disagree on sessions.
- Persist `/app/backend/data` on a volume. Multi-replica deployments also need upstream's shared database and
  Redis configuration; the theme adds no state of its own.
- On startup Open WebUI copies `build/static` into `backend/open_webui/static`. The image bakes the overlay into
  both locations, so it still works with a read-only root filesystem or an arbitrary non-root UID.
- Do not cache `/static/gravity/manifest.json` at a CDN or ingress. Every other overlay file is
  content-versioned and safe to cache.

## Upgrading Open WebUI

1. Bump `OPEN_WEBUI_VERSION` in `Dockerfile` and the default `WEBUI_DOCKER_TAG` in `docker-compose.gravity.yaml`.
2. Run the stack and check: refresh on New Chat, an existing chat, Notes and `/auth`; typing in the welcome
   composer; the Settings theme picker; both modes.
3. If a surface lost styling, fix the overlay hooks in `src/hooks.js`, never Open WebUI source.

The overlay depends on these upstream DOM hooks: `#message-input-container`, `#suggestions-heading`,
`#chat-input`, `#chat-container`, `#sidebar-new-chat-button`, `#auth-page`, the `.app` layout container, the
native theme `<select>` in Settings, and the welcome screen `h2`. A renamed hook degrades one surface; the app keeps working.

## Known limitations

- The overlay is DOM-dependent. Upstream markup changes can require hook updates (see above).
- Flow diagrams have no dedicated dark-mode styling.
- When typing hides the suggestions, Open WebUI's native layout collapse moves the composer by a few pixels.
- Serving under a path prefix is supported by design but has not been verified behind a production ingress.
