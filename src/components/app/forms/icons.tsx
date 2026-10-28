// The form editor's own icons, in the app's one line style (src/components/Icons.tsx): 24px box, 1.8 stroke, round
// caps. Element tiles, the left rail and the canvas toolbar use them.

type P = { size?: number; className?: string };

function Svg({ size = 16, className = "", children }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const At = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
  </Svg>
);
export const User = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
  </Svg>
);
export const IdCard = (p: P) => (
  <Svg {...p}>
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <circle cx="8" cy="11" r="2" />
    <path d="M5 16a3 3 0 0 1 6 0M14 10h5M14 14h3" />
  </Svg>
);
export const Handset = (p: P) => (
  <Svg {...p}>
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
  </Svg>
);
export const Building = (p: P) => (
  <Svg {...p}>
    <rect x="4" y="2" width="16" height="20" rx="1.5" />
    <path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01" />
  </Svg>
);
export const Briefcase = (p: P) => (
  <Svg {...p}>
    <rect x="2" y="7" width="20" height="14" rx="2" />
    <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M2 13h20" />
  </Svg>
);
export const Flag = (p: P) => (
  <Svg {...p}>
    <path d="M4 22V4M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1" />
  </Svg>
);
export const MapPin = (p: P) => (
  <Svg {...p}>
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
    <circle cx="12" cy="10" r="3" />
  </Svg>
);
export const ShortText = (p: P) => (
  <Svg {...p}>
    <rect x="2" y="7" width="20" height="10" rx="2" />
    <path d="M6 12h7" />
  </Svg>
);
export const LongText = (p: P) => (
  <Svg {...p}>
    <path d="M4 6h16M4 10h16M4 14h16M4 18h10" />
  </Svg>
);
export const Dropdown = (p: P) => (
  <Svg {...p}>
    <rect x="2" y="7" width="20" height="10" rx="2" />
    <path d="m14 11 2 2 2-2" />
  </Svg>
);
export const Radio = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="3.5" fill="currentColor" />
  </Svg>
);
export const CheckList = (p: P) => (
  <Svg {...p}>
    <path d="m3 6 2 2 3-3M3 13l2 2 3-3M11 6.5h10M11 13.5h10M11 19.5h10M4 19.5h3" />
  </Svg>
);
export const CheckSquare = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <path d="m8 12 3 3 5-6" />
  </Svg>
);
export const Hash = (p: P) => (
  <Svg {...p}>
    <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />
  </Svg>
);
export const Calendar = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </Svg>
);
export const Star = (p: P) => (
  <Svg {...p}>
    <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" />
  </Svg>
);
export const LinkIcon = (p: P) => (
  <Svg {...p}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </Svg>
);
export const Heading = (p: P) => (
  <Svg {...p}>
    <path d="M6 4v16M18 4v16M6 12h12" />
  </Svg>
);
export const TextIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4 7V5h16v2M12 5v14M9 19h6" />
  </Svg>
);
export const Divider = (p: P) => (
  <Svg {...p}>
    <path d="M3 12h18M8 6h8M8 18h8" />
  </Svg>
);
export const ImageIcon = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-5-5L5 21" />
  </Svg>
);
export const EyeOff = (p: P) => (
  <Svg {...p}>
    <path d="M9.9 4.2A9.7 9.7 0 0 1 12 4c6.5 0 10 8 10 8a17 17 0 0 1-2.2 3.2M6.6 6.6A17.6 17.6 0 0 0 2 12s3.5 8 10 8a9.7 9.7 0 0 0 5.4-1.6M2 2l20 20" />
    <path d="M14.1 14.1a3 3 0 0 1-4.2-4.2" />
  </Svg>
);
export const Layers = (p: P) => (
  <Svg {...p}>
    <path d="m12 2 10 5-10 5L2 7z" />
    <path d="m2 17 10 5 10-5M2 12l10 5 10-5" />
  </Svg>
);
/** A variable: a diamond, as in Figma and Webflow. */
export const Diamond = (p: P) => (
  <Svg {...p}>
    <path d="M12 3.5 20.5 12 12 20.5 3.5 12Z" />
  </Svg>
);
export const Palette = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor" />
  </Svg>
);
export const PlusSquare = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="3" width="18" height="18" rx="4" />
    <path d="M12 8v8M8 12h8" />
  </Svg>
);
export const Tablet = (p: P) => (
  <Svg {...p}>
    <rect x="4" y="2" width="16" height="20" rx="2" />
    <path d="M11 18h2" />
  </Svg>
);
export const PhoneOff = (p: P) => (
  <Svg {...p}>
    <path d="M7.5 3H16a2 2 0 0 1 2 2v8.5M18 18v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6M3 3l18 18" />
  </Svg>
);
export const Columns = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M12 4v16" />
  </Svg>
);
export const ChevronDown = (p: P) => (
  <Svg {...p}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);
export const Shuffle = (p: P) => (
  <Svg {...p}>
    <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
  </Svg>
);
export const Minus = (p: P) => (
  <Svg {...p}>
    <path d="M5 12h14" />
  </Svg>
);
export const AlignLeft = (p: P) => (
  <Svg {...p}>
    <path d="M4 6h16M4 12h10M4 18h14" />
  </Svg>
);
export const AlignCenter = (p: P) => (
  <Svg {...p}>
    <path d="M4 6h16M7 12h10M5 18h14" />
  </Svg>
);

export const Calculator = (p: P) => (
  <Svg {...p}>
    <rect x="5" y="2" width="14" height="20" rx="2" />
    <path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15v3M8 18h.01M12 18h.01" />
  </Svg>
);

const BY_NAME: Record<string, (p: P) => React.ReactElement> = {
  at: At,
  user: User,
  id: IdCard,
  phone: Handset,
  building: Building,
  briefcase: Briefcase,
  globe: (p) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </Svg>
  ),
  flag: Flag,
  pin: MapPin,
  short: ShortText,
  long: LongText,
  dropdown: Dropdown,
  radio: Radio,
  checklist: CheckList,
  check: CheckSquare,
  hash: Hash,
  calendar: Calendar,
  star: Star,
  link: LinkIcon,
  heading: Heading,
  text: TextIcon,
  divider: Divider,
  image: ImageIcon,
  hidden: EyeOff,
  calc: Calculator,
};

/** An element's icon by its name in the element list (editorModel.ts). */
export function ElementIcon({ name, size = 16, className = "" }: { name: string; size?: number; className?: string }) {
  const I = BY_NAME[name] ?? ShortText;
  return <I size={size} className={className} />;
}
