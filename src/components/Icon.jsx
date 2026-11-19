// Line icons drawn for this app (24px grid, 1.8 stroke).
const P = {
  home: 'M4 11.5 12 4l8 7.5M6 10v9h4.2v-5.2h3.6V19H18v-9',
  play: 'M7 20h10M8.5 20c.4-3.2 2-4.6 2-7.2 0-1.6-1.3-2.2-2.6-1.6L6 12l-.6-2.3L10 6.2V4l2.2 1.6c3.6.6 5.8 3.6 5.8 7.6 0 2.6-.8 4.6-1.6 6.8',
  review: 'M4 18.5 9 13l3.2 3L20 7.5M15.5 7.5H20V12',
  tactics: 'M12 3v3.2M12 17.8V21M3 12h3.2M17.8 12H21M12 7.2a4.8 4.8 0 1 0 0 9.6 4.8 4.8 0 0 0 0-9.6ZM12 11.2a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6Z',
  learn: 'M4 5.5c2.8-.9 5.4-.5 8 1.2 2.6-1.7 5.2-2.1 8-1.2v12.6c-2.8-.9-5.4-.5-8 1.2-2.6-1.7-5.2-2.1-8-1.2V5.5ZM12 6.7v12.6',
  repertoire: 'M6 4v9.5c0 2 1.4 3.2 3.4 3.2H18M6 9.2h8.6M15 6.2l3 3-3 3M15 13.700l3 3-3 3',
  insights: 'M5 20V11M10 20V5M15 20v-6.500M20 20V8.500M3.500 20h18',
  prefs: 'M5 7h9M18 7h1M5 12h2M11 12h8M5 17h7M16 17h3M16 5v4M9 10v4M14 15v4',
  flip: 'M7 4v14m0 0-3-3m3 3 3-3M17 20V6m0 0-3 3m3-3 3 3',
  hint: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.300 1 2.200h5.200c0-.9.4-1.700 1-2.200A6 6 0 0 0 12 3Z',
  undo: 'M8 7 4 11l4 4M4 11h10a5 5 0 0 1 0 10h-3',
  flag: 'M6 21V4M6 5h11l-2 3.500 2 3.500H6',
  copy: 'M9 9h10v11H9zM5 15V4h10',
  download: 'M12 4v11m0 0-4-4m4 4 4-4M5 20h14',
  upload: 'M12 16V5m0 0-4 4m4-4 4 4M5 20h14',
  check: 'm5 12.500 4.500 4.500L19 7.500',
  x: 'M6 6l12 12M18 6 6 18',
  first: 'M7 5v14M18 6l-8 6 8 6V6Z',
  prev: 'M16 6l-8 6 8 6V6Z',
  next: 'M8 6l8 6-8 6V6Z',
  last: 'M17 5v14M6 6l8 6-8 6V6Z',
  retry: 'M4 12a8 8 0 1 0 2.700-6M4 4.500v4.500h4.500',
  bookmark: 'M7 4h10v16l-5-3.600L7 20V4Z',
  eye: 'M2.500 12S6 5.500 12 5.500 21.500 12 21.500 12 18 18.500 12 18.500 2.500 12 2.500 12ZM12 9.500a2.500 2.500 0 1 0 0 5 2.500 2.500 0 0 0 0-5Z',
  plus: 'M12 5v14M5 12h14',
  trash: 'M5 7h14M9.500 7V4.500h5V7M7 7l1 13h8l1-13',
  arrow: 'M5 12h14m0 0-5-5m5 5-5 5',
  clock: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM12 8v4.300l2.800 1.700',
  stop: 'M7 7h10v10H7z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  swap: 'M4 8h13m0 0-3-3m3 3-3 3M20 16H7m0 0 3-3m-3 3 3 3',
  edit: 'M4 20h4L19 9l-4-4L4 16v4ZM13.500 6.500l4 4',
};
export function Icon({ name, size }) {
  return (
    <svg viewBox="0 0 24 24" width={size || 20} height={size || 20} fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      <path d={P[name] || ''} />
    </svg>
  );
}
