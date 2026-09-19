/**
 * Jarvis identity mark — a unique arc-reactor-style emblem.
 * Bolder strokes + a baked-in glow so it stays crisp & bright even at 12px.
 * Rendered with currentColor so it inherits any text color.
 */
export function JarvisLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
      style={{ filter: "drop-shadow(0 0 2.5px color-mix(in srgb, var(--primary) 45%, transparent))" }}
    >
      {/* core */}
      <circle cx="12" cy="12" r="3.3" fill="currentColor" />
      {/* outer ring */}
      <circle cx="12" cy="12" r="8.4" stroke="currentColor" strokeWidth="2" />
      {/* inner arc dashes — the reactor feel (4 ~90° arcs, one per quadrant) */}
      <path
        d="M12 6.4 A5.6 5.6 0 0 1 17.51 11.03 M17.6 12 A5.6 5.6 0 0 1 11.03 17.51 M12 17.6 A5.6 5.6 0 0 1 6.49 11.01 M6.4 12 A5.6 5.6 0 0 1 12.97 6.49"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* cardinal spokes through the ring */}
      <path
        d="M12 1.3v2.4M12 20.3v2.4M1.3 12h2.4M20.3 12h2.4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
