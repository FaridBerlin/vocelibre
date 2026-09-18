import {
  BRAND_MARK_BADGE_FILL,
  BRAND_MARK_BADGE_RADIUS,
  BRAND_MARK_BOLT_POINTS,
  BRAND_MARK_VIEW_BOX,
} from "./brandMarkGeometry";

interface BrandBadgeProps {
  className?: string;
  /** Sets an accessible name; without one the badge is decorative and hidden. */
  label?: string;
}

/**
 * The app icon as inline SVG: bolt on the brand rounded square.
 *
 * Three surfaces pasted this markup separately, which is how they kept drawing
 * the retired sound-bars glyph after the app icons were rebranded. Render this
 * instead of copying the paths again.
 */
export function BrandBadge({ className, label }: BrandBadgeProps) {
  return (
    <svg
      viewBox={BRAND_MARK_VIEW_BOX}
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <rect width="1024" height="1024" rx={BRAND_MARK_BADGE_RADIUS} fill={BRAND_MARK_BADGE_FILL} />
      <polygon points={BRAND_MARK_BOLT_POINTS} fill="white" />
    </svg>
  );
}
