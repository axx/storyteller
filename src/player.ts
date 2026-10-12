import { element, refreshIcons } from './ui';
import { Narrator } from './narration';
import { getSaved, isExtension, saveChapter, writeStorage } from './storage';
import { defaultPreferences, hasReadableText, isChapter } from './model';
import type { Chapter, Preferences } from './model';
import type { PlayerStatus } from './protocol';

let chapter: Chapter | null = null;
let preferences: Preferences = { ...defaultPreferences };
let voices: SpeechSynthesisVoice[] = [];
let ready = false;
let saveQueue = Promise.resolve();
let lastHighlighted = -1;
let loadGeneration = 0;
let openingNext = false;
const narrator = new Narrator(updatePlayback);

function showError(text: string) {
  element('notice').textContent = text;
  element('notice').hidden = !text;
}

function persist(values: Record<string, unknown>) {
  saveQueue = saveQueue.then(() => writeStorage(values)).catch(() => showError('Could not save on this device. Your current session is still available.'));
}

function paragraphIndex() {
  return narrator.chunks[narrator.chunkIndex]?.paragraphIndex ?? Math.max(0, (chapter?.paragraphs.length || 1) - 1);
}

function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function updatePlayback() {
  const playing = narrator.state === 'playing';
  const current = paragraphIndex();
  const count = chapter?.paragraphs.length || 0;
  const ratio = narrator.chunks.length ? narrator.chunkIndex / narrator.chunks.length : 0;
  const percent = Math.round(ratio * 100);
  element('play').innerHTML = `<i data-lucide="${playing ? 'pause' : 'play'}"></i>`;
  element('play').setAttribute('aria-label', playing ? 'Pause' : 'Play');
  element('play').title = playing ? 'Pause' : 'Play';
  element<HTMLButtonElement>('play').disabled = !chapter;
  element<HTMLButtonElement>('stop').disabled = !chapter;
  element<HTMLButtonElement>('previous').disabled = !chapter || !narrator.chunks.some(chunk => chunk.paragraphIndex < current);
  element<HTMLButtonElement>('next').disabled = !chapter || !narrator.chunks.some(chunk => chunk.paragraphIndex > current);
  const status = { idle: 'Ready to listen', playing: 'Reading aloud', paused: 'Paused', completed: 'Chapter finished', error: 'Playback interrupted' }[narrator.state];
  element('playback-status').textContent = chapter ? status : 'Ready when you are';
  element('paragraph-position').textContent = chapter ? `${current + 1} / ${count}` : '-- / --';
  element('position-summary').textContent = chapter ? `Paragraph ${current + 1} of ${count}` : 'No chapter loaded';
  element('sidebar-percent').textContent = `${percent}%`;
  element('sidebar-meter').style.width = `${percent}%`;
  const seek = element<HTMLInputElement>('seek');
  seek.disabled = !chapter;
  seek.max = String(Math.max(1, count - 1));
  seek.value = String(current);
  seek.style.setProperty('--progress', `${percent}%`);
  const allWords = narrator.chunks.reduce((sum, chunk) => sum + chunk.text.split(/\s+/).length, 0);
  const readWords = narrator.chunks.slice(0, narrator.chunkIndex).reduce((sum, chunk) => sum + chunk.text.split(/\s+/).length, 0);
  element('elapsed').textContent = clock(readWords / (180 * preferences.rate) * 60);
  element('duration').textContent = clock(allWords / (180 * preferences.rate) * 60);
  if (lastHighlighted !== current) {
    document.querySelector('.is-current')?.classList.remove('is-current');
    const paragraph = document.querySelector<HTMLElement>(`[data-paragraph="${current}"]`);
    paragraph?.classList.add('is-current');
    if (playing && paragraph) {
      const bounds = paragraph.getBoundingClientRect();
      if (bounds.top < 100 || bounds.bottom > window.innerHeight - 140) paragraph.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    lastHighlighted = current;
  }
  if (narrator.error) showError(narrator.error);
  if (ready && chapter) persist({ progress: { chapterId: chapter.id, chunkIndex: narrator.chunkIndex } });
  refreshIcons();
}

function renderChapter(next: Chapter | null, chunkIndex = 0) {
  ready = false;
  chapter = next;
  element<HTMLButtonElement>('next-chapter').disabled = !chapter?.nextUrl || !isExtension;
  lastHighlighted = -1;
  element('chapter').hidden = !chapter;
  element('empty').hidden = Boolean(chapter);
  element('sidebar-chapter').hidden = !chapter;
  element('source').hidden = !chapter;
  element('paragraphs').replaceChildren();
  if (!chapter) { narrator.stop(); ready = true; return; }
  const nextButton = element<HTMLButtonElement>('next-chapter');
  nextButton.disabled = !chapter.nextUrl || !isExtension;
  nextButton.title = chapter.nextUrl ? 'Open the next chapter in a new tab' : 'No next chapter link found. Re-extract this chapter to check for one.';
  const hostname = new URL(chapter.sourceUrl).hostname.replace(/^www\./, '');
  const readableParagraphs = chapter.paragraphs.filter(hasReadableText);
  const words = readableParagraphs.join(' ').split(/\s+/).length;
  for (const id of ['chapter-title', 'sidebar-title', 'playing-title']) element(id).textContent = chapter.title;
  for (const id of ['sidebar-source', 'topbar-source', 'chapter-host']) element(id).textContent = hostname;
  element<HTMLAnchorElement>('source').href = chapter.sourceUrl;
  element('word-count').textContent = `${words.toLocaleString()} words`;
  element('reading-time').textContent = `${Math.max(1, Math.ceil(words / 180))} min listen`;
  element('paragraph-count').textContent = `${chapter.paragraphs.length} paragraphs`;
  element('mode-label').textContent = chapter.mode === 'selection' ? 'SELECTED TEXT' : 'WEB CHAPTER';
  chapter.paragraphs.forEach((text, index) => {
    if (!hasReadableText(text)) {
      const separator = document.createElement('div');
      separator.className = 'story-separator';
      separator.dataset.paragraph = String(index);
      separator.setAttribute('role', 'separator');
      separator.setAttribute('aria-label', 'Story break');
      const ornament = document.createElement('span');
      ornament.setAttribute('aria-hidden', 'true');
      ornament.textContent = '• • •';
      separator.append(ornament);
      element('paragraphs').append(separator);
      return;
    }
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    paragraph.dataset.paragraph = String(index);
    paragraph.tabIndex = 0;
    paragraph.setAttribute('role', 'button');
    paragraph.setAttribute('aria-label', `Go to paragraph ${index + 1}: ${text}`);
    paragraph.addEventListener('click', () => narrator.seekParagraph(index));
    paragraph.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); narrator.seekParagraph(index); }
    });
    element('paragraphs').append(paragraph);
  });
  narrator.load(chapter, chunkIndex);
  ready = true;
  updatePlayback();
}

