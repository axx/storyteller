import { extractChapter } from './extraction';

const host = globalThis as typeof globalThis & { folioExtractorInstalled?: boolean };
if (!host.folioExtractorInstalled) {
  host.folioExtractorInstalled = true;
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id !== chrome.runtime.id || message?.target !== 'extractor') return;
    try {
      if (message.mode !== 'article' && message.mode !== 'selection') throw new Error('Invalid extraction mode.');
      reply({ ok: true, chapter: extractChapter(document, message.mode) });
    } catch (error) {
      reply({ ok: false, error: error instanceof Error ? error.message : 'Could not extract this page.' });
    }
  });
}