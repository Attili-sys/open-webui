# SECURITY.md — Open WebUI

> **Security policy and agent guardrails.** This file defines how to report vulnerabilities,
> what constitutes a security-sensitive area of the codebase, and mandatory rules that AI
> agents and human contributors must follow when working near sensitive code.

---

## 1. Reporting a Vulnerability

**Please do NOT open a public GitHub issue for security vulnerabilities.**

| Channel           | Details                                                        |
|-------------------|----------------------------------------------------------------|
| **Email**         | `security@openwebui.com`                                       |
| **Response SLA**  | Initial acknowledgement within 48 hours; triage within 7 days |
| **Disclosure**    | Coordinated disclosure — we will work with you on a timeline   |

Include in your report:
- Affected version(s)
- Step-by-step reproduction
- Potential impact assessment
- (Optional) Suggested fix or patch

---

## 2. Supported Versions

| Version      | Security Support     |
|--------------|----------------------|
| `main` branch (latest) | ✅ Actively maintained |
| Latest release tag      | ✅ Patch releases      |
| Older releases          | ❌ No backports        |

---

## 3. Security-Sensitive Areas

The following modules require **extra scrutiny** from both human reviewers and AI agents.
Any PR touching these files must be reviewed by a maintainer before merge.

| Area                          | Key Files / Paths                                           |
|-------------------------------|-------------------------------------------------------------|
| **Authentication & Sessions** | `routers/auths.py`, `utils/auth.py`, `utils/oauth.py`      |
| **JWT & Token Handling**      | `utils/auth.py` (`create_token`, `decode_token`)            |
| **Encryption**                | `crypto/`, `scripts/encryption/`, `utils/crypto.py`        |
| **Permissions & RBAC**        | `utils/access_control.py`, role checks in routers           |
| **File Uploads & Processing** | `routers/files.py`, `retrieval/loaders/`                    |
| **External HTTP Requests**    | `utils/misc.py` (SSRF risk), any outbound `httpx` / `aiohttp` call |
| **Code Execution**            | `routers/tools.py`, `functions.py`, Pyodide integration     |
| **Environment Variables**     | `env.py`, `config.py` (secrets, API keys, database URLs)    |
| **Database Queries**          | All SQLAlchemy queries — check for injection via raw SQL     |
| **Admin-Only Endpoints**      | Any endpoint decorated with admin-role dependency           |

---

## 4. Mandatory Agent Rules for Security Code

AI agents **must** follow these rules without exception when working in or near the areas listed above:

1. **No secret logging** — never add `logger.info(password)` or any log statement that could
   expose tokens, API keys, passwords, or PII.
2. **Parameterised queries only** — all database queries must use SQLAlchemy ORM or
   parameterised text queries. Never format user input into a raw SQL string.
3. **Validate all inputs** — every new endpoint must use a Pydantic model for request
   body validation. Never trust raw `request.body()` without a schema.
4. **No open redirects** — validate and allowlist redirect URLs; never reflect a user-supplied
   `redirect_uri` without checking it against a registered list.
5. **SSRF prevention** — outbound HTTP calls to user-supplied URLs must validate the host
   against `ALLOWED_HOSTS` or equivalent; block private-range IPs.
6. **CORS** — do not widen CORS `allow_origins` beyond the current configuration without
   explicit maintainer approval.
7. **File path traversal** — any file path derived from user input must be canonicalised and
   confined to the designated data directory (`DATA_DIR`).
8. **Secret detection** — before committing, run `git diff --cached` and confirm no secrets
   appear. The `pre-commit` hooks help, but do not rely solely on automation.
9. **Dependency additions** — new Python packages that handle crypto, auth, or networking
   require a maintainer sign-off. Run `uv audit` (or `pip-audit`) for known CVEs.
10. **MFA & session changes** — changes to TOTP, session invalidation, or token rotation
    logic must include a regression test.

---

## 5. Dependency Security

```bash
# Check Python dependencies for known CVEs
uv run pip-audit

# Check npm dependencies
npm audit
```

- Address all `critical` and `high` severity advisories before merging.
- `moderate` advisories must be documented in the PR if not immediately actionable.

---

## 6. Cryptography Guidelines

- **Do not** implement custom cryptography. Use established libraries: `cryptography`, `PyJWT`,
  `authlib`, `bcrypt`, `argon2-cffi` (all already in `pyproject.toml`).
- Password hashing: **bcrypt** or **Argon2** — both are configured. Do not add MD5 / SHA1 for
  passwords under any circumstances.
- Token signing: **HS256** or **RS256** JWT via `PyJWT`. Token secrets come from environment
  variables — never hard-coded defaults beyond a local-dev fallback.
- Encryption at rest: use the `crypto/` module for any file or field encryption. Do not
  roll a new encryption scheme.

---

## 7. Incident Response

If you discover a security issue already in production:

1. Do **not** push a fix directly to `main` without coordination.
2. Email `security@openwebui.com` with the details.
3. A maintainer will create a private fork, apply the fix, and coordinate a release.
4. A CVE will be requested if the impact is significant.

---

*This file is part of the agentic coding documentation suite. See also:*
*[`AGENTS.md`](./AGENTS.md) · [`CLAUDE.md`](./CLAUDE.md) · [`DESIGN.md`](./DESIGN.md)*
