/**
 * Bjet Mobile Design System - Color Palette
 * Dark-first curated theme tokens conforming to Bjet specifications.
 */
export const colors = {
  background: '#020617', // Slate 950
  surface: '#0f172a',    // Slate 900
  surfaceElevated: '#1e293b', // Slate 800
  surfaceHover: '#1e293b',
  border: '#334155',     // Slate 700
  borderMuted: '#1e293b',

  // Brand Accents
  brand: '#10b981',      // Emerald 500
  brandDark: '#059669',  // Emerald 600
  brandLight: '#34d399', // Emerald 400

  // Typography
  text: '#f8fafc',          // Slate 50
  textSecondary: '#94a3b8', // Slate 400
  textMuted: '#64748b',     // Slate 500

  // Functional Statuses
  danger: '#ef4444',     // Red 500
  dangerDark: '#b91c1c', // Red 700
  warning: '#f59e0b',    // Amber 500
  info: '#3b82f6',       // Blue 500
  success: '#10b981',    // Emerald 500

  // Overlay / Backdrop
  backdrop: 'rgba(2, 6, 23, 0.75)',
  cardHighlight: 'rgba(255, 255, 255, 0.03)',
} as const;

export type ColorTokens = typeof colors;
