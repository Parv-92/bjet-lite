/**
 * Bjet Mobile Design System - Spacing & Sizing Tokens
 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  screenPadding: 16,
} as const;

export const radii = {
  none: 0,
  xs: 3,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

export type SpacingTokens = typeof spacing;
export type RadiiTokens = typeof radii;

