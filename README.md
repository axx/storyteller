# StoryTeller

A Chrome Manifest V3 extension that extracts web novel chapters and reads them aloud in a dedicated player tab. Built with TypeScript, Vite, Mozilla Readability, and the browser's Web Speech API. No backend or native companion app.

## Install In Chrome

Requires Node.js 22.12+ (or a supported newer release) and a current desktop Chrome browser.

```sh
npm install
npm run build
```

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this project's `dist` directory.
4. Pin **StoryTeller - Web Novel Reader** in the extensions menu.
5. Open a novel chapter, click StoryTeller, and choose **Read current page**.
6. Review the extracted text in the reader and press **Play**.

If extraction includes navigation or misses the chapter, select the desired text on the source page and choose **Read selected text** instead. After rebuilding, reload the extension in `chrome://extensions` and reload any existing player tab.

## First-Version Features

- Extraction from the active tab only after an explicit extension action.
- Selected-text fallback and safe plain-text rendering.
- URL-heavy paragraph filtering: omit paragraphs where at least half of the non-whitespace text is explicit HTTP/HTTPS or www URLs. Full-page extraction also counts HTTP/HTTPS hyperlink labels, without double-counting visible URLs inside links. Longer prose with incidental links is preserved.
- Dedicated player tab independent of the popup and source page.
- Play, pause, stop/reset, paragraph navigation, and paragraph highlighting.
- Voice selection, speed control, light/dark theme, and text size.
- Local storage of one chapter snapshot, preferences, and chunk-level progress.
- Chapter JSON import with size and schema validation.

Use the player tab's Play button to start narration. The popup can pause an active player and reopen it. Clicking a paragraph seeks there; it continues speaking only if playback was already active. Closing the player stops speech; reopening restores the saved position without autoplay. Importing or extracting a new chapter replaces the previous one.

## Development

```sh
npm run dev -- --host 127.0.0.1
```

Visit `http://127.0.0.1:5173/?demo` for the reader with an original sample story, or `/popup.html` for the popup preview. The normal web preview cannot access browser tabs; use the unpacked extension for extraction. The sample chapter is loaded only in non-extension preview mode, when `?demo` is present and no chapter is saved.

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Playwright starts its own Vite server if one is not already running on port 5173. Browser test screenshots and failure traces are placed in `test-results`.

## Architecture

| Module | Ownership |
| --- | --- |
| `src/background.ts` | Route commands, request extraction, persist a chapter, and open/focus a single player tab |
| `src/content.ts` and `src/extraction.ts` | Inject on demand, clone the source DOM, extract via Readability or selection, normalize paragraphs |
| `src/player.ts` | Reader UI, voices, preferences, messaging, and progress persistence |
| `src/narration.ts` | Playback state machine, short speech chunks, cancellation handling, seek, and recoverable errors |
| `src/storage.ts` | Chrome local storage; localStorage fallback for development previews |
| `src/popup.ts` | Extraction entry points, saved chapter summary, open player, and pause |

The player, not the service worker or popup, owns speech playback. The service worker may suspend without losing the player's state. Extracted chapters are snapshots, so source-page navigation cannot change the queued text.

Vite bundles the player, popup, and module service worker. esbuild produces a separate, self-contained content-script IIFE. Scripts, fonts, and icons are bundled locally; the extension does not load executable code from a CDN. Only `activeTab`, `scripting`, and `storage` permissions are requested.

## Limitations And Privacy

- Keep the player tab open during narration. Computer sleep, browser tab freezing/discarding, and browser speech-engine bugs can interrupt playback.
- Pause cancels the current utterance for consistent recovery. Resume replays the current chunk. Voice/speed changes also restart that chunk. No word-exact resume is promised.
- Voices and quality depend on your system and browser. Voices marked **Online voice** may send text to the voice provider. The default voice's locality is not guaranteed. StoryTeller itself has no server, telemetry, or cloud account.
- Readability is a general article extractor, not a site-specific novel parser. Inspect the extracted text before listening. Content not loaded into the page, restricted browser pages, and inaccessible embedded frames may not be extractable.
- URL filtering is a text-density heuristic, not a blanket Patreon or promotional-content blocklist. Selected-text mode sees visible text only, not link destinations. Filtering applies during new extraction; re-extract previously saved chapters to apply it. Imported chapter JSON is not filtered.
- No automatic next-chapter loading, chapter library, or cloud voice provider in this version.
- Duration labels are estimates based on word count and selected speed, not measured audio timestamps.
- Chapter text and preferences remain in Chrome's local extension storage, not sync storage. The most recent chapter remains saved until replaced, Chrome clears its data, or the extension is removed.

## Validation

Automated checks cover extraction, cancellation, chunk progression, completion, error recovery, resume, preferences, safe imported text, responsive layouts from 320 to 1440 pixels, production content-script extraction, and real unpacked-extension storage/messaging/tab reuse. Speech is mocked in browser workflow tests so state transitions are deterministic.

Before relying on a particular site or voice, manually check:

1. Use the actual Chrome toolbar action on that site's chapter. Programmatic popup opening does not grant `activeTab` and cannot substitute for this permission check.
2. Listen with a real installed voice through several paragraphs, including a long chapter; confirm pronunciation and uninterrupted audio while switching tabs.
3. Close the popup and navigate/close the source tab during playback; keep the player tab open.
4. Pause, reopen the player, and confirm the saved chunk resumes. Test selected text on a page that Readability handles poorly.