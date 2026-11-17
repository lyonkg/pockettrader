import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../store/AppContext';
import { getSymbolInfo, searchSymbols } from '../data/symbols';
import { DataBadge } from '../components/DataBadge';
import { describeQuote } from '../data';
import { colors } from '../theme';
import { fmtMoney, fmtPct } from '../utils/format';
import type { RootStackParamList } from '../navigation';

export default function WatchlistScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { watchlist, quotes, addToWatchlist, removeFromWatchlist, settings } = useApp();
  const [query, setQuery] = useState('');
  const searching = query.trim().length > 0;
  const results = searching ? searchSymbols(query) : [];

  return (
    <View style={styles.screen} testID="watchlist-screen">
      <TextInput
        style={styles.search}
        placeholder="Search symbols (e.g. AAPL, BTC)"
        placeholderTextColor={colors.muted}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="characters"
        autoCorrect={false}
        testID="symbol-search"
      />
      {searching ? (
        <FlatList
          data={results}
          keyExtractor={(i) => i.symbol}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={styles.empty}>No symbols match “{query}”.</Text>}
          renderItem={({ item }) => {
            const inList = watchlist.includes(item.symbol);
            return (
              <View style={styles.row}>
                <Pressable style={{ flex: 1 }} onPress={() => nav.navigate('Symbol', { symbol: item.symbol })}>
                  <Text style={styles.sym}>{item.symbol}</Text>
                  <Text style={styles.name}>{item.name} · {item.type}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => (inList ? removeFromWatchlist(item.symbol) : addToWatchlist(item.symbol))}
                  style={[styles.addBtn, inList && { backgroundColor: colors.border }]}
                  testID={`toggle-${item.symbol}`}
                >
                  <Text style={styles.addText}>{inList ? '✓ Added' : '+ Add'}</Text>
                </Pressable>
              </View>
            );
          }}
        />
      ) : (
        <FlatList
          data={watchlist}
          keyExtractor={(s) => s}
          ListEmptyComponent={<Text style={styles.empty}>Your watchlist is empty. Search above to add symbols.</Text>}
          renderItem={({ item }) => {
            const q = quotes[item];
            const up = (q?.changePct ?? 0) >= 0;
            return (
              <Pressable style={styles.row} onPress={() => nav.navigate('Symbol', { symbol: item })} testID={`watch-${item}`}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.sym}>{item}</Text>
                    {describeQuote(settings.provider, q) ? <DataBadge info={describeQuote(settings.provider, q)!} compact /> : null}
                  </View>
                  <Text style={styles.name} numberOfLines={1}>{getSymbolInfo(item)?.name}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', marginRight: 10 }}>
                  <Text style={styles.price}>{q ? fmtMoney(q.price) : '—'}</Text>
                  <View style={[styles.pill, { backgroundColor: up ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)' }]}>
                    <Text style={{ color: up ? colors.green : colors.red, fontWeight: '700', fontSize: 12 }}>{q ? fmtPct(q.changePct) : '—'}</Text>
                  </View>
                </View>
                <Pressable onPress={() => removeFromWatchlist(item)} hitSlop={10} accessibilityLabel={`Remove ${item}`}>
                  <Text style={styles.remove}>✕</Text>
                </Pressable>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16 },
  search: {
    backgroundColor: colors.card, color: colors.text, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    marginVertical: 12, borderWidth: 1, borderColor: colors.border, fontSize: 16,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  sym: { color: colors.text, fontWeight: '700', fontSize: 16 },
  name: { color: colors.muted, fontSize: 12, marginTop: 2 },
  price: { color: colors.text, fontWeight: '600', fontSize: 16 },
  pill: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginTop: 4 },
  remove: { color: colors.muted, fontSize: 16, paddingHorizontal: 4 },
  addBtn: { backgroundColor: colors.accent, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  addText: { color: '#fff', fontWeight: '700' },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 40 },
});
