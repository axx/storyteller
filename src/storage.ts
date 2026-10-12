import { defaultPreferences, isChapter } from './model';
import type { Chapter, Preferences, ReadingProgress } from './model';

export const isExtension = typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id);

export async function readStorage(): Promise<Record<string, unknown>> {
  if (isExtension) return chrome.storage.local.get(['chapter', 'preferences', 'progress']);
  try { return JSON.parse(localStorage.getItem('folio') || '{}'); }
  catch { return {}; }
}

export async function writeStorage(values: Record<string, unknown>) {
  if (isExtension) await chrome.storage.local.set(values);
  else localStorage.setItem('folio', JSON.stringify({ ...await readStorage(), ...values }));
}

export async function getSaved() {
  const saved = await readStorage();
  const chapter = isChapter(saved.chapter) ? saved.chapter : null;
  const candidate = saved.preferences as Partial<Preferences> | undefined;
  const preferences: Preferences = {
    rate: typeof candidate?.rate === 'number' && Number.isFinite(candidate.rate) ? Math.max(0.5, Math.min(2, candidate.rate)) : defaultPreferences.rate,
    voiceURI: typeof candidate?.voiceURI === 'string' ? candidate.voiceURI : '',
    theme: candidate?.theme === 'dark' ? 'dark' : 'light',
    fontSize: typeof candidate?.fontSize === 'number' && Number.isFinite(candidate.fontSize) ? Math.max(16, Math.min(28, candidate.fontSize)) : defaultPreferences.fontSize,
  };
  const progress = saved.progress as Partial<ReadingProgress> | undefined;
  const chunkIndex = progress?.chapterId === chapter?.id && typeof progress?.chunkIndex === 'number'
    && Number.isFinite(progress.chunkIndex) ? progress.chunkIndex : 0;
  return { chapter, preferences, chunkIndex };
}

export async function saveChapter(chapter: Chapter) {
  await writeStorage({ chapter, progress: { chapterId: chapter.id, chunkIndex: 0 } });
}