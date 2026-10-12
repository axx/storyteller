import { element, refreshIcons } from './ui';
import { request } from './protocol';
import { getSaved, isExtension } from './storage';
import type { Chapter } from './model';

document.body.classList.add('popup-body');
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="popup"><header class="popup-header"><span class="brand"><span class="brand-mark"><i data-lucide="book-open"></i></span>folio<span class="brand-dot">.</span></span><span class="popup-badge">CHAPTER READER</span></header><div class="popup-intro"><h1>A page. A voice.</h1></div><button id="read-page" class="primary-button"><i data-lucide="headphones"></i> Read current page</button><button id="read-selection" class="secondary-button"><i data-lucide="file-text"></i> Read selected text</button><div id="popup-error" class="popup-error" role="alert" hidden></div><div class="popup-current"><span class="section-label">LAST OPENED</span><h2 id="saved-title">No chapter yet</h2><span id="saved-state" class="muted">Nothing queued</span><div class="popup-current-actions"><button id="open-player" class="text-button">Open reader <i data-lucide="arrow-up-right"></i></button><button id="pause" class="icon-button" aria-label="Pause narration" title="Pause narration" hidden><i data-lucide="pause"></i></button></div></div><footer class="popup-footer"><span class="privacy-dot"></span> Saved on this device</footer></div>`;

function error(text: string) {
  element('popup-error').textContent = text;
  element('popup-error').hidden = !text;
}

async function read(mode: Chapter['mode']) {
  error('');
  for (const id of ['read-page', 'read-selection']) element<HTMLButtonElement>(id).disabled = true;
  element('read-page').textContent = 'Extracting chapter...';
  const result = isExtension ? await request({ target: 'worker', type: 'READ_PAGE', mode }) : { ok: false, error: 'Load the built extension in Chrome to read browser tabs.' };
  if (result.ok) window.close();
  else error(result.error || 'Could not read this page.');
  element('read-page').innerHTML = '<i data-lucide="headphones"></i> Read current page';
  for (const id of ['read-page', 'read-selection']) element<HTMLButtonElement>(id).disabled = false;
  refreshIcons();
}

element('read-page').addEventListener('click', () => void read('article'));
element('read-selection').addEventListener('click', () => void read('selection'));
element('open-player').addEventListener('click', async () => {
  if (!isExtension) { window.open('index.html', '_blank'); return; }
  const result = await request({ target: 'worker', type: 'OPEN_PLAYER' });
  if (!result.ok) error(result.error || 'Could not open the reader.');
  else window.close();
});
element('pause').addEventListener('click', async () => {
  const result = await request({ target: 'worker', type: 'PAUSE' });
  if (!result.ok) error(result.error || 'Could not pause.');
  else { element('pause').hidden = true; element('saved-state').textContent = 'Paused'; }
});

async function initialize() {
  const { chapter } = await getSaved();
  if (chapter) { element('saved-title').textContent = chapter.title; element('saved-state').textContent = new URL(chapter.sourceUrl).hostname; }
  if (isExtension) {
    const result = await request({ target: 'worker', type: 'GET_STATUS' });
    if (result.status?.title) {
      element('saved-state').textContent = `${result.status.state === 'playing' ? 'Reading' : 'Paragraph'} ${result.status.paragraph} of ${result.status.paragraphCount}`;
      element('pause').hidden = result.status.state !== 'playing';
    }
  }
}

refreshIcons();
void initialize().catch(() => error('Could not load the saved chapter.'));