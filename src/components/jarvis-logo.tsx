/**
 * Jarvis identity mark — a unique arc-reactor-style emblem:
 * outer ring, cardinal + diagonal spokes, glowing core.
 * Rendered with currentColor so it inherits any text color.
 */
export function JarvisLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* core */}
      <circle cx="12" cy="12" r="3.1" fill="currentColor" />
      {/* outer ring */}
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      {/* inner arc dashes — the reactor feel */}
      <path
        d="M12 5.4 A6.6 6.6 0 0 1 16.7 7.9 M18.6 12 A6.6 6.6 0 0 1 16.7 17.9 M12 18.6 A6.6 6.6 0 0 1 7.3 16.9 M5.4 12 A6.6 6.6 0 0 1 7.9 7.3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* cardinal spokes through the ring */}
      <path
        d="M12 1.5v2.4M12 20.1v2.4M1.5 12h2.4M20.1 12h2.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
