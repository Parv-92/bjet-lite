/**
 * Bjet Mobile Design System - Color Palette
 * Graphite Ledger palette: matte carbon background, tactile surfaces,
 * hairline borders, and calibrated mint/ochre financial signals.
 */
export const colors = {
  background: '#0B0D10', // Deep carbon graphite
  surface: '#13151A',    // Elevated plane
  surfaceElevated: '#1A1D24', // Card and control surface
  surfaceHover: '#20242E',
  border: '#242832',     // Precision boundary
  borderMuted: '#1A1D25',

  // Financial Accents (Calibrated Mint & Amber)
  brand: '#14B8A6',      // Restrained mint primary
  brandDark: '#0D9488',  // Deep mint
  brandLight: '#2DD4BF', // Crisp mint highlight

  // High-Legibility Typography
  text: '#F3F4F6',          // Crisp off-white paper
  textSecondary: '#9CA3AF', // Neutral cool gray
  textMuted: '#64748B',     // Subdued metadata

  // Functional Financial Statuses
  danger: '#F43F5E',     // Clean crimson red (outflows & budget warnings)
  dangerDark: '#BE123C', // Deep crimson
  warning: '#F59E0B',    // Amber
  info: '#38BDF8',       // Sky blue
  success: '#10B981',    // Emerald success

  // Overlays
  backdrop: 'rgba(11, 13, 16, 0.88)',
  cardHighlight: 'rgba(255, 255, 255, 0.02)',
} as const;

export type ColorTokens = typeof colors;

