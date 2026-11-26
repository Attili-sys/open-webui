# syntax=docker/dockerfile:1
# Gravity overlay on an unmodified Open WebUI image.
# Build from the repository root:
#   docker build -f gravity-theme/Dockerfile -t <registry>/<image>:<tag> gravity-theme
# Bump OPEN_WEBUI_VERSION only after testing the overlay against the new release.
ARG OPEN_WEBUI_VERSION=v0.13.3
FROM ghcr.io/open-webui/open-webui:${OPEN_WEBUI_VERSION}

ARG OPEN_WEBUI_VERSION
LABEL org.opencontainers.image.title="Open WebUI + Gravity theme" \
      org.opencontainers.image.base.name="ghcr.io/open-webui/open-webui:${OPEN_WEBUI_VERSION}"

# The backend rebuilds open_webui/static from build/static on startup; baking both keeps the
# theme intact when that copy cannot run (read-only root filesystem or non-root UID).
# Group 0 write access mirrors the upstream image for arbitrary-UID platforms.
COPY --chmod=0664 custom.css loader.js /app/build/static/
COPY --chmod=0664 custom.css loader.js /app/backend/open_webui/static/
COPY --chmod=u=rwX,g=rwX,o=rX assets/ /app/build/static/gravity/
COPY --chmod=u=rwX,g=rwX,o=rX assets/ /app/backend/open_webui/static/gravity/
