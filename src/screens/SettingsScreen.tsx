import React, { useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useApp } from '../store/AppContext';
import { Button, Card, Row, Segmented } from '../components/ui';
import { DataBadge } from '../components/DataBadge';
import { describeDataMode, maskKey } from '../data';
import { ENV_DATA_PROXY_URL, STARTING_CASH } from '../data/config';
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
  const { settings, updateSettings, resetAccount, quotes, dataError, provider } = useApp();
  const [key, setKey] = useState('');
  const sources = Object.values(quotes).reduce<Record<string, number>>((m, q) => ((m[q.source] = (m[q.source] ?? 0) + 1), m), {});
  const origins = Object.values(quotes).reduce<Record<string, number>>((m, q) => ((m[q.origin] = (m[q.origin] ?? 0) + 1), m), {});
  const badge = describeDataMode(settings.provider, quotes);
  const status = provider.getStatus();
  const keyConfigured = Boolean(settings.apiKey);
  const usingProxy = Boolean(ENV_DATA_PROXY_URL) || status.usingProxy;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16, gap: 14 }} testID="settings-screen">
      <Text style={styles.section}>Market data provider</Text>
      <Segmented
        options={['Mock', 'Live']}
        value={settings.provider === 'live' ? 'Live' : 'Mock'}
        onChange={(v) => updateSettings({ provider: v === 'Live' ? 'live' : 'mock' })}
      />
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text style={styles.bold}>Current mode</Text>
          <DataBadge info={badge} testID="settings-mode-badge" />
        </View>
        <Text style={styles.body}>
          <Text style={styles.bold}>Mock</Text>: deterministic random-walk prices that tick every 1.5s. Works offline, no API key.{'\n\n'}
          <Text style={styles.bold}>Live</Text>: crypto from CoinGecko (no key needed); stocks from Finnhub when an API key is set below
          or when a backend proxy is configured. Anything that fails or is missing automatically falls back to mock data for that symbol.
        </Text>
        <Row label="Active quote sources" value={Object.entries(sources).map(([k, v]) => `${k} (${v})`).join(', ') || '—'} />
        <Row label="Origins" value={Object.entries(origins).map(([k, v]) => `${k} (${v})`).join(', ') || '—'} />
        <Row label="Finnhub key" value={keyConfigured ? `Configured (${maskKey(settings.apiKey)})` : 'Not configured'} />
        <Row label="Proxy" value={usingProxy ? 'Configured' : 'Not configured'} />
        {dataError ? (
          <Text style={styles.error} testID="settings-last-error">Last error: {dataError}</Text>
        ) : (
          <Row label="Last error" value="None" />
        )}
      </Card>

      <Text style={styles.label}>Finnhub API key (stocks, optional)</Text>
      <Text style={styles.hint}>
        Get a free key at finnhub.io and paste it here. It is stored only on this device and is never shown in full.
        Leave empty to keep stocks on mock data in Live mode. CoinGecko does not require a key.
      </Text>
      <TextInput
        style={styles.input}
        value={key}
        onChangeText={setKey}
        placeholder={keyConfigured ? 'Enter a new key to replace the saved one' : 'Paste key from finnhub.io'}
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        textContentType="password"
        autoComplete="off"
        testID="finnhub-key-input"
      />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button
          title="Save API key"
          onPress={() => {
            updateSettings({ apiKey: key.trim() });
            setKey('');
          }}
          disabled={!key.trim()}
          style={{ flex: 1 }}
        />
        <Button
          title="Clear"
          color={colors.red}
          onPress={() => {
            updateSettings({ apiKey: '' });
            setKey('');
          }}
          disabled={!keyConfigured}
          style={{ flex: 1 }}
        />
      </View>

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
  hint: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  input: { backgroundColor: colors.card, color: colors.text, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border },
  error: { color: colors.yellow, marginTop: 8, fontSize: 12, lineHeight: 18 },
  footer: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 12 },
});
