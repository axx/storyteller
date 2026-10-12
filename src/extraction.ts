import { Readability } from '@mozilla/readability';
import type { Chapter } from './model';

function isUrlHeavy(text: string, block?: Element, sourceUrl?: string): boolean {
  const length = text.replace(/\s/g, '').length;
  if (!length) return false;
  let linkedLength = 0;
  let remaining = text;
  if (block) {
    const clone = block.cloneNode(true) as Element;
    clone.querySelectorAll('a[href]').forEach(anchor => {
      try {
        const url = new URL(anchor.getAttribute('href')!, sourceUrl);
        if (!['http:', 'https:'].includes(url.protocol)) return;
        linkedLength += (anchor.textContent || '').replace(/\s/g, '').length;
        anchor.replaceWith(' ');
      } catch { return; }
    });
    remaining = clone.textContent || '';
  }
  const urls = remaining.match(/(?:https?:\/\/|www\.)[^\s<>"']+/gi) || [];
  const urlLength = urls.reduce((sum, url) => sum + url.length, 0);
  return (linkedLength + urlLength) / length >= 0.5;
}

export function extractChapter(document: Document, mode: Chapter['mode']): Chapter {
  const sourceUrl = document.location.href;
  if (!/^https?:\/\//.test(sourceUrl)) throw new Error('Open a normal HTTP or HTTPS page first.');
  let title = document.title || 'Untitled chapter';
  let paragraphs: string[];
  if (mode === 'selection') {
    const selected = document.getSelection()?.toString().trim();
    if (!selected) throw new Error('Select some chapter text on the page, then try again.');
    paragraphs = selected.split(/\n\s*\n|\n/).map(text => text.trim()).filter(Boolean);
  } else {
    const article = new Readability(document.cloneNode(true) as Document).parse();
    if (!article?.content) throw new Error('No chapter found. Try selecting the text instead.');
    title = article.title || title;
    const parsed = new DOMParser().parseFromString(article.content, 'text/html');
    parsed.querySelectorAll('script, style, nav, button, form, iframe').forEach(element => element.remove());
    const blocks = Array.from(parsed.querySelectorAll('p, h2, h3, blockquote, pre, li'))
      .filter(element => !element.querySelector('p, h2, h3, blockquote, pre, li'));
    paragraphs = blocks.filter(element => !isUrlHeavy(element.textContent || '', element, sourceUrl))
      .map(element => element.textContent?.replace(/\s+/g, ' ').trim() || '').filter(Boolean);
    if (!blocks.length) {
      paragraphs = (parsed.body.innerText || parsed.body.textContent || '').split(/\n+/)
        .map(text => text.trim()).filter(Boolean);
    }
  }
  paragraphs = paragraphs.filter(text => !isUrlHeavy(text));
  if (!paragraphs.length) throw new Error('No readable paragraphs remain after filtering URL-heavy text.');
  if (mode === 'article' && paragraphs.join(' ').length < 80) throw new Error('Not enough chapter text found. Try selecting the text instead.');
  if (paragraphs.join('').length > 1_000_000) throw new Error('This chapter is too large. Select a smaller section.');
  return { id: crypto.randomUUID(), sourceUrl, title, paragraphs, extractedAt: Date.now(), mode };
}