/** UI 用のインライン SVG アイコン（外部画像なし、currentColor で色が変わる） */
const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icons = {
  pan: svg('<path d="M12 3v18M3 12h18"/><path d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>'),
  dig: svg('<path d="M14 4l6 6"/><path d="M17 7 8.5 15.5"/><path d="M4.5 19.5c-1-1-1-3.5 1-5.5l2-2 4 4-2 2c-2 2-4.5 2-5 1.5z"/>'),
  raise: svg('<path d="M3 19h18"/><path d="M5 19c1.5-4 3.5-7 7-7s5.5 3 7 7"/><path d="M12 9V3M9 6l3-3 3 3"/>'),
  smooth: svg('<path d="M3 15c3-3 5-3 9 0s6 3 9 0"/><path d="M3 9c3-3 5-3 9 0s6 3 9 0" opacity=".45"/>'),
  tree: svg('<path d="M12 22v-6"/><path d="M12 2 6 10h3l-4 6h14l-4-6h3z"/>'),
  coin: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9M9.5 9.5c0-1 1-1.6 2.5-1.6s2.5.7 2.5 1.7-1 1.4-2.5 1.6-2.5.7-2.5 1.7 1 1.6 2.5 1.6 2.5-.6 2.5-1.6"/>'),
  people: svg('<circle cx="9" cy="8" r="3"/><path d="M3.5 19c.5-3 2.7-5 5.5-5s5 2 5.5 5"/><circle cx="17" cy="9" r="2.3"/><path d="M15.5 14.3c2.6-.4 4.6 1.4 5 4.7"/>'),
  sparkle: svg('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z"/>'),
  drop: svg('<path d="M12 3.5c3 3.8 6 7.3 6 10.5a6 6 0 0 1-12 0c0-3.2 3-6.7 6-10.5z"/><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5"/>'),
  leaf: svg('<path d="M5 19c0-8 5-14 15-15-1 10-7 15-15 15z"/><path d="M5 19l7-7"/>'),
  help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.6v.6"/><path d="M12 17.2v.1"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
};
