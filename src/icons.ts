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
  collect: svg('<path d="M4 10h16l-1.6 8.4a2 2 0 0 1-2 1.6H7.6a2 2 0 0 1-2-1.6z"/><path d="M8.5 10 11 4M15.5 10 13 4"/><path d="M9 14v2M12 14v2M15 14v2"/>'),
  apple: svg('<path d="M12 7.5c-1.8-1.3-5.5-1.2-6.4 2.3-.9 3.4 1.2 8.7 3.9 9.6 1 .3 1.7-.3 2.5-.3s1.5.6 2.5.3c2.7-.9 4.8-6.2 3.9-9.6-.9-3.5-4.6-3.6-6.4-2.3z"/><path d="M12 7.5c0-2 .8-3.4 2.5-4"/>'),
  rabbit: svg('<path d="M8.5 9.5 7 3.5c1.6 0 3 1.8 3.4 5"/><path d="M13.5 8.6c.5-3 1.9-5 3.5-5L15.4 9.5"/><ellipse cx="12" cy="15" rx="6" ry="5.2"/><path d="M10 14.2v.1M14 14.2v.1M11 17h2"/>'),
  fish: svg('<path d="M3 12c2.5-4 6-6 9.5-6 3.8 0 6.6 3 7.5 6-.9 3-3.7 6-7.5 6C9 18 5.5 16 3 12z"/><path d="M3 12 1.5 8.5M3 12l-1.5 3.5"/><path d="M15.5 10.5v.1"/>'),
  duck: svg('<path d="M3 13.5h7.5c-1.5-1-2-2.6-1.6-4.2A3.5 3.5 0 0 1 15.6 9l3.4.8-2.6 1.4c.6 1 .9 2 .6 3.3C16.4 17.4 13.6 19 10 19c-4 0-6.3-2.4-7-5.5z"/><path d="M13.5 8.2v.1"/>'),
  fox: svg('<path d="M4 4l3.5 6M20 4l-3.5 6"/><path d="M4 4c0 5 2 7.5 3.5 9L12 20l4.5-7c1.5-1.5 3.5-4 3.5-9l-5 4h-6z"/><path d="M10 12.5v.1M14 12.5v.1"/>'),
  path: svg('<path d="M8 21c0-4 2-6 4-9s4-5 4-9"/><path d="M4 21c0-4 2-6 4-9s4-5 4-9" opacity=".45"/><path d="M12 21c0-4 2-6 4-9s4-5 4-9" opacity=".45"/>'),
  shield: svg('<path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z"/><path d="m9 12 2 2 4-4"/>'),
  bear: svg('<circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="6.5" r="2.5"/><path d="M5 13a7 7 0 0 1 14 0c0 4-3.1 7-7 7s-7-3-7-7z"/><path d="M10 12.5v.1M14 12.5v.1"/><path d="M10.5 16c.9.7 2.1.7 3 0"/>'),
  trap: svg('<path d="M3 17h18"/><path d="M5 17a7 7 0 0 1 14 0"/><path d="m7 12 1.2 2M10 10.2l.5 2.3M14 10.2l-.5 2.3M17 12l-1.2 2"/>'),
  gun: svg('<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/><circle cx="12" cy="12" r="1.2"/>'),
  alert: svg('<path d="M12 3 2 20h20z"/><path d="M12 10v4.5M12 17.3v.1"/>'),
  help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.6v.6"/><path d="M12 17.2v.1"/>'),
  moon: svg('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
};
