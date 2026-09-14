import type { ReactNode } from "react";

/* One shared set of stroke attributes keeps every glyph in the same family,
   and `currentColor` lets each context colour its own icons. */
const s = {
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

  /* Composer */
  send: (
    <svg {...s} strokeWidth={2}>
      <path d="M12 19V5M6 11l6-6 6 6" />
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
  flow: (
    <svg {...s}>
      <rect x="8.5" y="2.8" width="7" height="5" rx="1.5" />
      <rect x="2.5" y="16.2" width="7" height="5" rx="1.5" />
      <rect x="14.5" y="16.2" width="7" height="5" rx="1.5" />
      <path d="M12 7.8v3.4a1.6 1.6 0 0 1-1.6 1.6H7.6A1.6 1.6 0 0 0 6 14.4v1.8M12 7.8v3.4a1.6 1.6 0 0 0 1.6 1.6h2.8a1.6 1.6 0 0 1 1.6 1.6v1.8" />
    </svg>
  ),
};
