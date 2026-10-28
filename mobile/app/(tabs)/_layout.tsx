/**
 * Bjet Mobile - Symmetrical 3-Tab Bottom Navigation
 *
 * Primary destinations:
 * 1. Transactions (Left)
 * 2. Scan (Center, restrained subtle accent, integrated in bar)
 * 3. Budgets (Right)
 *
 * Settings has moved to root Stack (/settings) with back button navigation.
 */
import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Tabs } from 'expo-router';
import {
  FileText,
  ReceiptText,
  PieChart,
} from 'lucide-react-native';
import { colors } from '../../src/theme/colors';
import { fontSizes, fontWeights } from '../../src/theme/typography';

export default function TabsLayout() {
  return (
    <Tabs
      initialRouteName="transactions"
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: Platform.OS === 'ios' ? 86 : 62,
          paddingBottom: Platform.OS === 'ios' ? 26 : 8,
          paddingTop: 8,
          elevation: 0,
        },
        tabBarActiveTintColor: colors.brandLight,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarItemStyle: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: fontWeights.medium,
          letterSpacing: 0.1,
          marginTop: 2,
        },
      }}
    >
      {/* 1. Transactions (Left) */}
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Transactions',
          tabBarIcon: ({ color, focused }) => (
            <ReceiptText
              color={color}
              size={21}
              strokeWidth={focused ? 2.2 : 1.7}
            />
          ),
        }}
      />

      {/* 2. Scan (Center) */}
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scan',
          tabBarIcon: ({ color, focused }) => (
            <FileText
              color={color}
              size={21}
              strokeWidth={focused ? 2.2 : 1.7}
            />
          ),
        }}
      />

      {/* 3. Budgets (Right) */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Budgets',
          tabBarIcon: ({ color, focused }) => (
            <PieChart
              color={color}
              size={21}
              strokeWidth={focused ? 2.2 : 1.7}
            />
          ),
        }}
      />

      {/* Hidden Routes (Maintained for route compatibility) */}
      <Tabs.Screen
        name="budgets"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

