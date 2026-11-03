# AGENTS.md — Open WebUI

> **Universal agent instructions.** This file is read automatically by all major AI coding
> assistants (OpenAI Codex, Claude Code, Cursor, Aider, Windsurf, Gemini Antigravity, etc.).
> Keep it concise — every line costs context tokens. See sub-directory `AGENTS.md` files for
> scope-specific rules.

---

## 1. Project Overview

**Open WebUI** is a self-hosted, feature-rich AI chat interface that connects to local (Ollama)
and remote (OpenAI-compatible, Anthropic, …) LLM endpoints.

| Layer     | Technology                                                   |
|-----------|--------------------------------------------------------------|
| Frontend  | SvelteKit 2 · Svelte 5 · TypeScript · TailwindCSS 4 · Vite  |
| Backend   | Python 3.11–3.12 · FastAPI · SQLAlchemy 2 (async) · Alembic |
| Real-time | Socket.IO (python-socketio + socket.io-client)               |
| DB        | SQLite (default) · PostgreSQL (optional) · MariaDB (optional)|
| Vector DB | ChromaDB (default) · Qdrant · Weaviate · Milvus · Pinecone  |
| Storage   | Local filesystem · AWS S3 · Azure Blob · Google Cloud Storage|
| Auth      | JWT · OAuth2 / OIDC · LDAP · MFA (TOTP)                     |
| Package   | `npm` (Node ≥18.13, ≤22) · `uv` / `pip` (Python)           |

---

## 2. Repository Layout

```
open-webui/
├── src/                    # SvelteKit frontend
│   ├── lib/
│   │   ├── apis/           # Typed API clients (one file per backend router)
│   │   ├── components/     # Svelte UI components
│   │   ├── stores/         # Svelte stores (global state)
│   │   ├── utils/          # Pure-TS helpers
│   │   └── i18n/           # Translations (i18next)
│   └── routes/             # SvelteKit file-based routing
├── backend/
│   └── open_webui/
│       ├── main.py         # FastAPI app entry-point & all routers
│       ├── config.py       # All env-var driven config (PersistentConfig pattern)
│       ├── env.py          # Raw env var parsing (source of truth)
│       ├── models/         # SQLAlchemy ORM models + Pydantic schemas
│       ├── routers/        # FastAPI route handlers (one file per domain)
│       ├── utils/          # Backend utility modules
│       ├── retrieval/      # RAG pipeline (loaders, embeddings, vector store)
│       ├── socket/         # Socket.IO event handlers
│       └── migrations/     # Alembic DB migrations
├── scripts/                # Build & maintenance scripts
├── static/                 # Static assets (fonts, icons, favicons)
├── docs/                   # Additional documentation
└── Dockerfile              # Production container definition
```

---

## 3. Commands

### Frontend

```bash
npm install                  # Install all JS dependencies
npm run dev                  # Start Vite dev server (also runs pyodide fetch)
npm run dev:5050             # Dev server on port 5050
npm run build                # Production build
npm run check                # TypeScript + Svelte type check
npm run lint:frontend        # ESLint (auto-fix)
npm run format               # Prettier (JS/TS/Svelte/CSS/MD)
npm run test:frontend        # Vitest unit tests
```

### Backend

```bash
# Python environment (use uv — it respects uv.lock)
uv sync                              # Install all Python dependencies
uv run uvicorn open_webui.main:app --reload --host 0.0.0.0 --port 8080

# Or via the bundled script
bash backend/dev.sh

# Linting & formatting
uv run ruff check backend/ --fix
uv run ruff format backend/
uv run pylint backend/

# Database migrations
uv run alembic -c backend/open_webui/alembic.ini upgrade head
uv run alembic -c backend/open_webui/alembic.ini revision --autogenerate -m "description"

# Tests
uv run pytest backend/
```

---

## 4. Core Conventions

### TypeScript / Svelte

- Use **Svelte 5** runes (`$state`, `$derived`, `$effect`) for reactivity; avoid Svelte 4 `$:` syntax in new code.
- All API calls live in `src/lib/apis/`; never call `fetch` directly from a component.
- Components are in PascalCase. Files under `src/routes/` follow SvelteKit naming conventions.
- Use `i18n` (`$i18n.t(...)`) for every user-facing string — never hard-code English text in components.
- Prefer named exports; avoid default-exporting non-component modules.
- TypeScript strict mode is enabled — avoid `any` without an explicit `// @ts-ignore` justification.

### Python / FastAPI

- Follow **Ruff** style: single quotes, max line length 120, Google-style docstrings.
- All config values come from `config.py` (`PersistentConfig` / `AppConfig`), sourced from `env.py`. Never read `os.environ` directly in a router.
- DB access uses `async` SQLAlchemy sessions — never block the event loop with sync I/O.
- Pydantic v2 models are used for request/response validation. Use `model_validate` (not `parse_obj`).
- New API endpoints must be added to the correct router file under `routers/`, then registered in `main.py`.
- DB schema changes require an **Alembic migration** — never alter tables manually.

---

## 5. Strict Boundaries

- **Never** commit secrets, API keys, or `.env` files.
- **Never** modify `uv.lock` or `package-lock.json` by hand.
- **Never** alter files inside `backend/open_webui/migrations/` except via `alembic revision`.
- **Never** bypass the `crypto:verify` pre-build hook or remove `scripts/encryption/`.
- **Never** change `LICENSE`, `LICENSE_HISTORY`, or `CONTRIBUTOR_LICENSE_AGREEMENT` without explicit owner approval.
- Avoid adding new top-level `npm` dependencies without discussing in a PR first.
- Do not introduce `any` casts or `# type: ignore` comments without a comment explaining why.

---

## 6. Testing Requirements

- All new utility functions (frontend and backend) must include a unit test.
- Frontend tests: `vitest` under `src/` or `test/` directories.
- Backend tests: `pytest` under `backend/` (async tests use `pytest-asyncio`).
- E2E tests: Cypress (`npm run cy:open`); playwright available via `all` extras.
- Tests must pass before opening a PR — CI runs `npm run lint` and `uv run pytest` automatically.

---

## 7. i18n

- All user-facing strings must use `$i18n.t('key')` (Svelte) or the i18n helper (backend notifications).
- After adding new translation keys, run: `npm run i18n:parse` to regenerate locale files.
- Do not edit `src/lib/i18n/locales/` JSON files manually — they are auto-generated.

---

## 8. Open Questions / Escalation

If you are unsure about:
- Changing auth flows → tag `@tjbeak` in the PR.
- Vector DB behaviour / RAG pipeline → check `backend/open_webui/retrieval/` first.
- Security-sensitive changes → open a draft PR and request review before merging.

---

*Last updated: 2026-11-04 — keep this file concise (target < 150 lines of prose). Remove a rule when tooling enforces it automatically.*
