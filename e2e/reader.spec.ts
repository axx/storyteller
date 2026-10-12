import { test, expect, chromium } from '@playwright/test';
import { resolve } from 'node:path';
import type { BrowserContext } from '@playwright/test';
import { demoChapter } from '../src/demo';

async function mockSpeech(context: BrowserContext) {
  await context.addInitScript(() => {
    const spoken: { text: string; onend?: () => void; onerror?: (event: { error: string }) => void }[] = [];
    Object.defineProperty(window, '__spoken', { value: spoken });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: class {
      text: string;
      constructor(text: string) { this.text = text; }
    } });
    Object.defineProperty(window, 'speechSynthesis', { value: {
      speak: (utterance: typeof spoken[number]) => spoken.push(utterance),
      cancel: () => {},
      getVoices: () => [{ name: 'Test narrator', voiceURI: 'test-local', lang: 'en-US', localService: true }],
      addEventListener: () => {},
    } });
  });
}

test('play, pause, seek, stop and restore chapter position', async ({ page, context }) => {
  await mockSpeech(context);
  await page.goto('/?demo');
  await expect(page.locator('#chapter-title')).toHaveText('The Last Light');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('#playback-status')).toHaveText('Reading aloud');
  await page.evaluate(() => (window as unknown as { __spoken: { onend: () => void }[] }).__spoken[0].onend());
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.locator('#playback-status')).toHaveText('Paused');
  await page.getByRole('button', { name: 'Next paragraph', exact: true }).click();
  await expect(page.locator('#paragraph-position')).toHaveText('2 / 9');
  await page.reload();
  await expect(page.locator('#paragraph-position')).toHaveText('2 / 9');
  await expect(page.locator('#playback-status')).toHaveText('Ready to listen');
  await page.getByRole('button', { name: 'Stop and reset', exact: true }).click();
  await expect(page.locator('#paragraph-position')).toHaveText('1 / 9');
  await expect(page.locator('#sidebar-percent')).toHaveText('0%');
});

test('preferences persist and imported text cannot inject markup', async ({ page, context }) => {
  await mockSpeech(context);
  await page.goto('/?demo');
  await page.locator('#voice').selectOption('test-local');
  await expect(page.locator('#voice-info')).toHaveText('On-device voice');
  await page.locator('#rate').fill('1.5');
  await page.locator('#font-size').fill('24');
  await page.getByRole('button', { name: 'Change color theme' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('#rate')).toHaveValue('1.5');
  await expect(page.locator('#font-size')).toHaveValue('24');
  await page.locator('#file-input').setInputFiles({ name: 'chapter.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...demoChapter, title: '<img src=x onerror=alert(1)>', paragraphs: ['<script>alert(1)</script>'] })) });
  await expect(page.locator('#chapter-title')).toHaveText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#paragraphs script, #chapter-title img')).toHaveCount(0);
  await page.locator('#file-input').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
  await expect(page.locator('#notice')).toHaveText('This file is not a valid StoryTeller chapter.');
});

test('renders separator-only paragraphs as visual story breaks and skips them in speech', async ({ page, context }) => {
  await mockSpeech(context);
  await page.goto('/');
  await page.locator('#file-input').setInputFiles({
    name: 'chapter.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      ...demoChapter,
      paragraphs: ['Before the break.', '<<<•>>>', 'After the break.'],
    })),
  });
  await expect(page.getByRole('separator', { name: 'Story break' })).toBeVisible();
  await expect(page.locator('.story-separator')).not.toContainText('<<<•>>>');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.evaluate(() => (window as unknown as { __spoken: { onend?: () => void }[] }).__spoken[0].onend?.());
  const spoken = await page.evaluate(() => (window as unknown as { __spoken: { text: string }[] }).__spoken.map(item => item.text));
  expect(spoken).toEqual(['Before the break.', 'After the break.']);
});

