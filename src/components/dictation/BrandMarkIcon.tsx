import React from "react";
import { BRAND_MARK_BOLT_POINTS, BRAND_MARK_VIEW_BOX } from "../brandMarkGeometry";

interface BrandMarkIconProps {
  size?: number;
  className?: string;
}

/**
 * The bolt brand mark. Filled rather than stroked so it stays solid at the
 * small sizes this is used at, and drawn in `currentColor` so it follows the
 * neutral foreground treatment of the surface that contains it.
 */
export function BrandMarkIcon({ size = 24, className }: BrandMarkIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={BRAND_MARK_VIEW_BOX}
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <polygon points={BRAND_MARK_BOLT_POINTS} fill="currentColor" />
    </svg>
  );
}
