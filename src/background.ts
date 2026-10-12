import { isChapter } from './model';
import { saveChapter } from './storage';
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
      return;
    }
    await chrome.tabs.create({ url });
  })();
  try { return await opening; }
  finally { opening = null; }
}

async function tellPlayer(type: PlayerRequest['type']): Promise<Reply> {
  try { return await chrome.runtime.sendMessage({ target: 'player', type }); }
  catch { return { ok: false, error: 'Open the reader to continue.' }; }
}

async function handle(message: WorkerRequest): Promise<Reply> {
  if (message.type === 'OPEN_PLAYER') {
    await ensurePlayer();
    return { ok: true };
  }
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
    await tellPlayer('LOAD_CHAPTER');
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