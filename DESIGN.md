# DESIGN.md — Open WebUI

> **UI/UX & visual design guardrails.** All AI agents and human contributors must follow these
> rules before creating or modifying any frontend component, layout, or stylesheet.

---

## 1. Design Principles

| Principle       | Meaning for Open WebUI                                                          |
|-----------------|---------------------------------------------------------------------------------|
| **Clarity**     | The chat is the hero — every UI decision should reduce friction in the conversation flow. |
| **Density**     | Power-user density is preferred (sidebar, model picker, tools panel) — but collapsible. |
| **Consistency** | Components with the same function must look and behave identically across screens. |
| **Accessibility**| WCAG 2.1 AA minimum. Keyboard navigable. Sufficient colour contrast in both themes.|
| **Performance** | No layout shift on load. Svelte transitions must be under 300 ms.               |

---

## 2. Theme System

Open WebUI ships two themes (light / dark) driven by a `class="dark"` toggle on `<html>`.

### Colour Tokens (TailwindCSS 4 CSS Variables)

All theme colours are defined as CSS custom properties in `src/app.css`. **Never hard-code
hex or rgb values in component files** — always use the design-token class or variable.

| Token Purpose           | CSS Variable / Tailwind Class               |
|-------------------------|---------------------------------------------|
| Page background         | `bg-white dark:bg-gray-900`                 |
| Surface (cards/panels)  | `bg-gray-50 dark:bg-gray-800`               |
| Input background        | `bg-white dark:bg-gray-850`                 |
| Primary text            | `text-gray-900 dark:text-gray-100`          |
| Secondary text          | `text-gray-500 dark:text-gray-400`          |
| Accent / interactive    | `text-blue-600 dark:text-blue-400`          |
| Danger / destructive    | `text-red-600 dark:text-red-400`            |
| Success                 | `text-green-600 dark:text-green-400`        |
| Border                  | `border-gray-200 dark:border-gray-700`      |
| Focus ring              | `ring-blue-500`                             |

### Typography

- **Font stack**: System UI (`font-sans`). No Google Fonts unless a user selects a custom font.
- **Scale**: Follow Tailwind's default type scale (`text-sm`, `text-base`, `text-lg`…).
- **Code blocks**: `font-mono` (JetBrains Mono or system monospace), `text-sm`.
- **Headings**: `font-semibold` for h2/h3; `font-bold` only for page-level h1.

---

## 3. Component Rules

### Spacing & Layout

- Use **Tailwind spacing scale** (`p-2`, `gap-4`, `mt-6`, …) — never raw `px` or `rem` in class strings.
- Sidebar width: fixed at `260px` when expanded; icon-only `56px` when collapsed. Match in any new sidebar contribution.
- Chat messages max-width: `max-w-3xl` centered. Do not widen without a design discussion.
- Mobile breakpoint: `md` (768 px). All layouts must be usable on mobile — test at 375 px viewport.

### Buttons

| Variant   | Classes                                                                          |
|-----------|----------------------------------------------------------------------------------|
| Primary   | `btn btn-primary` → `bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2` |
| Secondary | `btn btn-secondary` → outlined, `border border-gray-300 dark:border-gray-600`   |
| Ghost     | `btn btn-ghost` → transparent background, hover surface colour                  |
| Danger    | `btn btn-danger` → `bg-red-600 hover:bg-red-700 text-white`                     |

- **Always** include a `title` or `aria-label` on icon-only buttons.
- Minimum touch target: `44 × 44 px` on mobile.

### Forms & Inputs

- Use `input` base class from `src/app.css` for all `<input>`, `<textarea>`, `<select>`.
- Validation errors: red border + inline `<p class="text-red-500 text-xs mt-1">` message.
- Required fields: `aria-required="true"` (not just a visual asterisk).

### Modals & Overlays

- Use the shared `<Modal>` component in `src/lib/components/common/Modal.svelte` — do not create raw `<dialog>` elements.
- Always trap focus inside open modals (`focus-trap` library is available).
- ESC key must close every modal; emit a `close` event for the parent.

### Icons

- Use **Heroicons** (`heroicons` package) or **Iconoir** (`iconoir` package) — already installed.
- Size: `size-4` (16 px) inline, `size-5` (20 px) standalone action icon, `size-6` (24 px) nav.
- Prefer outline variants; use solid only for active/selected state.
- Every `<svg>` icon must have `aria-hidden="true"` when decorative.

---

## 4. Animations & Transitions

- All transitions use Svelte's built-in `transition:` directive or CSS `@keyframes`.
- Duration budgets: enter `150–200 ms`, exit `100–150 ms`, page transition `200–300 ms`.
- Use `ease-out` for enter, `ease-in` for exit.
- **Respect** `prefers-reduced-motion` — wrap all non-trivial animations:
  ```css
  @media (prefers-reduced-motion: reduce) { /* disable or snap */ }
  ```
- Loading states: use skeleton loaders (`animate-pulse`) not spinners for content areas.

---

## 5. Accessibility Checklist

Before merging any UI change, verify:

- [ ] All interactive elements reachable by `Tab` key.
- [ ] Focus indicator visible in both light and dark themes.
- [ ] Colour contrast ≥ 4.5:1 for normal text, ≥ 3:1 for large text.
- [ ] Images/icons have `alt` text or `aria-hidden="true"`.
- [ ] Dynamic content changes announced via `aria-live` regions where appropriate.
- [ ] No reliance on colour alone to convey meaning.

---

## 6. Internationalisation (i18n) in Components

- Wrap **every** user-visible string: `{$i18n.t('namespace.key')}`.
- Never interpolate variable data directly into the translation key string.
- RTL languages: use `dir="auto"` on text containers. Avoid fixed `left`/`right` CSS that breaks RTL layouts.

---

## 7. What NOT to Do

- Do not use inline `style=""` attributes — always use Tailwind classes.
- Do not add CSS outside of `src/app.css` and scoped `<style>` blocks in `.svelte` files.
- Do not use `!important` in CSS.
- Do not deviate from the established sidebar / topbar / chat-pane three-column layout without a design proposal in a PR.
- Do not add third-party UI component libraries (e.g., shadcn, Flowbite, DaisyUI) without team consensus.
- Do not change the existing `bits-ui` integration patterns without reviewing `src/lib/components/` first.

---

*See [`AGENTS.md`](./AGENTS.md) for general project conventions. See [`src/app.css`](./src/app.css) for the full CSS token reference.*
