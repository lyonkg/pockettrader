import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { BadgeTone, DataBadgeInfo } from '../data/status';
import { colors } from '../theme';

const TONE: Record<BadgeTone, { bg: string; fg: string }> = {
  live: { bg: 'rgba(34,197,94,0.18)', fg: colors.green },
  mock: { bg: 'rgba(138,151,168,0.18)', fg: colors.muted },
  fallback: { bg: 'rgba(245,158,11,0.18)', fg: colors.yellow },
};

export function DataBadge({ info, compact, style, testID }: {
  info: DataBadgeInfo;
  compact?: boolean;
  style?: ViewStyle;
  testID?: string;
}) {
  const t = TONE[info.tone];
  return (
    <View
      testID={testID ?? 'data-mode-badge'}
      accessibilityRole="text"
      accessibilityLabel={info.label}
      style={[styles.badge, compact && styles.compact, { backgroundColor: t.bg }, style]}
    >
      <Text style={[styles.text, compact && styles.textCompact, { color: t.fg }]}>{info.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: 'flex-start' },
  compact: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6 },
  text: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  textCompact: { fontSize: 9, fontWeight: '700' },
});
