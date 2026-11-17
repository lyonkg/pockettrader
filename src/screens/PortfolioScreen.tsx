import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApp } from '../store/AppContext';
import { availableCash, summarize } from '../store/orders';
import { STARTING_CASH } from '../data/config';
import { getSymbolInfo } from '../data/symbols';
import { Card, PnlText, Row } from '../components/ui';
import { DataBadge } from '../components/DataBadge';
import { describeQuote } from '../data';
import { colors } from '../theme';
import { fmtMoney, fmtPct, fmtQty } from '../utils/format';
import type { RootStackParamList } from '../navigation';

export default function PortfolioScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { account, quotes, settings } = useApp();
  const s = summarize(account, quotes);
  const totalReturn = s.totalValue - STARTING_CASH;
  const dayBase = s.totalValue - s.dayPnl;
  const holdings = Object.entries(account.positions).sort(
    (a, b) => b[1].qty * (quotes[b[0]]?.price ?? b[1].avgCost) - a[1].qty * (quotes[a[0]]?.price ?? a[1].avgCost),
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="portfolio-screen">
      <Card>
        <Text style={styles.label}>Total portfolio value</Text>
        <Text style={styles.total} testID="total-value">{fmtMoney(s.totalValue)}</Text>
        <View style={styles.pnlRow}>
          <PnlText value={s.dayPnl}>{fmtMoney(s.dayPnl, { sign: true })} ({fmtPct(dayBase ? (s.dayPnl / dayBase) * 100 : 0)})</PnlText>
          <Text style={styles.muted}>  today</Text>
        </View>
        <View style={styles.divider} />
        <Row label="Cash" value={fmtMoney(account.cash)} />
        <Row label="Buying power" value={fmtMoney(availableCash(account))} />
        <Row label="Holdings value" value={fmtMoney(s.marketValue)} />
        <Row label="Unrealized P&L" value={<PnlText value={s.unrealizedPnl}>{fmtMoney(s.unrealizedPnl, { sign: true })}</PnlText>} />
        <Row label="Total return" value={<PnlText value={totalReturn}>{fmtMoney(totalReturn, { sign: true })} ({fmtPct((totalReturn / STARTING_CASH) * 100)})</PnlText>} />
      </Card>

      <Text style={styles.section}>Holdings</Text>
      {holdings.length === 0 ? (
        <Card><Text style={styles.muted}>No positions yet. Open the Watchlist tab and tap a symbol to place your first trade.</Text></Card>
      ) : (
        <Card style={{ paddingVertical: 4 }}>
          {holdings.map(([sym, pos], i) => {
            const q = quotes[sym];
            const price = q?.price ?? pos.avgCost;
            const mv = pos.qty * price;
            const pnl = mv - pos.qty * pos.avgCost;
            const pnlPct = pos.avgCost ? (price / pos.avgCost - 1) * 100 : 0;
            return (
              <Pressable key={sym} onPress={() => nav.navigate('Symbol', { symbol: sym })} style={[styles.holding, i > 0 && styles.sep]}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.sym}>{sym}</Text>
                    {describeQuote(settings.provider, q) ? <DataBadge info={describeQuote(settings.provider, q)!} compact /> : null}
                  </View>
                  <Text style={styles.small}>{fmtQty(pos.qty)} @ {fmtMoney(pos.avgCost)} avg</Text>
                  <Text style={styles.small}>{getSymbolInfo(sym)?.name}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.mv}>{fmtMoney(mv)}</Text>
                  <Text style={styles.small}>Last {fmtMoney(price)}</Text>
                  <PnlText value={pnl} style={{ fontSize: 13 }}>{fmtMoney(pnl, { sign: true })} ({fmtPct(pnlPct)})</PnlText>
                </View>
              </Pressable>
            );
          })}
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  label: { color: colors.muted, fontSize: 13 },
  total: { color: colors.text, fontSize: 34, fontWeight: '800', marginTop: 4 },
  pnlRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  muted: { color: colors.muted },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 12 },
  section: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 8 },
  holding: { flexDirection: 'row', paddingVertical: 12 },
  sep: { borderTopWidth: 1, borderTopColor: colors.border },
  sym: { color: colors.text, fontWeight: '700', fontSize: 16 },
  small: { color: colors.muted, fontSize: 12, marginTop: 2 },
  mv: { color: colors.text, fontWeight: '700', fontSize: 16 },
});
