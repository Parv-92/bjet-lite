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
          borderTopColor: colors.borderMuted,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 88 : 64,
          paddingBottom: Platform.OS === 'ios' ? 28 : 10,
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarItemStyle: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 2,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: fontWeights.medium,
          letterSpacing: -0.2,
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
              size={22}
              strokeWidth={focused ? 2.3 : 1.8}
            />
          ),
        }}
      />

      {/* 2. Scan (Center with subtle restrained accent) */}
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scan',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.scanIconPill, focused && styles.scanIconPillActive]}>
              <FileText
                color={focused ? colors.brandLight : color}
                size={20}
                strokeWidth={focused ? 2.3 : 1.8}
              />
            </View>
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
              size={22}
              strokeWidth={focused ? 2.3 : 1.8}
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

const styles = StyleSheet.create({
  scanIconPill: {
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 12,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanIconPillActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderColor: colors.brand,
  },
});
