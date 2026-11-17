# Daybook

**[Open Daybook](https://tongvu.github.io/daily-expense-log/)**

A quiet, private place to keep track of daily spending. Record expenses by day, with optional amounts, notes, details, and photos. The interface is available in English and Vietnamese.

Expenses are stored in your browser on your device; they are not synced to an account or shared between devices. Clearing this browser's site data may remove them.

## Develop

Requires Node.js 22.22.2+, 24.15+, or 26+, and Python 3. Run from the repository root:

```sh
npm ci
npm run dev
```

Open `http://localhost:8080`. There is no build step or runtime framework: `dist/` is the hand-maintained website, not generated output. Node dependencies are only development tools and tests. GitHub Pages publishes `dist/` through the existing manually triggered deployment workflow.

```sh
npm run format  # Format source, styles, tests, and documentation
npm run check   # Check formatting and run regression tests
```

## Where to change things

- `dist/index.html`: page structure and the three-step expense form.
- `dist/styles.css`: readable, component-grouped CSS. Sections cover foundation/tokens, shell/language switch, calendar, daily expenses, form, overlays, utilities, and responsive overrides.
- `dist/app.js`: UI state, DOM rendering, event handlers, and startup. Section comments mark each responsibility.
- `dist/js/storage.js`: IndexedDB access. Its API reads, stores, and removes expenses without depending on the UI.
- `dist/js/i18n.js`: active language, translation loading, and localized counts.
- `dist/js/formatting.js`: local date keys and locale-aware date/amount formatting.
- `dist/js/clipboard.js`: clipboard API and legacy fallback.
- `dist/locales/en.json` and `dist/locales/vi.json`: matching translation dictionaries, keyed by English text.
- `dist/service-worker.js`: offline asset list and cache version.
- `tests/`: storage/locale tests, DOM-based app flows, CSS duplicate checks, and offline asset coverage.

## Maintenance rules

### CSS

Edit a component's existing rule rather than appending a patch at the top or bottom. Each selector has one rule per cascade scope; tests reject duplicate selectors and duplicate properties. Keep state rules next to their component and viewport/motion overrides at the end.

Reuse the `:root` tokens for shared fonts, colors, field borders, placeholders, and focus rings. Keep one-off component details local; do not introduce an abstraction for every pixel value. Avoid IDs and `!important` for styling; the visibility utility is the deliberate exception.

### JavaScript and data

Keep DOM behavior in `app.js`, and helpers that do not require the UI in `dist/js/`. Use native ES modules with explicit relative `.js` imports. Keep expense persistence behind `storage.js`; do not scatter IndexedDB transactions through UI handlers.

The existing database is `daybook-expenses`, version `1`, with an `expenses` store keyed by `id`. Preserve compatibility with saved records, including optional amounts and photo blobs. A future schema change needs a deliberate IndexedDB migration, not a renamed database.

### Offline updates

After changing any shipped file, bump `CACHE_NAME` in `dist/service-worker.js`. Add new runtime files to `APP_FILES`; tests check that the offline list covers the website, including imported modules. The worker is cache-first, so during development use DevTools to unregister it or clear the **local test site's** cache when necessary. Do not clear site data on an installation containing real expenses.

### Verification

Run `npm run check` before review. The same checks run in CI for pushes and pull requests. DOM tests cover the wizard, optional/invalid amounts, editing, deletion, language round trips, photo viewing, copying, and calendar navigation. They do not replace browser checks for layout, camera permissions, or real offline operation.

For a UI change, check calendar/day/form views in both languages at narrow mobile and desktop widths. For an offline change, also load once online, wait for the worker to activate, then reload without a network connection. Use an isolated browser profile or test origin; do not test destructive flows against real expense data.
