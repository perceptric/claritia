// The Catch, the picture from tryclaritia.com's hero: visitors drift in from every side, the ones that fit turn
// emerald, and one lead runs the four corners of the bracket (Capture, Know, Route, Book) before the check draws.
// Styles are the .catch rules in src/app/globals.css. Under reduced motion it shows the booked frame.

// Each visitor: where it starts, how far it drifts, and whether it fits.
const DOTS: [number, number, number, number, number][] = [
  [55.3, 323.1, 140.7, -43.4, 1],
  [54.3, 305.1, 68.0, -14.9, 0],
  [344.1, 453.3, -27.5, -63.2, 0],
  [308.4, 85.0, -12.5, 45.2, 0],
  [455.1, 385.0, -146.5, -93.8, 1],
  [495.4, 323.4, -91.3, -24.6, 0],
  [136.2, 80.5, 49.2, 71.3, 0],
  [471.0, 280.0, -82.3, -7.8, 0],
  [330.4, 438.5, -59.0, -149.5, 1],
  [59.4, 306.2, 57.8, -13.3, 0],
  [41.8, 233.6, 80.2, 9.7, 0],
  [151.8, 83.5, 38.1, 62.1, 0],
  [504.7, 256.4, -181.1, 2.7, 1],
  [208.4, 69.8, 16.8, 61.8, 0],
  [216.3, 434.5, 8.5, -34.0, 0],
  [70.1, 397.2, 79.2, -57.3, 0],
  [486.2, 198.9, -197.2, 53.2, 1],
  [319.8, 491.1, -25.1, -97.2, 0],
  [461.3, 235.0, -72.7, 9.0, 0],
  [102.3, 93.2, 65.7, 69.4, 0],
  [429.3, 363.2, -110.8, -67.5, 1],
  [269.3, 77.0, -2.5, 49.8, 0],
  [404.3, 366.3, -27.1, -20.0, 0],
  [354.0, 452.4, -33.5, -68.6, 0],
  [342.4, 470.7, -69.5, -177.9, 1],
  [146.6, 116.2, 28.4, 36.0, 0],
  [304.8, 448.6, -10.3, -43.3, 0],
  [324.6, 74.7, -16.1, 46.1, 0],
  [309.5, 456.5, -33.8, -134.2, 1],
  [145.6, 118.4, 20.3, 25.1, 0],
  [304.2, 448.0, -11.0, -46.8, 0],
  [166.8, 432.1, 31.5, -58.2, 0],
  [442.1, 375.8, -148.6, -94.5, 1],
  [98.3, 140.5, 50.7, 37.5, 0],
  [462.0, 207.0, -66.0, 17.3, 0],
  [385.5, 120.3, -37.7, 42.0, 0],
  [454.8, 133.6, -161.3, 104.6, 1],
  [343.7, 470.7, -28.8, -72.6, 0],
  [339.5, 488.0, -31.0, -88.9, 0],
  [97.3, 136.2, 59.1, 44.9, 0],
  [495.3, 318.4, -196.9, -48.8, 1],
  [205.7, 74.8, 13.2, 45.0, 0],
  [99.3, 148.6, 52.3, 36.3, 0],
  [226.7, 83.3, 8.7, 46.0, 0],
  [41.5, 174.5, 167.7, 65.6, 1],
  [214.9, 494.9, 20.1, -104.8, 0],
];

const CORNERS: [string, string, number, number, number, number, number][] = [
  ["01", "Capture", 150, 150, -1, -1, 0],
  ["02", "Know", 370, 150, 1, -1, 1.44],
  ["03", "Route", 370, 370, 1, 1, 2.88],
  ["04", "Book", 150, 370, -1, 1, 4.32],
];

export function Catch({ className = "" }: { className?: string }) {
  return (
    <svg className={`catch ${className}`} viewBox="0 0 520 520" role="img" aria-label="Visitors drift in. One lead is caught, known, routed and booked.">
      <defs>
        <pattern id="catch-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="10" cy="10" r="1" fill="var(--color-line)" />
        </pattern>
      </defs>
      <rect x="30" y="30" width="460" height="460" fill="url(#catch-grid)" />
      <rect x="150" y="150" width="220" height="220" fill="none" stroke="var(--color-line-strong)" strokeDasharray="2 4" />
      {DOTS.map(([x, y, dx, dy, fit], i) => (
        <circle key={i} className={fit ? "v fit" : "v"} cx={x} cy={y} r={fit ? 3.2 : 2.6} style={{ "--i": i, "--dx": `${dx}px`, "--dy": `${dy}px` } as React.CSSProperties} />
      ))}
      <g fill="none" stroke="var(--color-ink)" strokeWidth="1.5" strokeLinecap="square">
        {[[150, 150, 1, 1], [370, 150, -1, 1], [370, 370, -1, -1], [150, 370, 1, -1]].map(([x, y, sx, sy]) => (
          <path key={`${x}-${y}`} className="bk" d={`M${x} ${y + sy * 34} V${y} H${x + sx * 34}`} />
        ))}
      </g>
      {CORNERS.map(([n, label, x, y, sx, sy, d]) => (
        <g key={n}>
          <rect className="corner" x={x - 5} y={y - 5} width="10" height="10" style={{ "--d": `${d}s` } as React.CSSProperties} />
          <text className="lab clab" x={x + sx * 16} y={y + sy * 18 + (sy > 0 ? 4 : 0)} textAnchor={sx < 0 ? "end" : "start"} style={{ "--d": `${d}s` } as React.CSSProperties}>
            <tspan className="num">{n}</tspan> {label}
          </text>
        </g>
      ))}
      <circle className="runner" r="5" cx="0" cy="0" />
      <path className="tick" pathLength={1} d="M228 262 L252 286 L296 236" />
      <g className="booked">
        <rect x="176" y="392" width="168" height="28" rx="14" fill="var(--color-ink)" />
        <circle cx="194" cy="406" r="3.5" fill="var(--color-mint)" />
        <text x="206" y="410" fill="var(--color-card)" style={{ font: "500 12px var(--font-sans)" }}>
          Booked for Thu 10:00
        </text>
      </g>
    </svg>
  );
}
