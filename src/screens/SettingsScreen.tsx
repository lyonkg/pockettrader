import React, { useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { useApp } from '../store/AppContext';
import { Button, Card, Row, Segmented } from '../components/ui';
import { STARTING_CASH } from '../data/config';
import { colors } from '../theme';
import { fmtMoney } from '../utils/format';

function confirmAction(title: string, msg: string, onOk: () => void) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${msg}`)) onOk();
    return;
  }
  Alert.alert(title, msg, [{ text: 'Cancel', style: 'cancel' }, { text: 'Reset', style: 'destructive', onPress: onOk }]);
}

export default function SettingsScreen() {
  const { settings, updateSettings, resetAccount, quotes } = useApp();
  const [key, setKey] = useState(settings.apiKey);
  const sources = Object.values(quotes).reduce<Record<string, number>>((m, q) => ((m[q.source] = (m[q.source] ?? 0) + 1), m), {});

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16, gap: 14 }} testID="settings-screen">
      <Text style={styles.section}>Market data provider</Text>
      <Segmented
        options={['Mock', 'Live']}
        value={settings.provider === 'live' ? 'Live' : 'Mock'}
        onChange={(v) => updateSettings({ provider: v === 'Live' ? 'live' : 'mock' })}
      />
      <Card>
        <Text style={styles.body}>
          <Text style={styles.bold}>Mock</Text>: deterministic random-walk prices that tick every 1.5s. Works offline, no API key.{'\n\n'}
          <Text style={styles.bold}>Live</Text>: crypto from CoinGecko (no key needed); stocks from Finnhub when an API key is set below.
          Anything that fails or is missing automatically falls back to mock data.
        </Text>
        <Row label="Active quote sources" value={Object.entries(sources).map(([k, v]) => `${k} (${v})`).join(', ') || '—'} />
      </Card>

      <Text style={styles.label}>Finnhub API key (stocks, optional)</Text>
      <TextInput
        style={styles.input}
        value={key}
        onChangeText={setKey}
        placeholder="Paste key from finnhub.io"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />
      <Button title="Save API key" onPress={() => updateSettings({ apiKey: key.trim() })} disabled={key.trim() === settings.apiKey} />

      <Text style={styles.section}>Demo account</Text>
      <Button
        title={`Reset demo account (${fmtMoney(STARTING_CASH)})`}
        color={colors.red}
        onPress={() => confirmAction('Reset demo account?', 'All positions and order history will be cleared.', resetAccount)}
        testID="reset-button"
      />
      <Text style={styles.footer}>Paper trading only. Prices may be simulated. Not investment advice.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  section: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 6 },
  body: { color: colors.muted, lineHeight: 20, marginBottom: 8 },
  bold: { color: colors.text, fontWeight: '700' },
  label: { color: colors.muted, fontSize: 13 },
  input: { backgroundColor: colors.card, color: colors.text, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border },
  footer: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 12 },
});
