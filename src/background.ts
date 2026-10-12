import { isChapter } from './model';
import { getSaved, saveChapter } from './storage';
import { waitForTabLoad } from './browser-tabs';
import type { PlayerRequest, Reply, WorkerRequest } from './protocol';

let opening: Promise<void> | null = null;
let extracting = false;

async function ensurePlayer(): Promise<void> {
  if (opening) return opening;
  opening = (async () => {
    const url = chrome.runtime.getURL('index.html');
    const tabs = await chrome.tabs.query({});
    const existing = tabs.find(tab => tab.url === url);
    if (existing?.id !== undefined) {
      await chrome.windows.update(existing.windowId, { focused: true });
      await chrome.tabs.update(existing.id, { active: true });
      await waitForTabLoad(existing.id);
      return;
    }
    const player = await chrome.tabs.create({ url });
    if (player.id === undefined) throw new Error('Could not open the StoryTeller reader tab.');
    await waitForTabLoad(player.id);
  })();
  try { return await opening; }
  finally { opening = null; }
}

async function tellPlayer(type: PlayerRequest['type']): Promise<Reply> {
  try { return await chrome.runtime.sendMessage({ target: 'player', type }); }
  catch { return { ok: false, error: 'Open the reader to continue.' }; }
}

async function loadNextChapter(): Promise<Reply> {
  if (extracting) return { ok: false, error: 'A chapter is already being extracted.' };
  extracting = true;
  let tabId: number | undefined;
  try {
    const { chapter } = await getSaved();
    if (!chapter?.nextUrl) return { ok: false, error: 'No next chapter link is available.' };
    const tab = await chrome.tabs.create({ url: chapter.nextUrl, active: false });
    if (tab.id === undefined) throw new Error('Could not open the next chapter page.');
    tabId = tab.id;
    const loadedTab = await waitForTabLoad(tab.id);
    if (!loadedTab.url || !/^https?:\/\//.test(loadedTab.url)) {
      return { ok: false, error: 'The next chapter page did not load successfully.' };
    }
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    const result = await chrome.tabs.sendMessage(tabId, { target: 'extractor', mode: 'article' });
    if (!result.ok) return { ok: false, error: result.error };
    if (!isChapter(result.chapter)) return { ok: false, error: 'The next chapter could not be extracted.' };
    await saveChapter(result.chapter);
  } finally {
    try {
      if (tabId !== undefined) await chrome.tabs.remove(tabId);
    } finally {
      extracting = false;
    }
  }
  const loaded = await tellPlayer('LOAD_CHAPTER');
  return loaded.ok ? { ok: true } : loaded;
}

async function handle(message: WorkerRequest): Promise<Reply> {
  if (message.type === 'OPEN_PLAYER') {
    await ensurePlayer();
    return { ok: true };
  }
  if (message.type === 'OPEN_NEXT_CHAPTER') return loadNextChapter();
  if (message.type === 'GET_STATUS' || message.type === 'PAUSE') return tellPlayer(message.type);
  if (message.type !== 'READ_PAGE' || !['article', 'selection'].includes(message.mode)) return { ok: false, error: 'Unknown command.' };
  if (extracting) return { ok: false, error: 'A chapter is already being extracted.' };
  extracting = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined || !tab.url || !/^https?:\/\//.test(tab.url)) {
      return { ok: false, error: 'Open a web novel page first. Browser settings and extension pages cannot be read.' };
    }
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    const result = await chrome.tabs.sendMessage(tab.id, { target: 'extractor', mode: message.mode });
    if (!result.ok) return { ok: false, error: result.error };
    if (!isChapter(result.chapter)) return { ok: false, error: 'The extracted chapter is invalid or too large.' };
    await saveChapter(result.chapter);
    await ensurePlayer();
    const loaded = await tellPlayer('LOAD_CHAPTER');
    if (!loaded.ok) return loaded;
    await chrome.tabs.remove(tab.id);
    return { ok: true };
  } finally { extracting = false; }
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || message?.target !== 'worker') return;
  handle(message).then(reply).catch(error => reply({
    ok: false,
    error: error instanceof Error ? error.message : 'Unable to read this page. Try reloading it.',
  }));
  return true;
});