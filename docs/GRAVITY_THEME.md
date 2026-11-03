# Gravity Theme

Gravity is an optional, dark-only visual theme for this Open WebUI fork. It preserves the existing
information architecture and behavior while adding a blue-black atmospheric canvas, glass surfaces,
electric-blue accents, and restrained ambient motion.

The theme is intentionally implemented as a reskin rather than a component fork so upstream Open
WebUI changes remain straightforward to merge.

## Architecture

- The persisted theme value is `gravity`.
- The document receives both `dark` and `gravity` classes. Existing dark-mode utilities continue to
  work, while Gravity-specific overrides remain scoped under `html.gravity`.
- `src/app.css` owns the Gravity design tokens and global surface overrides, matching the repository
  rule that global CSS stays in the main stylesheet.
- `GravityBackground.svelte` owns the decorative atmosphere. It has no JavaScript animation, ignores
  pointer input, and disables motion when `prefers-reduced-motion` is enabled.
- `src/lib/utils/theme.ts` is the hydrated source of truth for class resolution, dark-mode status,
  meta color, and cleanup of OLED inline variables.
- Existing components expose a small set of neutral semantic hook classes. No feature logic or user
  flow depends on those classes, and future themes can reuse them.
- The Tailwind gray scale keeps its normal light-to-dark luminance order. This is required because
  existing components use light gray tokens for text and dark gray tokens for surfaces.

## Activation

Select **Gravity** from **Settings → General → Theme**. The preference is stored in
`localStorage.theme`, exactly like the built-in themes.

Gravity is opt-in. The default remains the upstream `system` theme, so new upstream behavior is not
silently changed.

## Stable Component Hooks

- `app-shell`: authenticated application surface
- `app-sidebar-panel` and `app-sidebar-rail`: expanded and collapsed navigation
- `chat-welcome`, `chat-welcome-title`, and `chat-welcome-model`: new-chat hero
- `message-composer`: all chat composer instances
- `suggestion-list` and `suggestion-card`: prompt suggestions
- `user-message-bubble`: user chat bubbles
- `app-modal-surface`: shared modal surface
- `app-drawer-surface`, `app-notification-toast`, and `app-update-toast`: portaled surfaces

The shared `app-dropdown-menu`, Sonner, Tippy, editor, and message-profile selectors already existed,
so they are themed without additional component changes.

## Upstream Sync Workflow

After merging upstream:

1. Search for `gravity` to confirm the theme initialization and runtime theme switch paths still
   exist.
2. Resolve component conflicts by retaining only the small hook-class additions; do not copy old
   component markup over newer upstream markup.
3. Keep the marked Gravity block at the end of `src/app.css`.
4. Confirm `GravityBackground` still renders before `app-shell` in the authenticated layout.
5. Run `npm run check`, `npm run lint:frontend`, and `npm run test:frontend`.
6. Manually switch through System, Light, Dark, OLED Dark, and Gravity to catch stale document
   classes or inline gray-token overrides.

## Visual QA

Check the new-chat screen, an active conversation, long code blocks, dropdown menus, settings
modals, notifications, the collapsed sidebar, and a 375 px-wide mobile viewport. Keyboard focus must
remain visible, body text must retain WCAG AA contrast, and reduced-motion mode must stop all ambient
animation.
