/**
 * Bjet Mobile - Entry Index
 * Redirects to the primary (tabs)/transactions tab upon app launch.
 */
import React from 'react';
import { Redirect } from 'expo-router';

export default function EntryIndex() {
  return <Redirect href="/(tabs)/transactions" />;
}