async function openNextChapter() {
  if (!chapter?.nextUrl || !isExtension || openingNext) return;
  openingNext = true;
  const button = element<HTMLButtonElement>('next-chapter');
  button.disabled = true;
  try {
    await chrome.tabs.create({ url: chapter.nextUrl, active: true });
  } finally {
    openingNext = false;
    button.disabled = !chapter?.nextUrl || !isExtension;
  }
}

function applyPreferences() {
  document.documentElement.dataset.theme = preferences.theme;
  document.documentElement.style.setProperty('--reading-size', `${preferences.fontSize}px`);
  element<HTMLInputElement>('rate').value = String(preferences.rate);
  element('rate-label').textContent = `${preferences.rate.toFixed(1)}\u00d7`;
  element<HTMLInputElement>('font-size').value = String(preferences.fontSize);
  element('theme').innerHTML = `<i data-lucide="${preferences.theme === 'light' ? 'moon' : 'sun'}"></i>`;
  narrator.configure(preferences.rate, voices.find(voice => voice.voiceURI === preferences.voiceURI) || null);
  refreshIcons();
  updatePlayback();
}

function loadVoices() {
  voices = speechSynthesis.getVoices();
  const select = element<HTMLSelectElement>('voice');
  select.replaceChildren(new Option('System default', ''));
  voices.forEach(voice => select.add(new Option(`${voice.name} (${voice.lang})`, voice.voiceURI)));
  select.value = voices.some(voice => voice.voiceURI === preferences.voiceURI) ? preferences.voiceURI : '';
  const chosen = voices.find(voice => voice.voiceURI === select.value);
  element('voice-info').textContent = chosen ? (chosen.localService ? 'On-device voice' : 'Online voice') : (voices.length ? 'Browser default voice' : 'No voices reported. Check system speech settings.');
  narrator.configure(preferences.rate, chosen || null);
}

