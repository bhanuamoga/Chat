import React from "react";

/**
 * Clean 4-square App Menu Icon (LayoutGrid)
 * Matches the reference image logo
 */
export function MorrLogo({ className = "size-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect width="7" height="7" x="3" y="3" rx="1.5" fill="currentColor" fillOpacity="0.15" />
      <rect width="7" height="7" x="14" y="3" rx="1.5" fill="currentColor" fillOpacity="0.15" />
      <rect width="7" height="7" x="14" y="14" rx="1.5" fill="currentColor" fillOpacity="0.15" />
      <rect width="7" height="7" x="3" y="14" rx="1.5" fill="currentColor" fillOpacity="0.15" />
    </svg>
  );
}
