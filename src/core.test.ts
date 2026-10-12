// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://example.com/novel/1" }
import { describe, expect, it, vi } from 'vitest';
import { extractChapter } from './extraction';
import { Narrator, makeChunks } from './narration';
import { isChapter } from './model';
import type { Chapter } from './model';

const chapter: Chapter = {
  id: 'chapter-1', sourceUrl: 'https://example.com/chapter', title: 'A chapter',
  paragraphs: ['First sentence. Second sentence.', 'Another paragraph.'],
  extractedAt: 1, mode: 'article',
};

function setup() {
  const spoken: SpeechSynthesisUtterance[] = [];
  const synthesis = { speak: vi.fn(utterance => spoken.push(utterance)), cancel: vi.fn() };
  const narrator = new Narrator(vi.fn(), synthesis, text => ({ text } as SpeechSynthesisUtterance));
  narrator.load(chapter);
  return { narrator, spoken, synthesis };
}

describe('chapter extraction', () => {
  it('extracts article text without modifying the original document', () => {
    const source = document;
    source.documentElement.innerHTML = `<head><title>A quiet harbor</title></head><body><nav>Log in</nav><article><h1>A quiet harbor</h1>${Array.from({ length: 6 }, () => '<p>The harbor was quiet that morning. Mara walked along the seawall, listening to the water beneath the old wooden pier.</p>').join('')}</article></body>`;
    const before = source.documentElement.outerHTML;
    const result = extractChapter(source, 'article');
    expect(result.title).toBe('A quiet harbor');
    expect(result.paragraphs).toHaveLength(6);
    expect(result.paragraphs.join(' ')).not.toContain('Log in');
    expect(source.documentElement.outerHTML).toBe(before);
    expect(isChapter(result)).toBe(true);
  });

  it('rejects empty selections and unsafe chapter data', () => {
    const source = document;
    source.body.innerHTML = '<p>Text</p>';
    expect(() => extractChapter(source, 'selection')).toThrow('Select some');
    expect(isChapter({ ...chapter, sourceUrl: 'javascript:alert(1)' })).toBe(false);
    expect(isChapter({ ...chapter, sourceUrl: 'https://' })).toBe(false);
    expect(isChapter({ ...chapter, paragraphs: [] })).toBe(false);
  });

  it('filters URL-heavy selected lines but keeps prose with incidental URLs', () => {
    document.body.textContent = [
      'Patreon: https://www.patreon.com/author/posts/123456789',
      'WWW.PATREON.COM/author',
      'https://example.com/one https://example.com/two',
      'Mara read the address https://example.com in her notebook, then carefully closed it and continued down the long winding road toward the harbor.',
      'The keeper mentioned Patreon, but the conversation soon turned to the missing boat and the storm beyond the lighthouse.',
    ].join('\n');
    const range = document.createRange();
    range.selectNodeContents(document.body);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    const result = extractChapter(document, 'selection');
    expect(result.paragraphs).toHaveLength(2);
    expect(result.paragraphs[0]).toContain('Mara read the address');
    expect(result.paragraphs[1]).toContain('keeper mentioned Patreon');
    selection.removeAllRanges();
  });

  it('filters linked promotional paragraphs while preserving linked story prose', () => {
    const story = 'The harbor was quiet that morning. Mara walked along the seawall, listening to the water beneath the old wooden pier.';
    const incidental = 'Mara found <a href="https://example.com/map">a map</a> in the drawer, beside an old compass and the letters her grandfather had written before leaving for the northern coast.';
    document.documentElement.innerHTML = `<head><title>A quiet harbor</title></head><body><article><h1>A quiet harbor</h1>${Array.from({ length: 6 }, () => `<p>${story}</p>`).join('')}<p>Support: <a href="https://www.patreon.com/author">Read advance chapters on Patreon</a></p><p>Link: <a href="https://www.patreon.com/author">https://www.patreon.com/author</a></p><p>${incidental}</p></article></body>`;
    const result = extractChapter(document, 'article');
    expect(result.paragraphs).toContain(story);
    expect(result.paragraphs.join(' ')).toContain('Mara found a map');
    expect(result.paragraphs.join(' ')).not.toContain('Patreon');
    expect(result.paragraphs.join(' ')).not.toContain('patreon.com');
  });

  it('rejects a selection containing only URL-heavy paragraphs', () => {
    document.body.textContent = 'https://www.patreon.com/author\nwww.example.com';
    const range = document.createRange();
    range.selectNodeContents(document.body);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    expect(() => extractChapter(document, 'selection')).toThrow('No readable paragraphs remain');
    selection.removeAllRanges();
  });
});

describe('chunked narration', () => {
  it('bounds normal prose and retains paragraph mapping', () => {
    const chunks = makeChunks(['A long story '.repeat(100) + 'word'.repeat(200), 'The end.']);
    expect(chunks.every(chunk => chunk.text.length <= 240)).toBe(true);
    expect(chunks.at(-1)?.paragraphIndex).toBe(1);
  });

  it('advances and completes without losing the saved position', () => {
    const { narrator, spoken } = setup();
    narrator.play();
    spoken[0].onend?.({} as SpeechSynthesisEvent);
    expect(narrator.chunkIndex).toBe(1);
    spoken[1].onend?.({} as SpeechSynthesisEvent);
    spoken[2].onend?.({} as SpeechSynthesisEvent);
    expect(narrator.state).toBe('completed');
    expect(narrator.chunkIndex).toBe(3);
    narrator.load(chapter, 3);
    expect(narrator.state).toBe('completed');
  });

  it('ignores canceled callbacks and resumes the current chunk', () => {
    const { narrator, spoken } = setup();
    narrator.play();
    narrator.pause();
    spoken[0].onend?.({} as SpeechSynthesisEvent);
    expect(narrator.chunkIndex).toBe(0);
    expect(narrator.state).toBe('paused');
    narrator.play();
    expect(spoken[1].text).toBe(spoken[0].text);
    narrator.seekParagraph(1);
    expect(narrator.chunkIndex).toBe(2);
    expect(narrator.state).toBe('playing');
    narrator.stop();
    expect(narrator.chunkIndex).toBe(0);
    expect(narrator.state).toBe('idle');
  });

  it('reports voice errors and can retry', () => {
    const { narrator, spoken } = setup();
    narrator.play();
    spoken[0].onerror?.({ error: 'voice-unavailable' } as SpeechSynthesisErrorEvent);
    expect(narrator.state).toBe('error');
    narrator.play();
    expect(narrator.state).toBe('playing');
    expect(narrator.error).toBe('');
  });

  it('does not restart speech when unchanged settings are applied', () => {
    const { narrator, synthesis } = setup();
    narrator.play();
    const calls = synthesis.speak.mock.calls.length;
    narrator.configure(1, null);
    expect(synthesis.speak).toHaveBeenCalledTimes(calls);
    expect(narrator.state).toBe('playing');
  });
});