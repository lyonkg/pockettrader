import React from 'react';
import { Pressable, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { colors } from '../theme';

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({ title, onPress, color = colors.accent, disabled, style, testID }: {
  title: string; onPress: () => void; color?: string; disabled?: boolean; style?: ViewStyle; testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.btn, { backgroundColor: color, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 }, style]}
    >
      <Text style={styles.btnText}>{title}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: T[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.seg}>
      {options.map((o) => (
        <Pressable key={o} onPress={() => onChange(o)} style={[styles.segItem, value === o && styles.segActive]} accessibilityRole="button">
          <Text style={[styles.segText, value === o && { color: colors.text }]}>{o}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function PnlText({ value, children, style }: { value: number; children: React.ReactNode; style?: TextStyle }) {
  const c = value > 0 ? colors.green : value < 0 ? colors.red : colors.muted;
  return <Text style={[{ color: c, fontWeight: '600' }, style]}>{children}</Text>;
}

export function Row({ label, value, valueStyle }: { label: string; value: React.ReactNode; valueStyle?: TextStyle }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      {typeof value === 'string' ? <Text style={[styles.value, valueStyle]}>{value}</Text> : value}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border },
  btn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  seg: { flexDirection: 'row', backgroundColor: colors.cardAlt, borderRadius: 10, padding: 3 },
  segItem: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  segActive: { backgroundColor: colors.border },
  segText: { color: colors.muted, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  label: { color: colors.muted },
  value: { color: colors.text, fontWeight: '600' },
});
