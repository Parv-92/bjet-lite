/**
 * Bjet Lite - Budgets Route Redirect
 * In Bjet Lite, the Budgets experience has been merged into the primary Overview tab at /(tabs).
 * This file maintains route compatibility for any links targeting /(tabs)/budgets.
 */
import React from 'react';
import { Redirect } from 'expo-router';

export default function BudgetsRouteRedirect() {
  return <Redirect href="/(tabs)" />;
}
