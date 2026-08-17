# Bundled Excalidraw libraries

This directory is a vendored snapshot of the distributable Excalidraw Libraries catalog.

- All 231 resources referenced by `libraries.json` are copied with a `.json` storage suffix so Vite never treats them as source modules. Their content remains the original Excalidraw library JSON.
- `index.json` contains 4134 lightweight searchable item records and never embeds raw element JSON.
- Preview images, the catalog website, and historical download statistics are intentionally excluded from the application runtime.
- Upstream license: see `LICENSE.excalidraw-libraries`.
- Refresh from a local checkout with `node scripts/copy-ai-library-catalog.mjs [source-directory]`.
