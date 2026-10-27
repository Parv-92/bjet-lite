/**
 * Bjet Mobile - Bottom Tabs Layout
 * Features 5 tabs: Home, Transactions, Scan (prominent elevated central button),
 * Budgets, and Settings.
 */
import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Tabs } from 'expo-router';
import {
  FileText,
  ReceiptText,
  PieChart,
  Settings as SettingsIcon,
} from 'lucide-react-native';
import { colors } from '../../src/theme/colors';
import { fontSizes, fontWeights } from '../../src/theme/typography';

export default function TabsLayout() {
  return (
    <Tabs
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
          paddingHorizontal: 0,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: fontWeights.medium,
          letterSpacing: -0.2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Budgets',
          tabBarIcon: ({ color, size }) => <PieChart color={color} size={size || 22} />,
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Transactions',
          tabBarIcon: ({ color, size }) => <ReceiptText color={color} size={size || 22} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Import',
          tabBarIcon: ({ focused }) => (
            <View style={[styles.elevatedScanButton, focused && styles.elevatedScanButtonActive]}>
              <FileText color="#020617" size={24} strokeWidth={2.5} />
            </View>
          ),
          tabBarLabel: () => null, // Hide text label to emphasize the elevated action
        }}
      />
      <Tabs.Screen
        name="budgets"
        options={{
          href: null, // Hidden from tab bar, handled by merged overview
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <SettingsIcon color={color} size={size || 22} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  elevatedScanButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Platform.OS === 'ios' ? 16 : 22,
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 8,
    borderWidth: 3,
    borderColor: colors.background,
  },
  elevatedScanButtonActive: {
    backgroundColor: colors.brandLight,
    transform: [{ scale: 1.05 }],
  },
});
