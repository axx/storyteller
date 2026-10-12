import type { Chapter } from './model';
import type { PlaybackState } from './narration';

export interface PlayerStatus {
  state: PlaybackState;
  title: string;
  paragraph: number;
  paragraphCount: number;
}

export type WorkerRequest =
  | { target: 'worker'; type: 'READ_PAGE'; mode: Chapter['mode'] }
  | { target: 'worker'; type: 'OPEN_PLAYER' | 'OPEN_NEXT_CHAPTER' | 'GET_STATUS' | 'PAUSE' };

export type PlayerRequest = { target: 'player'; type: 'LOAD_CHAPTER' | 'GET_STATUS' | 'PAUSE' };

export interface Reply {
  ok: boolean;
  error?: string;
  status?: PlayerStatus;
}

export async function request(message: WorkerRequest): Promise<Reply> {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch {
    return { ok: false, error: 'The extension is unavailable. Reload it in chrome://extensions.' };
  }
}