// Small line icons in one style. Each takes a size and a className.

type P = { size?: number; className?: string };

function Svg({ size = 16, className = "", children }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`} aria-hidden="true">
      {children}
    </svg>
  );
}

export const Users = (p: P) => (
  <Svg {...p}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </Svg>
);

export const Settings = (p: P) => (
  <Svg {...p}>
    <path d="M20 7h-9M14 17H5" />
    <circle cx="17" cy="17" r="3" />
    <circle cx="7" cy="7" r="3" />
  </Svg>
);

export const ChevronsUpDown = (p: P) => (
  <Svg {...p}>
    <path d="m7 15 5 5 5-5M7 9l5-5 5 5" />
  </Svg>
);

export const ChevronRight = (p: P) => (
  <Svg {...p}>
    <path d="m9 18 6-6-6-6" />
  </Svg>
);

export const Plus = (p: P) => (
  <Svg {...p}>
    <path d="M5 12h14M12 5v14" />
  </Svg>
);

export const Globe = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </Svg>
);

export const LogOut = (p: P) => (
  <Svg {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
  </Svg>
);

export const Check = (p: P) => (
  <Svg {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Svg>
);

export const X = (p: P) => (
  <Svg {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
);

export const ListIcon = (p: P) => (
  <Svg {...p}>
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </Svg>
);

export const Code = (p: P) => (
  <Svg {...p}>
    <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />
  </Svg>
);

export const Play = (p: P) => (
  <Svg {...p}>
    <path d="M6 4l14 8-14 8z" />
  </Svg>
);

export const Trash = (p: P) => (
  <Svg {...p}>
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
  </Svg>
);

export const Eye = (p: P) => (
  <Svg {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);

export const Key = (p: P) => (
  <Svg {...p}>
    <circle cx="7.5" cy="15.5" r="5.5" />
    <path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3" />
  </Svg>
);

export const Grip = (p: P) => (
  <Svg {...p}>
    <circle cx="9" cy="6" r="1" />
    <circle cx="15" cy="6" r="1" />
    <circle cx="9" cy="12" r="1" />
    <circle cx="15" cy="12" r="1" />
    <circle cx="9" cy="18" r="1" />
    <circle cx="15" cy="18" r="1" />
  </Svg>
);

export const Box = (p: P) => (
  <Svg {...p}>
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <path d="M3.3 7 12 12l8.7-5M12 22V12" />
  </Svg>
);

export const Copy = (p: P) => (
  <Svg {...p}>
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </Svg>
);

export const Clock = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);

export const BarChart = (p: P) => (
  <Svg {...p}>
    <path d="M4 20h16M7 16v-5M12 16V7M17 16v-8" />
  </Svg>
);

export const TypeIcon = (p: P) => (
  <Svg {...p}>
    <path d="M5 7V5h14v2M12 5v14M9 19h6" />
  </Svg>
);

export const AlignLeft = (p: P) => (
  <Svg {...p}>
    <path d="M4 6h16M4 10h10M4 14h16M4 18h10" />
  </Svg>
);

export const Hash = (p: P) => (
  <Svg {...p}>
    <path d="M9 4 7 20M17 4l-2 16M4 9h16M3 15h16" />
  </Svg>
);

export const Percent = (p: P) => (
  <Svg {...p}>
    <path d="M19 5 5 19" />
    <circle cx="7" cy="7" r="2" />
    <circle cx="17" cy="17" r="2" />
  </Svg>
);

export const CircleDot = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="2.5" fill="currentColor" />
  </Svg>
);

export const CheckSquare = (p: P) => (
  <Svg {...p}>
    <rect x="4" y="4" width="16" height="16" rx="4" />
    <path d="m8.5 12 2.5 2.5 4.5-5" />
  </Svg>
);

export const Star = (p: P) => (
  <Svg {...p}>
    <path d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6L12 4z" />
  </Svg>
);

export const Funnel = (p: P) => (
  <Svg {...p}>
    <path d="M4 5h16l-6 7.5V19l-4-2v-4.5L4 5z" />
  </Svg>
);

export const Branch = (p: P) => (
  <Svg {...p}>
    <circle cx="6" cy="5" r="2" />
    <circle cx="6" cy="19" r="2" />
    <circle cx="18" cy="8" r="2" />
    <path d="M6 7v10M18 10c0 4-6 3-11.2 7.5" />
  </Svg>
);

export const MapIcon = (p: P) => (
  <Svg {...p}>
    <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
    <path d="M9 4v14M15 6v14" />
  </Svg>
);

export const FileText = (p: P) => (
  <Svg {...p}>
    <path d="M14 3H6v18h12V7l-4-4z" />
    <path d="M14 3v4h4M9 12h6M9 16h6" />
  </Svg>
);

export const Link = (p: P) => (
  <Svg {...p}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </Svg>
);

export const Contact = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
  </Svg>
);

export const Upload = (p: P) => (
  <Svg {...p}>
    <path d="M12 15V3M7 8l5-5 5 5" />
    <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
  </Svg>
);

export const Download = (p: P) => (
  <Svg {...p}>
    <path d="M12 3v12M7 10l5 5 5-5" />
    <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
  </Svg>
);

export const Target = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1" />
  </Svg>
);

export const Refresh = (p: P) => (
  <Svg {...p}>
    <path d="M20 11a8 8 0 0 0-14.9-3.5M4 4v4h4" />
    <path d="M4 13a8 8 0 0 0 14.9 3.5M20 20v-4h-4" />
  </Svg>
);

export const Pause = (p: P) => (
  <Svg {...p}>
    <path d="M9 5v14M15 5v14" />
  </Svg>
);

export const Plug = (p: P) => (
  <Svg {...p}>
    <path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0V8zM12 17v4" />
  </Svg>
);

export const ArrowUp = (p: P) => (
  <Svg {...p}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Svg>
);

export const ArrowDown = (p: P) => (
  <Svg {...p}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Svg>
);

export const Undo = (p: P) => (
  <Svg {...p}>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </Svg>
);

export const Redo = (p: P) => (
  <Svg {...p}>
    <path d="M15 14l5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  </Svg>
);

export const Inbox = (p: P) => (
  <Svg {...p}>
    <path d="M3 13h5l1.5 3h5L16 13h5" />
    <path d="M5.5 5h13L21 13v6H3v-6z" />
  </Svg>
);

export const Send = (p: P) => (
  <Svg {...p}>
    <path d="M21 3L10 14M21 3l-7 18-4-7-7-4z" />
  </Svg>
);

export const Dollar = (p: P) => (
  <Svg {...p}>
    <path d="M12 2v20M17 6.5c0-1.9-2.2-3-5-3s-5 1.3-5 3.3c0 4.7 10 2.6 10 7.4 0 2-2.2 3.3-5 3.3s-5-1.1-5-3" />
  </Svg>
);

export const Mail = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="1" />
    <path d="M3 7l9 6 9-6" />
  </Svg>
);

export const FormIcon = (p: P) => (
  <Svg {...p}>
    <rect x="4" y="3" width="16" height="18" rx="1" />
    <path d="M8 8h8M8 12h8M8 16h4" />
  </Svg>
);

export const Megaphone = (p: P) => (
  <Svg {...p}>
    <path d="M3 10v4a1 1 0 0 0 1 1h3l6 4V5L7 9H4a1 1 0 0 0-1 1z" />
    <path d="M17 9a4 4 0 0 1 0 6M7 15l1.5 5h2.5l-1.2-4.2" />
  </Svg>
);

export const Chat = (p: P) => (
  <Svg {...p}>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
  </Svg>
);

export const Grid = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
  </Svg>
);

export const Monitor = (p: P) => (
  <Svg {...p}>
    <rect x="2" y="4" width="20" height="13" rx="1" />
    <path d="M8 21h8M12 17v4" />
  </Svg>
);

export const Phone = (p: P) => (
  <Svg {...p}>
    <rect x="6" y="2" width="12" height="20" rx="2" />
    <path d="M11 18h2" />
  </Svg>
);

export const ArrowLeft = (p: P) => (
  <Svg {...p}>
    <path d="M19 12H5M11 18l-6-6 6-6" />
  </Svg>
);

export const CornerDownLeft = (p: P) => (
  <Svg {...p}>
    <path d="M9 10l-5 5 5 5" />
    <path d="M20 4v7a4 4 0 0 1-4 4H4" />
  </Svg>
);

export const Lock = (p: P) => (
  <Svg {...p}>
    <rect x="5" y="11" width="14" height="10" rx="1" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Svg>
);

export const Wand = (p: P) => (
  <Svg {...p}>
    <path d="M15 4V2M15 10V8M11 6h-2M21 6h-2M18.5 3.5l-1 1M12.5 8.5l-1 1M17.5 8.5l1 1" />
    <path d="M3 21l11-11" />
  </Svg>
);

export const Search = (p: P) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </Svg>
);

export const Sun = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Svg>
);

export const Moon = (p: P) => (
  <Svg {...p}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
  </Svg>
);

export const Sparkle = (p: P) => (
  <Svg {...p}>
    <path d="M11 3l1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9z" />
    <path d="M19 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
  </Svg>
);

export const Pencil = (p: P) => (
  <Svg {...p}>
    <path d="M16.5 3.5l4 4L8 20H4v-4z" />
    <path d="M13.5 6.5l4 4" />
  </Svg>
);

export const CalendarIcon = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Svg>
);

/** A signpost: one post, a sign pointing right and one pointing left. */
export const Signpost = (p: P) => (
  <Svg {...p}>
    <path d="M12 3v18M9 21h6" />
    <path d="M12 5h6.5l2.5 2.5-2.5 2.5H12M12 12H5.5L3 14.5 5.5 17H12" />
  </Svg>
);

export const MoreHorizontal = (p: P) => (
  <Svg {...p}>
    <circle cx="5" cy="12" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
  </Svg>
);

export const Minus = (p: P) => (
  <Svg {...p}>
    <path d="M5 12h14" />
  </Svg>
);

export const Bell = (p: P) => (
  <Svg {...p}>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </Svg>
);

export const Radar = (p: P) => (
  <Svg {...p}>
    <path d="M19.07 4.93A10 10 0 1 0 22 12" />
    <path d="M16.24 7.76A6 6 0 1 0 18 12" />
    <circle cx="12" cy="12" r="2" />
    <path d="m13.4 10.6 6-6" />
  </Svg>
);

export const Layers = (p: P) => (
  <Svg {...p}>
    <path d="m12 2 10 5-10 5L2 7l10-5Z" />
    <path d="m2 17 10 5 10-5M2 12l10 5 10-5" />
  </Svg>
);

export const Flag = (p: P) => (
  <Svg {...p}>
    <path d="M4 22V4M4 4h13l-2 4 2 4H4" />
  </Svg>
);

export const Swap = (p: P) => (
  <Svg {...p}>
    <path d="M16 3l4 4-4 4M20 7H4M8 21l-4-4 4-4M4 17h16" />
  </Svg>
);

export const Building = (p: P) => (
  <Svg {...p}>
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10 21v-3h4v3" />
  </Svg>
);

export const Card = (p: P) => (
  <Svg {...p}>
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <path d="M2 10h20M6 15h4" />
  </Svg>
);

export const Mic = (p: P) => (
  <Svg {...p}>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0M12 17v5" />
  </Svg>
);

export const History = (p: P) => (
  <Svg {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5M12 7v5l3 2" />
  </Svg>
);

export const Gauge = (p: P) => (
  <Svg {...p}>
    <path d="M12 14l4-4" />
    <path d="M3.3 19a10 10 0 1 1 17.4 0" />
  </Svg>
);

export const ChevronDown = (p: P) => (
  <Svg {...p}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);

export const ExternalLink = (p: P) => (
  <Svg {...p}>
    <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </Svg>
);

export const Shuffle = (p: P) => (
  <Svg {...p}>
    <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
  </Svg>
);
