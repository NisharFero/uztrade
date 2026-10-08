import type { ReactNode } from "react";

/* One shared set of stroke attributes keeps every glyph in the same family,
   and `currentColor` lets each context colour its own icons. */
const s = {
  // A size of its own, so a glyph no stylesheet rule sizes stays text-sized
  // instead of filling its container; CSS width/height still win.
  width: "1em",
  height: "1em",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const Icon: Record<string, ReactNode> = {
  dashboard: (
    <svg {...s}>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.6" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" />
    </svg>
  ),
  procedures: (
    <svg {...s}>
      <path d="M8 4h8a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
      <path d="M9.5 3h5v3h-5z" />
      <path d="M9.5 11h5M9.5 15h3" />
    </svg>
  ),
  shipments: (
    <svg {...s}>
      <path d="M12 2.8 20.5 7v10L12 21.2 3.5 17V7Z" />
      <path d="M3.5 7 12 11.5 20.5 7M12 11.5v9.7" />
    </svg>
  ),
  agents: (
    <svg {...s}>
      <rect x="5" y="7" width="14" height="12" rx="3" />
      <path d="M12 3.5V7M9.5 12.5v1.5M14.5 12.5v1.5M2.5 12h2.5M19 12h2.5" />
    </svg>
  ),
  documents: (
    <svg {...s}>
      <path d="M13.5 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5Z" />
      <path d="M13.5 3v5.5H19M8.5 13h7M8.5 16.5h4.5" />
    </svg>
  ),
  compliance: (
    <svg {...s}>
      <path d="M12 2.8l7.5 3v6.1c0 4.3-3 8.2-7.5 9.3-4.5-1.1-7.5-5-7.5-9.3V5.8Z" />
      <path d="m9 11.8 2.2 2.2L15.2 10" />
    </svg>
  ),

  /* Navigation - one glyph per place, each the thing you would expect there. */
  home: (
    <svg {...s}>
      <path d="M3.5 10.5 12 3.5l8.5 7" />
      <path d="M5.5 9v10.5a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1V9" />
    </svg>
  ),
  book: (
    <svg {...s}>
      <path d="M12 6.5C10.3 5 7.8 4.5 4 4.5v14c3.8 0 6.3.5 8 2 1.7-1.5 4.2-2 8-2v-14c-3.8 0-6.3.5-8 2Z" />
      <path d="M12 6.5v14" />
    </svg>
  ),
  truck: (
    <svg {...s}>
      <path d="M2.5 6.5h11v10h-11z" />
      <path d="M13.5 9.5h4.2l3.3 3.6v3.4h-7.5" />
      <circle cx="6.5" cy="17.5" r="1.9" />
      <circle cx="17" cy="17.5" r="1.9" />
    </svg>
  ),
  receipt: (
    <svg {...s}>
      <path d="M5.5 3h13v18l-2.6-1.6-2.3 1.6-2.3-1.6L9 21l-2-1.4-1.5 1.1Z" />
      <path d="M9 8h6M9 11.5h6M9 15h3.5" />
    </svg>
  ),
  help: (
    <svg {...s}>
      <circle cx="12" cy="12" r="8.8" />
      <path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.8" />
      <path d="M12 17h.01" strokeWidth={2.4} />
    </svg>
  ),
  landmark: (
    <svg {...s}>
      <path d="M3 9.5 12 4l9 5.5" />
      <path d="M5 10v7.5M9.7 10v7.5M14.3 10v7.5M19 10v7.5" />
      <path d="M3 20.5h18" />
    </svg>
  ),
  bot: (
    <svg {...s}>
      <rect x="4" y="8" width="16" height="11.5" rx="3.2" />
      <path d="M12 4.5V8M12 3.6h.01" />
      <path d="M9.2 13.2v1.2M14.8 13.2v1.2M1.8 13.5H4M20 13.5h2.2" />
    </svg>
  ),
  compose: (
    <svg {...s}>
      <path d="M11 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V13" />
      <path d="M17.6 3.9a1.9 1.9 0 0 1 2.7 2.7L12.6 14.3l-3.3.6.6-3.3Z" />
    </svg>
  ),
  menu: (
    <svg {...s} strokeWidth={1.8}>
      <path d="M4 7h16M4 12h16M4 17h10" />
    </svg>
  ),
  close: (
    <svg {...s} strokeWidth={1.8}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  ),
  paperclip: (
    <svg {...s}>
      <path d="m20 11.2-7.7 7.7a4.8 4.8 0 0 1-6.8-6.8l8-8a3.2 3.2 0 0 1 4.5 4.5l-8 8a1.6 1.6 0 0 1-2.3-2.3l7.3-7.3" />
    </svg>
  ),

  /* Composer */
  send: (
    <svg {...s} strokeWidth={2}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  ),
  plus: (
    <svg {...s} strokeWidth={2}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  sparkle: (
    <svg {...s}>
      <path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9Z" />
      <path d="M18.5 3.5v3M20 5h-3" />
    </svg>
  ),
  replay: (
    <svg {...s}>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <path d="M3.5 4.5V10H9" />
    </svg>
  ),

  /* Workflow lanes */
  user: (
    <svg {...s}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" />
    </svg>
  ),
  physical: (
    <svg {...s}>
      <path d="M2.8 7.5h10v9h-10z" />
      <path d="M12.8 10.5h4l3 3v3h-7z" />
      <circle cx="6.6" cy="18.4" r="1.9" />
      <circle cx="16.6" cy="18.4" r="1.9" />
    </svg>
  ),

  /* Node states — each state gets its own glyph so progress is readable
     without relying on colour alone. */
  check: (
    <svg {...s} strokeWidth={2.4}>
      <path d="m5.5 12.5 4.2 4.2L18.5 8" />
    </svg>
  ),
  clock: (
    <svg {...s}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 7.2V12l3.1 1.9" />
    </svg>
  ),
  loader: (
    <svg {...s} strokeWidth={2}>
      <path d="M12 3.4a8.6 8.6 0 1 0 8.6 8.6" />
    </svg>
  ),
  lock: (
    <svg {...s}>
      <rect x="5" y="10.5" width="14" height="10" rx="2.4" />
      <path d="M8.2 10.5V7.8a3.8 3.8 0 0 1 7.6 0v2.7" />
    </svg>
  ),

  /* Section heads */
  list: (
    <svg {...s}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4.2 6h.01M4.2 12h.01M4.2 18h.01" />
    </svg>
  ),
  /* Points down when closed; CSS rotates it when the disclosure is open. */
  chevron: (
    <svg {...s}>
      <path d="M6 9.5l6 6 6-6" />
    </svg>
  ),
  sliders: (
    <svg {...s}>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2.2" />
      <circle cx="8" cy="17" r="2.2" />
    </svg>
  ),
  flow: (
    <svg {...s}>
      <rect x="8.5" y="2.8" width="7" height="5" rx="1.5" />
      <rect x="2.5" y="16.2" width="7" height="5" rx="1.5" />
      <rect x="14.5" y="16.2" width="7" height="5" rx="1.5" />
      <path d="M12 7.8v3.4a1.6 1.6 0 0 1-1.6 1.6H7.6A1.6 1.6 0 0 0 6 14.4v1.8M12 7.8v3.4a1.6 1.6 0 0 0 1.6 1.6h2.8a1.6 1.6 0 0 1 1.6 1.6v1.8" />
    </svg>
  ),
};
