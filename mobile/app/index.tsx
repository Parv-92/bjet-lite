/**
 * Bjet Mobile - Entry Index
 * Delegated to root RouteGuard which redirects to (tabs) or (auth)/login.
 */
import React from 'react';
import { Redirect } from 'expo-router';


export default function EntryIndex() {
  return <Redirect href="/(tabs)" />;
}

