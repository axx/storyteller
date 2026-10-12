import { hasReadableText } from './model';
import type { Chapter } from './model';

export interface Chunk {
  text: string;
  paragraphIndex: number;
}

export type PlaybackState = 'idle' | 'playing' | 'paused' | 'completed' | 'error';

export function makeChunks(paragraphs: string[]): Chunk[] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' });
  return paragraphs.flatMap((paragraph, paragraphIndex) => {
    if (!hasReadableText(paragraph)) return [];
    const chunks: Chunk[] = [];
    for (const { segment } of segmenter.segment(paragraph)) {
      let current = '';
      for (const word of segment.trim().split(/\s+/)) {
        if (word.length > 240) {
          if (current) chunks.push({ text: current, paragraphIndex });
          current = '';
          for (let offset = 0; offset < word.length; offset += 240) {
            chunks.push({ text: word.slice(offset, offset + 240), paragraphIndex });
          }
          continue;
        }
        if (current && current.length + word.length + 1 > 240) {
          chunks.push({ text: current, paragraphIndex });
          current = '';
        }
        current = current ? `${current} ${word}` : word;
      }
      if (current) chunks.push({ text: current, paragraphIndex });
    }
    return chunks;
  });
}

export class Narrator {
  chunks: Chunk[] = [];
  chunkIndex = 0;
  state: PlaybackState = 'idle';
  rate = 1;
  voice: SpeechSynthesisVoice | null = null;
  error = '';
  private generation = 0;
  private utterance: SpeechSynthesisUtterance | null = null;
  private onChange: () => void;
  private synthesis: Pick<SpeechSynthesis, 'speak' | 'cancel'>;
  private createUtterance: (text: string) => SpeechSynthesisUtterance;

  constructor(
    onChange: () => void,
    synthesis: Pick<SpeechSynthesis, 'speak' | 'cancel'> = window.speechSynthesis,
    createUtterance: (text: string) => SpeechSynthesisUtterance = text => new SpeechSynthesisUtterance(text),
  ) {
    this.onChange = onChange;
    this.synthesis = synthesis;
    this.createUtterance = createUtterance;
  }

  load(chapter: Chapter, chunkIndex = 0) {
    this.cancel();
    this.chunks = makeChunks(chapter.paragraphs);
    this.chunkIndex = Math.max(0, Math.min(Math.trunc(chunkIndex) || 0, this.chunks.length));
    this.state = this.chunkIndex === this.chunks.length ? 'completed' : 'idle';
    this.error = '';
    this.onChange();
  }

  play() {
    if (!this.chunks.length || this.state === 'playing') return;
    if (this.chunkIndex >= this.chunks.length) this.chunkIndex = 0;
    this.cancel();
    this.error = '';
    this.state = 'playing';
    this.speak();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.cancel();
    this.state = 'paused';
    this.onChange();
  }

  stop() {
    this.cancel();
    this.chunkIndex = 0;
    this.state = 'idle';
    this.onChange();
  }

  seekParagraph(paragraphIndex: number) {
    const currentParagraph = this.chunks[this.chunkIndex]?.paragraphIndex ?? this.chunks.at(-1)?.paragraphIndex ?? -1;
    let target = this.chunks.findIndex(chunk => chunk.paragraphIndex === paragraphIndex);
    if (target < 0 && paragraphIndex > currentParagraph) {
      target = this.chunks.findIndex(chunk => chunk.paragraphIndex > currentParagraph && chunk.paragraphIndex >= paragraphIndex);
    } else if (target < 0 && paragraphIndex < currentParagraph) {
      target = this.chunks.findLastIndex(chunk => chunk.paragraphIndex < currentParagraph && chunk.paragraphIndex <= paragraphIndex);
    }
    if (target < 0) return;
    const wasPlaying = this.state === 'playing';
    this.cancel();
    this.chunkIndex = target;
    this.state = 'paused';
    if (wasPlaying) this.play();
    else this.onChange();
  }

  configure(rate: number, voice: SpeechSynthesisVoice | null) {
    if (this.rate === rate && this.voice === voice) return;
    const wasPlaying = this.state === 'playing';
    if (wasPlaying) this.pause();
    this.rate = rate;
    this.voice = voice;
    if (wasPlaying) this.play();
  }

  private cancel() {
    this.generation += 1;
    this.synthesis.cancel();
    this.utterance = null;
  }

  private speak() {
    const chunk = this.chunks[this.chunkIndex];
    if (!chunk) {
      this.state = 'completed';
      this.utterance = null;
      this.onChange();
      return;
    }
    const generation = this.generation;
    this.utterance = this.createUtterance(chunk.text);
    this.utterance.rate = this.rate;
    if (this.voice) this.utterance.voice = this.voice;
    this.utterance.onend = () => {
      if (generation !== this.generation) return;
      this.chunkIndex += 1;
      this.speak();
    };
    this.utterance.onerror = event => {
      if (generation !== this.generation) return;
      this.state = 'error';
      this.error = `Speech failed (${event.error}). Try another voice, then press Play.`;
      this.onChange();
    };
    this.onChange();
    this.synthesis.speak(this.utterance);
  }
}