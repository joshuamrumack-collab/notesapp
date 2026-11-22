# Notes App (working title)

OneNote's free pages, Obsidian's plain folders, and notebooks that know what they are for.
A notebook is a folder, a section is a subfolder, a page is a file: `.canvas` pages use the open
[JSON Canvas](https://jsoncanvas.org/) format, `.md` pages are plain Markdown, `.locked` pages are encrypted.

## Install

Run `Notes App_x.y.z_x64-setup.exe`. It installs for your Windows user only, no administrator rights needed.
Windows may say "Windows protected your PC" because the installer is not code-signed: click **More info → Run anyway**.

## Updates

The app checks for a new version when it starts (and from Settings → Kit and tools → Check for updates).
When one is found it shows **Update and restart**: it downloads, installs over the old version and restarts.
Your notebooks are folders of their own and are never touched by an update.

Updates come from this repository's GitHub releases. To publish a new version:

```
npm run release 0.2.0
```

This sets the version, commits, tags and pushes. GitHub Actions (`.github/workflows/release.yml`) builds the
installer, signs the update with the `TAURI_SIGNING_PRIVATE_KEY` repository secret and publishes the release.
Every installed copy then offers the update. Keep the private signing key safe: without it you cannot publish
updates that installed copies will accept.

## Run it from the source code

Needs [Node.js](https://nodejs.org/) 20 or newer.

```
npm install
npm run dev
```

Open http://localhost:1420 in Chrome or Edge. "Try the demo campaign" needs no files.

### As a desktop app (needed for OneNote import)

Also needs [Rust](https://rustup.rs/) and the Microsoft C++ Build Tools (https://tauri.app/start/prerequisites/).

```
npm run tauri dev      # run the desktop app
npm run tauri build    # make an installer in src-tauri/target/release/bundle
```

## What it does

**Pages and sections**
- Canvas pages: click anywhere and type, drag the bar above a box to move it, drag its right edge to resize.
- Markdown shortcuts while typing: `# ` heading, `- ` list, `[ ] ` checkbox, `> ` quote, tables.
- Paste, drop or add images (stored in `_attachments/`).
- Nested sections, page order by drag and drop, subpages with Tab / Shift+Tab in the page list.
- Rename, delete (to `_trash/`), print or save as PDF.

**Links and search**
- "🔗 Link to page" (or Ctrl+K) above every page: pick a page from a searchable list. Select some text first
  to turn it into the link. Or type `[[` in the text for the same list.
- Card fields can link to other pages: an NPC's Location, a quest's Given by, a location's Map. Pick from a
  dropdown that lists only the right kind of card (only Locations for Location), or make a new one from it.
- Click a link to open it (a missing page is created).
- "Linked from" panel under each page. Renaming a page updates the links to it.
- Ctrl+P: go to a page. Ctrl+Shift+F: search all text. Ctrl+N: new page.
- `![[image.png]]` and Markdown images show inside notes.

**Cards and views**
- A card is a box (or a whole page) with fields: `+ Card…` above a canvas page, or "Make this page a card" on a text page.
- Views collect every card of a type: tables (sortable), boards (drag a card to change its status) and week schedules.

**Notebook types (kits)**: General, Dungeon Master, Teacher planning, Game design
- A kit adds starter sections, card types, views, templates and tools. It never changes existing pages.
- Dungeon Master: NPC, monster, location, quest, item and session cards, dice roller, initiative tracker,
  and player-safe mode, which hides secret boxes (◑), `> [!secret]` callouts and secret cards and pages.
- Settings: edit card types, fields and views; save the notebook's setup as a `.kit.json` file to reuse or share.
- New from template: `{{title}}`, `{{date}}` and `{{time}}` are filled in.

**Locked pages**
- "Lock" encrypts a page with a password (AES-256-GCM, key from PBKDF2-SHA256, 310,000 rounds).
  There is no way to recover a forgotten password. Images on a locked page are not encrypted.

**Import**
- Obsidian: open the vault folder. Notes, folders, links, images and properties work as they are; the
  `.obsidian` folder is not touched; the vault's own templates folder is used.
- OneNote (desktop app on Windows): "Import OneNote" reads notebooks from the OneNote desktop app through its
  COM interface. Keeps sections, section groups, page order, subpages, box positions, formatting, lists,
  checkboxes, tables, images and links between pages. Handwriting, drawings, recordings, attached files and
  maths are listed in an import report instead.

## Good to know

- Editing a `.md` note rewrites its Markdown. The first time this app changes a note, the original is copied
  to `_trash/backups/`. Try it on a copy of an Obsidian vault first. Templater code (`<% %>`) is left as text.
- Settings, page order and the initiative tracker are kept in the hidden `.notesapp` folder of each notebook.
- Card fields are YAML properties at the top of the note or box, so Obsidian shows them too.

## Code map

- `src/App.tsx` - layout, sections, page list, page actions, dialogs
- `src/components/` - canvas page, text page, cards, views, tools, dialogs, OneNote import
- `src/lib/storage.ts` - all file access (desktop, browser, in-memory demo)
- `src/lib/index.ts` - search, links, backlinks, cards
- `src/lib/kits.ts` - the four built-in notebook types
- `src/lib/onenote.ts`, `onenote-import.ts` - OneNote XML to pages
- `src/lib/crypto.ts` - locked pages
- `src-tauri/src/lib.rs` - file commands and the OneNote bridge for the desktop app

`npm test` runs the unit tests.