async function reloadChapter() {
  const generation = ++loadGeneration;
  const saved = await getSaved();
  if (generation !== loadGeneration) return;
  if (saved.chapter?.id !== chapter?.id) { showError(''); renderChapter(saved.chapter, saved.chunkIndex); }
}

element('play').addEventListener('click', () => {
  showError('');
  if (narrator.state === 'playing') narrator.pause();
  else narrator.play();
});
element('stop').addEventListener('click', () => narrator.stop());
element('previous').addEventListener('click', () => narrator.seekParagraph(paragraphIndex() - 1));
element('next').addEventListener('click', () => narrator.seekParagraph(paragraphIndex() + 1));
element('next-chapter').addEventListener('click', () => void openNextChapter().catch(error => showError(error instanceof Error ? error.message : 'Could not open the next chapter.')));
element('seek').addEventListener('input', event => narrator.seekParagraph(Number((event.target as HTMLInputElement).value)));
element('rate').addEventListener('input', event => {
  preferences.rate = Number((event.target as HTMLInputElement).value);
  applyPreferences();
  persist({ preferences });
});
element('font-size').addEventListener('input', event => {
  preferences.fontSize = Number((event.target as HTMLInputElement).value);
  applyPreferences();
  persist({ preferences });
});
element('theme').addEventListener('click', () => {
  preferences.theme = preferences.theme === 'light' ? 'dark' : 'light';
  applyPreferences();
  persist({ preferences });
});
element('voice').addEventListener('change', event => {
  preferences.voiceURI = (event.target as HTMLSelectElement).value;
  loadVoices();
  persist({ preferences });
});
for (const id of ['import', 'empty-import']) element(id).addEventListener('click', () => element<HTMLInputElement>('file-input').click());
element('file-input').addEventListener('change', async event => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    if (file.size > 2_000_000) throw new Error('Choose a chapter file smaller than 2 MB.');
    const imported: unknown = JSON.parse(await file.text());
    if (!isChapter(imported)) throw new Error('This file is not a valid StoryTeller chapter.');
    const next = { ...imported, id: crypto.randomUUID() };
    await saveChapter(next);
    renderChapter(next);
    showError('');
  } catch (error) { showError(error instanceof Error ? error.message : 'Could not import this file.'); }
  finally { input.value = ''; }
});

function status(): PlayerStatus {
  return { state: narrator.state, title: chapter?.title || '', paragraph: paragraphIndex() + 1, paragraphCount: chapter?.paragraphs.length || 0 };
}

if (isExtension) {
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id !== chrome.runtime.id || message?.target !== 'player') return;
    if (message.type === 'GET_STATUS') reply({ ok: true, status: status() });
    else if (message.type === 'PAUSE') { narrator.pause(); reply({ ok: true, status: status() }); }
    else if (message.type === 'LOAD_CHAPTER') {
      reloadChapter().then(() => reply({ ok: true })).catch(() => reply({ ok: false, error: 'Could not load the saved chapter.' }));
      return true;
    }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.chapter) void reloadChapter().catch(() => showError('Could not load the saved chapter.'));
  });
} else {
  window.addEventListener('storage', () => void reloadChapter());
}

window.addEventListener('pagehide', () => narrator.pause());
speechSynthesis.addEventListener('voiceschanged', loadVoices);
refreshIcons();

async function initialize() {
  const saved = await getSaved();
  preferences = saved.preferences;
  let initial = saved.chapter;
  let initialPosition = saved.chunkIndex;
  if (!isExtension && new URLSearchParams(location.search).has('demo') && !initial) {
    const { demoChapter } = await import('./demo');
    initial = demoChapter;
    initialPosition = 0;
    await saveChapter(demoChapter);
  }
  renderChapter(initial, initialPosition);
  applyPreferences();
  loadVoices();
}

void initialize().catch(() => showError('Could not load saved data. Reload the reader to try again.'));