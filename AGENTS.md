# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project Overview

Open WebUI is a self-hosted AI web application with a SvelteKit/Vite frontend and a FastAPI Python backend.

- Frontend code lives under `src/`, with routes in `src/routes/` and shared UI, API clients, stores, workers, and utilities in `src/lib/`.
- Backend code lives under `backend/open_webui/`, with API routers in `backend/open_webui/routers/`, database/Pydantic models in `backend/open_webui/models/`, migrations in `backend/open_webui/migrations/`, and shared services/utilities in `backend/open_webui/utils/`, `retrieval/`, `socket/`, and `storage/`.
- The app proxies model/provider calls through the backend for auth, CORS, and security. Preserve that boundary unless a task explicitly changes architecture.
- Open WebUI is self-hosted and configurable. Prefer secure defaults, role/permission checks, and backwards-compatible data changes for shipped behavior.

## Setup And Commands

Use the root `package.json` scripts unless a task gives a more specific command.

- `npm run dev` starts the frontend dev server after preparing Pyodide assets.
- `npm run build` prepares Pyodide assets and builds the frontend.
- `npm run check` runs SvelteKit sync and `svelte-check`.
- `npm run test:frontend` runs Vitest with `--passWithNoTests`.
- `npm run lint` runs frontend lint, type checks, and backend pylint. Note that `npm run lint:frontend` uses `eslint . --fix` and may modify files.
- `npm run format` formats frontend/web files with Prettier.
- `npm run format:backend` formats Python with Ruff.
- `make install`, `make start`, `make stop`, and `make startAndBuild` manage the Docker Compose stack.

Python requires `>=3.11,<3.13`. Node must satisfy `>=18.13.0 <=22.x.x`.

## Code Style

- Follow the existing style in the file being edited.
- Frontend formatting is Prettier-based: tabs, single quotes, no trailing commas, 100 character print width, LF endings, and `prettier-plugin-svelte`.
- TypeScript is strict via `tsconfig.json`; keep types explicit where it improves clarity and avoid weakening existing type safety.
- Svelte components should stay colocated with nearby UI patterns in `src/lib/components/`; keep route-specific logic in `src/routes/`.
- Python formatting is configured for 120 character lines. Ruff uses single quotes and checks pycodestyle, pyflakes, imports, pyupgrade, complexity, quote style, and import conventions.
- Backend routes should use FastAPI dependencies such as `get_verified_user`, `get_admin_user`, permission helpers, and `AsyncSession` injection consistently with neighboring routers.
- Backend data access generally belongs in model/table manager modules under `backend/open_webui/models/`; routers should stay focused on HTTP behavior and orchestration.

## Data And Migrations

- If a backend schema changes, add or update an Alembic migration under `backend/open_webui/migrations/versions/`.
- Preserve persisted user data and existing deployment compatibility unless the task explicitly targets a breaking change.
- Be careful with JSON fields and timestamps; mirror nearby model conventions for defaults, nullability, indexes, and response models.
- Do not introduce ad hoc storage paths or direct database access from frontend code.

## Security And Permissions

- Keep provider secrets, API keys, auth tokens, and deployment-specific values out of source. Do not commit `.env` files.
- Maintain backend-mediated access to Ollama, OpenAI-compatible APIs, files, tools, functions, and retrieval providers.
- Treat Tools and Functions as privileged, server-side code execution surfaces. Check admin/user permissions before adding or exposing related behavior.
- For security-sensitive changes, validate the default configuration and document any assumptions about deployment mode, auth state, or admin-only actions.

## Testing Expectations

- Run the narrowest useful checks for the files you changed.
- For frontend/UI changes, prefer `npm run check` and `npm run test:frontend`; add manual verification notes for user-visible flows.
- For backend changes, run or ask for `npm run lint:backend` or focused Python checks where practical.
- For cross-cutting changes, run `npm run lint` or explain why a narrower check was used.
- If a command may mutate many unrelated files, call that out before using it.

## Contribution Notes

- Pull requests should target `dev`, not `main`.
- Keep changes atomic and avoid unrelated refactors.
- New or updated dependencies need a clear reason and testing notes.
- User-facing changes should include relevant documentation updates. Project docs are maintained separately at `open-webui/docs` unless the change belongs in this repository.
- PR titles should use the repository's conventional prefixes such as `feat`, `fix`, `docs`, `refactor`, `test`, `perf`, `build`, `ci`, `chore`, `style`, `i18n`, or `BREAKING CHANGE`.
