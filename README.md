# Cosmos Homepage

Turn an Obsidian vault into a calm, interactive starfield homepage.

Cosmos surfaces what already exists in your vault—recent notes, unfinished tasks, creation activity, and recurring tags—without requiring a special folder structure, Dataview, an account, or an external service.

![Cosmos Homepage overview](./assets/cosmos-homepage.png)

## What it gives you

- **Overview:** recent notes, open Markdown tasks, and clear vault activity counts.
- **Focus orbit:** a local 25-minute focus timer with configurable duration.
- **Activity calendar:** glowing dates show when notes were created; select a date to open its notes.
- **Knowledge atlas:** your most-used tags become interactive star systems that open a real note from that theme.
- **Accessible motion:** keyboard focus, honest empty states, mobile layout, and reduced-motion support.

## Use

1. Select the sparkle icon in the ribbon, or run **Cosmos Homepage: Open homepage** from the command palette.
2. Switch between Overview, Focus, Calendar, and Atlas.
3. Select any note or star to open the corresponding Markdown file.
4. Open **Settings → Cosmos Homepage** to change the headline, focus duration, excluded folders, startup behavior, or motion preference.

Cosmos does not take over your workspace after installation. Enable **Open on startup** if you want it to open automatically after Obsidian restores your workspace.

## Data and privacy

Cosmos Homepage is local and read-only:

- It reads Markdown file metadata already indexed by Obsidian: file names, paths, timestamps, tags, frontmatter creation dates, and task positions.
- It does **not** read note bodies to build the homepage.
- It does **not** modify notes, create files, connect to the internet, use telemetry, display ads, require an account, or call an AI service.
- Settings are stored with Obsidian's plugin data API.

Excluded folder paths are never included in the homepage projection. The defaults exclude `.trash` and `Templates`.

## Limits

- The activity calendar uses a note's `created`, `created_at`, or `date` frontmatter when available, then falls back to the file creation time provided by Obsidian.
- Atlas stars represent tags, not semantic similarity. A future version may add optional data adapters, but version 1 has no network or AI integration.
- The focus timer is session-local and intentionally does not write tracking data into the vault.

## Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from a release.
2. Put them in `<your-vault>/.obsidian/plugins/cosmos-homepage/`.
3. Reload Obsidian and enable **Cosmos Homepage** in Community plugins.

## Development

```bash
npm install
npm run release:verify
```

The release build is `main.js`; `manifest.json` and `styles.css` are shipped alongside it.

## License

[MIT](./LICENSE)
