# Icon Asset Layout

Use this directory as the single source of truth for all UI icons.

## Folders

- `icons/app/`
  - App-specific UI icons used by the main study interface.
  - These are loaded via `data-src` and inlined at runtime.

- `icons/bootstrap/`
  - Bootstrap Icons used in the app UI (navigation, controls, actions).
  - Keep filenames aligned with official Bootstrap icon IDs.

- `icons/bootstrap/filetypes/`
  - Bootstrap filetype icons used by the deck import file-picker indicator.
  - Filename pattern: `filetype-<ext>.svg` plus `paperclip.svg` fallback.

- `icons/brands/`
  - Third-party/brand marks (for example: `enwiktionary.svg`).

## Usage Rules

- Prefer local icons from this directory. Do not reference remote icon URLs in templates.
- Use `svg[data-src="icons/..."]` placeholders and inline them at runtime so icons inherit `currentColor`.
- Keep icon names lowercase and hyphenated.
- When adding a new Bootstrap icon, place it in `icons/bootstrap/` (or `icons/bootstrap/filetypes/` for filetype glyphs).
