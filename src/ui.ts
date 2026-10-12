import { createIcons, BookOpen, Play, Pause, Square, SkipBack, SkipForward, ExternalLink, Sun, Moon, Upload, Headphones, ArrowUpRight, FileText, X, Check, Volume2 } from 'lucide';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/newsreader/400.css';
import '@fontsource/newsreader/500.css';
import './player.css';

export function refreshIcons() {
  createIcons({ icons: { BookOpen, Play, Pause, Square, SkipBack, SkipForward, ExternalLink, Sun, Moon, Upload, Headphones, ArrowUpRight, FileText, X, Check, Volume2 }, attrs: { 'stroke-width': 1.7 } });
}

export function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing UI element: ${id}`);
  return found as T;
}