test('desktop and mobile layouts fit and expose working controls', async ({ page, context }) => {
  await mockSpeech(context);
  await page.goto('/?demo');
  await expect(page.locator('#chapter-title')).toBeVisible();
  await expect(page.locator('.sidebar .brand')).toHaveText('StoryTeller');
  await expect(page.locator('#chapter-loader')).toHaveCount(0);
  await expect(page.locator('#next-chapter')).toBeVisible();
  await expect(page.locator('#next-chapter').locator('xpath=..')).toHaveClass(/transport/);
  await page.screenshot({ path: 'test-results/reader-desktop.png', fullPage: true });
  for (const width of [1440, 1024, 900, 768, 651, 650, 390, 320]) {
    await page.setViewportSize({ width, height: 850 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next chapter' })).toBeVisible();
    const title = await page.locator('#chapter-title').boundingBox();
    const paragraph = await page.locator('[data-paragraph="0"]').boundingBox();
    expect(title!.y + title!.height).toBeLessThan(paragraph!.y);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/reader-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('#playback-status')).toHaveText('Reading aloud');
});

test('empty reader and popup show recoverable errors', async ({ page, context }) => {
  await mockSpeech(context);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'No chapter yet' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  await page.goto('/popup.html');
  await expect(page.locator('.popup .brand')).toHaveText('StoryTeller');
  await page.getByRole('button', { name: 'Read current page' }).click();
  await expect(page.locator('#popup-error')).toHaveText('Load the built extension in Chrome to read browser tabs.');
  await page.screenshot({ path: 'test-results/popup.png' });
});

test('production content-script bundle extracts chapters and selections', async ({ page }) => {
  await page.route('**/extraction-fixture', route => route.fulfill({
    contentType: 'text/html',
    body: `<title>A quiet harbor</title><nav>Account Subscribe</nav><article><h1>A quiet harbor</h1>${demoChapter.paragraphs.map(text => `<p>${text}</p>`).join('')}<p>Patreon: https://www.patreon.com/author/posts/123456789</p><p>Support: <a href="https://www.patreon.com/author">Read advance chapters on Patreon</a></p></article>`,
  }));
  await page.goto('/extraction-fixture');
  await page.evaluate(() => {
    Object.defineProperty(window, 'chrome', { value: { runtime: { id: 'test', onMessage: {
      addListener: (callback: unknown) => Object.defineProperty(window, '__extract', { value: callback }),
    } } } });
  });
  await page.addScriptTag({ path: resolve('dist/content.js') });
  const result = await page.evaluate(async () => new Promise<{ ok: boolean; chapter: typeof demoChapter }>(reply => {
    const extract = (window as unknown as { __extract: (message: unknown, sender: unknown, reply: unknown) => void }).__extract;
    extract({ target: 'extractor', mode: 'article' }, { id: 'test' }, reply);
  }));
  expect(result.ok).toBe(true);
  expect(result.chapter.paragraphs).toEqual(demoChapter.paragraphs);
  expect(result.chapter.title).toBe('A quiet harbor');
  await page.evaluate(() => {
    const range = document.createRange();
    range.selectNodeContents(document.querySelector('article p')!);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
  });
  const selected = await page.evaluate(async () => new Promise<{ ok: boolean; chapter: typeof demoChapter }>(reply => {
    (window as unknown as { __extract: (message: unknown, sender: unknown, reply: unknown) => void }).__extract({ target: 'extractor', mode: 'selection' }, { id: 'test' }, reply);
  }));
  expect(selected.chapter.paragraphs).toEqual([demoChapter.paragraphs[0]]);
});

test('unpacked extension worker opens one player and restores storage', async () => {
  const extensionPath = resolve('dist');
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  try {
    await mockSpeech(context);
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.evaluate(chapter => chrome.storage.local.set({ chapter, progress: { chapterId: chapter.id, chunkIndex: 3 } }), demoChapter);
    const playerCreated = context.waitForEvent('page');
    await popup.getByRole('button', { name: 'Open reader' }).click();
    const player = await playerCreated;
    await expect(player.locator('#chapter-title')).toHaveText('The Last Light');
    const playerUrl = player.url();
    await player.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(player.locator('#playback-status')).toHaveText('Reading aloud');
    const source = await context.newPage();
    await source.goto('http://127.0.0.1:5173/');
    await source.goto('http://127.0.0.1:5173/popup.html');
    await source.close();
    await expect(player.locator('#playback-status')).toHaveText('Reading aloud');
    const pauseReply = await player.evaluate(() => chrome.runtime.sendMessage({ target: 'worker', type: 'PAUSE' }));
    expect(pauseReply.ok).toBe(true);
    await expect(player.locator('#playback-status')).toHaveText('Paused');
    await player.evaluate(() => chrome.runtime.sendMessage({ target: 'worker', type: 'OPEN_PLAYER' }));
    expect(context.pages().filter(page => page.url() === playerUrl)).toHaveLength(1);
    await player.reload();
    await expect(player.locator('#chapter-title')).toHaveText('The Last Light');
    const saved = await player.evaluate(() => chrome.storage.local.get('progress'));
    expect(saved.progress).toMatchObject({ chunkIndex: 3 });
    await player.bringToFront();
    const denied = await player.evaluate(() => chrome.runtime.sendMessage({ target: 'worker', type: 'READ_PAGE', mode: 'article' }));
    expect(denied.ok).toBe(false);
    expect(denied.error).toContain('Open a web novel page');
  } finally { await context.close(); }
});