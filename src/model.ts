export interface Chapter {
  id: string;
  sourceUrl: string;
  title: string;
  paragraphs: string[];
  extractedAt: number;
  mode: 'article' | 'selection';
}

export interface Preferences {
  rate: number;
  voiceURI: string;
  theme: 'light' | 'dark';
  fontSize: number;
}

export interface ReadingProgress {
  chapterId: string;
  chunkIndex: number;
}

export const defaultPreferences: Preferences = {
  rate: 1,
  voiceURI: '',
  theme: 'light',
  fontSize: 20,
};

export function isChapter(value: unknown): value is Chapter {
  if (!value || typeof value !== 'object') return false;
  const chapter = value as Partial<Chapter>;
  try {
    if (typeof chapter.sourceUrl !== 'string' || !['http:', 'https:'].includes(new URL(chapter.sourceUrl).protocol)) return false;
  } catch { return false; }
  return typeof chapter.id === 'string' && typeof chapter.title === 'string'
    && typeof chapter.sourceUrl === 'string' && /^https?:\/\//.test(chapter.sourceUrl)
    && typeof chapter.extractedAt === 'number'
    && (chapter.mode === 'article' || chapter.mode === 'selection')
    && Array.isArray(chapter.paragraphs) && chapter.paragraphs.length > 0
    && chapter.paragraphs.every(paragraph => typeof paragraph === 'string' && paragraph.trim().length > 0)
    && chapter.paragraphs.join('').length <= 1_000_000;
}