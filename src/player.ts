import { element, refreshIcons } from './ui';
import { Narrator } from './narration';
import { getSaved, isExtension, saveChapter, writeStorage } from './storage';
import { defaultPreferences, isChapter } from './model';
import type { Chapter, Preferences } from './model';
import type { PlayerStatus } from './protocol';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="reader-shell">
    <aside class="sidebar">
      <a class="brand" href="index.html"><span class="brand-mark"><i data-lucide="book-open"></i></span>folio<span class="brand-dot">.</span></a>
      <div class="section-label">YOUR READING SPACE</div>
      <div class="nav-item"><i data-lucide="headphones"></i> Now reading <span class="live-dot"></span></div>
      <div class="sidebar-chapter" id="sidebar-chapter" hidden><span class="section-label">CURRENT CHAPTER</span><h2 id="sidebar-title"></h2><p id="sidebar-source"></p><div class="sidebar-progress"><span id="sidebar-percent">0%</span><span>read</span></div><div class="meter"><span id="sidebar-meter"></span></div></div>
      <div class="sidebar-bottom"><span class="privacy-dot"></span> Saved on this device <span class="version">v0.1</span></div>
    </aside>
    <main class="main-panel">
      <header class="topbar"><div><span class="topbar-label">READER</span><span class="topbar-divider">/</span><span id="topbar-source">No chapter</span></div><div class="toolbar"><button id="import" class="icon-button" title="Import a chapter JSON file" aria-label="Import chapter"><i data-lucide="upload"></i></button><button id="theme" class="icon-button" title="Change color theme" aria-label="Change color theme"><i data-lucide="moon"></i></button><span class="toolbar-divider"></span><a id="source" class="source-link" target="_blank" rel="noopener noreferrer" hidden>Original page <i data-lucide="arrow-up-right"></i></a></div></header>
      <div id="notice" class="notice" role="alert" hidden></div>
      <section id="empty" class="empty-state"><i data-lucide="book-open"></i><h1>No chapter yet</h1><button id="empty-import" class="primary-button"><i data-lucide="upload"></i> Import chapter</button></section>
      <article id="chapter" class="chapter" hidden><div class="chapter-meta"><span class="chapter-tag" id="mode-label">WEB CHAPTER</span><span id="word-count"></span><span class="meta-dot">&middot;</span><span id="reading-time"></span></div><h1 id="chapter-title"></h1><div class="chapter-byline"><span id="chapter-host"></span><span class="meta-dot">&middot;</span><span id="paragraph-count"></span></div><div class="chapter-rule"><span></span><i data-lucide="book-open"></i><span></span></div><div id="paragraphs" class="paragraphs"></div><div class="chapter-end"><span></span>END OF CHAPTER<span></span></div></article>
    </main>
    <aside class="settings-panel"><div class="section-label">LISTENING</div><h2>Make it yours.</h2><label for="voice">Narrator</label><select id="voice"><option value="">System default</option></select><p id="voice-info" class="muted">Loading voices...</p><div class="setting-heading"><label for="rate">Playback speed</label><output id="rate-label">1.0&times;</output></div><input id="rate" type="range" min="0.5" max="2" step="0.1" value="1" /><div class="range-labels"><span>0.5&times;</span><span>2.0&times;</span></div><div class="settings-rule"></div><div class="section-label">READING</div><label for="font-size" class="font-label">Text size</label><div class="setting-heading"><span class="small-a">A</span><input id="font-size" type="range" min="16" max="28" step="1" value="20" aria-label="Text size" /><span class="large-a">A</span></div><div class="settings-rule"></div><div class="position-summary"><i data-lucide="file-text"></i><span id="position-summary">No chapter loaded</span></div></aside>
  </div>
  <footer class="playback-bar"><div class="playback-title"><span class="audio-mark"><i data-lucide="volume-2"></i></span><div><strong id="playing-title">Nothing queued</strong><span id="playback-status" role="status">Ready when you are</span></div></div><div class="playback-center"><div class="transport"><button id="previous" class="icon-button" title="Previous paragraph" aria-label="Previous paragraph" disabled><i data-lucide="skip-back"></i></button><button id="play" class="play-button" title="Play" aria-label="Play" disabled><i data-lucide="play"></i></button><button id="next" class="icon-button" title="Next paragraph" aria-label="Next paragraph" disabled><i data-lucide="skip-forward"></i></button><button id="stop" class="icon-button stop-button" title="Stop and reset" aria-label="Stop and reset" disabled><i data-lucide="square"></i></button></div><div class="seek-row"><span id="elapsed">0:00</span><input id="seek" type="range" min="0" max="1" value="0" aria-label="Chapter paragraph" disabled /><span id="duration">0:00</span></div></div><div class="playback-position"><span id="paragraph-position">-- / --</span><span>PARAGRAPHS</span></div></footer>
  <input id="file-input" type="file" accept=".json,application/json" hidden />
`;

let chapter: Chapter | null = null;
let preferences: Preferences = { ...defaultPreferences };
let voices: SpeechSynthesisVoice[] = [];
let ready = false;
let saveQueue = Promise.resolve();
let lastHighlighted = -1;
let loadGeneration = 0;
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
  element<HTMLButtonElement>('previous').disabled = !chapter || current === 0;
  element<HTMLButtonElement>('next').disabled = !chapter || current >= count - 1;
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
  lastHighlighted = -1;
  element('chapter').hidden = !chapter;
  element('empty').hidden = Boolean(chapter);
  element('sidebar-chapter').hidden = !chapter;
  element('source').hidden = !chapter;
  element('paragraphs').replaceChildren();
  if (!chapter) { narrator.stop(); ready = true; return; }
  const hostname = new URL(chapter.sourceUrl).hostname.replace(/^www\./, '');
  const words = chapter.paragraphs.join(' ').split(/\s+/).length;
  for (const id of ['chapter-title', 'sidebar-title', 'playing-title']) element(id).textContent = chapter.title;
  for (const id of ['sidebar-source', 'topbar-source', 'chapter-host']) element(id).textContent = hostname;
  element<HTMLAnchorElement>('source').href = chapter.sourceUrl;
  element('word-count').textContent = `${words.toLocaleString()} words`;
  element('reading-time').textContent = `${Math.max(1, Math.ceil(words / 180))} min listen`;
  element('paragraph-count').textContent = `${chapter.paragraphs.length} paragraphs`;
  element('mode-label').textContent = chapter.mode === 'selection' ? 'SELECTED TEXT' : 'WEB CHAPTER';
  chapter.paragraphs.forEach((text, index) => {
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
    if (!isChapter(imported)) throw new Error('This file is not a valid Folio chapter.');
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