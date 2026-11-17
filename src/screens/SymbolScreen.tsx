import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useApp } from '../store/AppContext';
import { getSymbolInfo } from '../data/symbols';
import { Candle, Timeframe } from '../data/types';
import PriceChart from '../components/PriceChart';
import { Button, Card, PnlText, Row, Segmented } from '../components/ui';
import { DataBadge } from '../components/DataBadge';
import { describeQuote } from '../data';
import { colors } from '../theme';
import { fmtMoney, fmtPct, fmtQty, fmtTime } from '../utils/format';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Symbol'>;
const TIMEFRAMES: Timeframe[] = ['1D', '1W', '1M', '1Y'];

export default function SymbolScreen({ route, navigation }: Props) {
  const { symbol } = route.params;
  const info = getSymbolInfo(symbol);
  const { quotes, provider, account, watchlist, addToWatchlist, removeFromWatchlist, settings } = useApp();
  const quote = quotes[symbol];
  const [tf, setTf] = useState<Timeframe>('1D');
  const [history, setHistory] = useState<Candle[]>([]);
  const [tail, setTail] = useState<Candle[]>([]);
  const [scrub, setScrub] = useState<Candle | null>(null);
  const inWatchlist = watchlist.includes(symbol);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: symbol,
      headerRight: () => (
        <Pressable
          onPress={() => (inWatchlist ? removeFromWatchlist(symbol) : addToWatchlist(symbol))}
          hitSlop={10}
          style={{ paddingHorizontal: 12 }}
          accessibilityLabel={inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
        >
          <Text style={{ fontSize: 22, color: inWatchlist ? colors.yellow : colors.muted }}>{inWatchlist ? '★' : '☆'}</Text>
        </Pressable>
      ),
    });
  }, [navigation, symbol, inWatchlist]);

  useEffect(() => {
    let alive = true;
    setHistory([]);
    setTail([]);
    provider.getHistory(symbol, tf).then((h) => alive && setHistory(h)).catch(() => alive && setHistory([]));
    return () => { alive = false; };
  }, [symbol, tf, provider]);

  // Append live ticks to the intraday chart so it moves in real time.
  useEffect(() => {
    if (!quote || tf !== '1D' || history.length === 0) return;
    setTail((t) => (t.length && t[t.length - 1].t >= quote.timestamp ? t : [...t.slice(-300), { t: quote.timestamp, p: quote.price }]));
  }, [quote?.timestamp, quote?.price, tf, history.length]);

  const data = useMemo(() => (tf === '1D' ? [...history, ...tail] : history), [history, tail, tf]);
  const first = data[0]?.p;
  const shown = scrub?.p ?? quote?.price ?? data[data.length - 1]?.p;
  const tfChange = first && shown ? shown - first : 0;
  const tfPct = first ? (tfChange / first) * 100 : 0;
  const last = quote?.price ?? data[data.length - 1]?.p;
  const lineColor = first && last && last < first ? colors.red : colors.green;
  const changeColor = tfChange >= 0 ? colors.green : colors.red;
  const pos = account.positions[symbol];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }} testID="symbol-screen">
      <View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text style={styles.name}>{info?.name ?? symbol}{quote ? ` · ${quote.source}` : ''}</Text>
          {describeQuote(settings.provider, quote) ? <DataBadge info={describeQuote(settings.provider, quote)!} compact /> : null}
        </View>
        <Text style={styles.price} testID="symbol-price">{shown != null ? fmtMoney(shown) : '—'}</Text>
        {scrub ? (
          <Text style={styles.muted}>{fmtTime(scrub.t)}  <Text style={{ color: changeColor }}>{fmtMoney(tfChange, { sign: true })} ({fmtPct(tfPct)})</Text></Text>
        ) : (
          <Text style={styles.muted}>
            <Text style={{ color: changeColor, fontWeight: '600' }}>{fmtMoney(tfChange, { sign: true })} ({fmtPct(tfPct)})</Text>  {tf === '1D' ? 'today' : `past ${tf}`}
          </Text>
        )}
      </View>

      <PriceChart data={data} color={lineColor} onScrub={setScrub} />
      <Segmented options={TIMEFRAMES} value={tf} onChange={setTf} />
      <Text style={styles.hint}>Tip: touch and drag across the chart to inspect prices.</Text>

      {quote && (
        <Card>
          <Row label="Last" value={fmtMoney(quote.price)} />
          <Row label="Prev close" value={fmtMoney(quote.prevClose)} />
          <Row label="Day change" value={<PnlText value={quote.change}>{fmtMoney(quote.change, { sign: true })} ({fmtPct(quote.changePct)})</PnlText>} />
        </Card>
      )}

      {pos && quote && (
        <Card>
          <Text style={styles.cardTitle}>Your position</Text>
          <Row label="Quantity" value={fmtQty(pos.qty)} />
          <Row label="Avg cost" value={fmtMoney(pos.avgCost)} />
          <Row label="Market value" value={fmtMoney(pos.qty * quote.price)} />
          <Row label="Unrealized P&L" value={<PnlText value={pos.qty * (quote.price - pos.avgCost)}>{fmtMoney(pos.qty * (quote.price - pos.avgCost), { sign: true })}</PnlText>} />
        </Card>
      )}

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Button testID="buy-button" title="Buy" color={colors.green} style={{ flex: 1 }} onPress={() => navigation.navigate('Trade', { symbol, side: 'buy' })} />
        <Button testID="sell-button" title="Sell" color={colors.red} style={{ flex: 1 }} disabled={!pos} onPress={() => navigation.navigate('Trade', { symbol, side: 'sell' })} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  name: { color: colors.muted, fontSize: 14 },
  price: { color: colors.text, fontSize: 34, fontWeight: '800', marginVertical: 2 },
  muted: { color: colors.muted },
  hint: { color: colors.muted, fontSize: 12, textAlign: 'center' },
  cardTitle: { color: colors.text, fontWeight: '700', fontSize: 16, marginBottom: 6 },
});
