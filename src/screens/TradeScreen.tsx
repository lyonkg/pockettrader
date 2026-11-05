import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useApp } from '../store/AppContext';
import { availableCash, availableQty, Order, OrderType, Side, validateOrder } from '../store/orders';
import { Button, Card, Row, Segmented } from '../components/ui';
import { colors } from '../theme';
import { fmtMoney, fmtQty } from '../utils/format';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Trade'>;
type Step = 'edit' | 'review' | 'done';

const SIDES = ['Buy', 'Sell'] as const;
const TYPES = ['Market', 'Limit'] as const;

export default function TradeScreen({ route, navigation }: Props) {
  const { symbol } = route.params;
  const { quotes, account, submitOrder } = useApp();
  const quote = quotes[symbol];
  const [side, setSide] = useState<Side>(route.params.side ?? 'buy');
  const [type, setType] = useState<OrderType>('market');
  const [qtyText, setQtyText] = useState('');
  const [limitText, setLimitText] = useState('');
  const [step, setStep] = useState<Step>('edit');
  const [result, setResult] = useState<{ order: Order; error: string | null } | null>(null);

  useEffect(() => navigation.setOptions({ title: `${side === 'buy' ? 'Buy' : 'Sell'} ${symbol}` }), [side, symbol]);
  useEffect(() => {
    if (type === 'limit' && !limitText && quote) setLimitText(quote.price.toFixed(quote.price < 1 ? 4 : 2));
  }, [type]);

  const price = quote?.price ?? NaN;
  const qty = parseFloat(qtyText.replace(',', '.'));
  const limitPrice = parseFloat(limitText.replace(',', '.'));
  const req = { symbol, side, type, qty, limitPrice: type === 'limit' ? limitPrice : undefined };
  const error = qtyText ? validateOrder(account, req, price) : null;
  const execPx = type === 'limit' ? limitPrice : price;
  const estimate = isFinite(qty) && isFinite(execPx) ? qty * execPx : 0;
  const cash = availableCash(account);
  const held = availableQty(account, symbol);

  const setMax = () => {
    if (side === 'sell') setQtyText(fmtQty(held));
    else if (isFinite(execPx) && execPx > 0) {
      const crypto = symbol.endsWith('-USD');
      const m = cash / execPx;
      setQtyText(crypto ? (Math.floor(m * 1e6) / 1e6).toString() : Math.floor(m).toString());
    }
  };

  const confirm = () => {
    const r = submitOrder(req);
    setResult(r);
    setStep('done');
  };

  if (step === 'done' && result) {
    const o = result.order;
    const ok = !result.error;
    return (
      <View style={[styles.screen, { padding: 16, gap: 16 }]} testID="order-result">
        <Card>
          <Text style={[styles.big, { color: ok ? colors.green : colors.red }]}>
            {ok ? (o.status === 'filled' ? 'Order filled ✓' : 'Limit order placed') : 'Order rejected'}
          </Text>
          <Row label="Symbol" value={o.symbol} />
          <Row label="Side" value={o.side.toUpperCase()} />
          <Row label="Type" value={o.type.toUpperCase()} />
          <Row label="Quantity" value={fmtQty(o.qty)} />
          {o.limitPrice != null && <Row label="Limit" value={fmtMoney(o.limitPrice)} />}
          {o.fillPrice != null && <Row label="Fill price" value={fmtMoney(o.fillPrice)} />}
          {o.status === 'open' && <Text style={styles.muted}>It will fill automatically when the price crosses your limit.</Text>}
          {result.error && <Text style={{ color: colors.red, marginTop: 6 }}>{result.error}</Text>}
        </Card>
        <Button title="Done" onPress={() => navigation.goBack()} testID="done-button" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled" testID="trade-screen">
        <Card>
          <Row label="Market price" value={quote ? fmtMoney(quote.price) : '—'} />
          <Row label="Buying power" value={fmtMoney(cash)} />
          <Row label={`${symbol} available`} value={fmtQty(held)} />
        </Card>

        {step === 'edit' ? (
          <>
            <Segmented options={[...SIDES]} value={side === 'buy' ? 'Buy' : 'Sell'} onChange={(v) => setSide(v === 'Buy' ? 'buy' : 'sell')} />
            <Segmented options={[...TYPES]} value={type === 'market' ? 'Market' : 'Limit'} onChange={(v) => setType(v === 'Market' ? 'market' : 'limit')} />

            <Text style={styles.label}>Quantity</Text>
            <View style={styles.inputRow}>
              <TextInput
                testID="qty-input"
                style={[styles.input, { flex: 1 }]}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.muted}
                value={qtyText}
                onChangeText={setQtyText}
              />
              <Pressable onPress={setMax} style={styles.maxBtn}><Text style={styles.maxText}>MAX</Text></Pressable>
            </View>

            {type === 'limit' && (
              <>
                <Text style={styles.label}>Limit price</Text>
                <TextInput
                  testID="limit-input"
                  style={styles.input}
                  keyboardType="decimal-pad"
                  value={limitText}
                  onChangeText={setLimitText}
                  placeholderTextColor={colors.muted}
                />
                <Text style={styles.muted}>
                  {side === 'buy' ? 'Fills when price ≤ limit.' : 'Fills when price ≥ limit.'}
                </Text>
              </>
            )}

            <Row label={side === 'buy' ? 'Estimated cost' : 'Estimated proceeds'} value={fmtMoney(estimate)} />
            {error && <Text style={styles.error} testID="order-error">{error}</Text>}
            <Button
              testID="review-button"
              title="Review order"
              color={side === 'buy' ? colors.green : colors.red}
              disabled={!qtyText || !!error}
              onPress={() => setStep('review')}
            />
          </>
        ) : (
          <>
            <Card>
              <Text style={styles.cardTitle}>Order preview</Text>
              <Row label="Action" value={`${side.toUpperCase()} ${fmtQty(qty)} ${symbol}`} />
              <Row label="Order type" value={type === 'market' ? 'Market' : `Limit @ ${fmtMoney(limitPrice)}`} />
              <Row label={side === 'buy' ? 'Estimated cost' : 'Estimated proceeds'} value={fmtMoney(estimate)} />
              <Row label="Cash after" value={fmtMoney(side === 'buy' ? cash - estimate : cash + estimate)} />
              <Text style={[styles.muted, { marginTop: 6 }]}>Demo account — no real money is used.</Text>
            </Card>
            {error && <Text style={styles.error}>{error}</Text>}
            <Button testID="confirm-button" title={`Confirm ${side}`} color={side === 'buy' ? colors.green : colors.red} disabled={!!error} onPress={confirm} />
            <Button title="Edit" color={colors.cardAlt} onPress={() => setStep('edit')} />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  label: { color: colors.muted, fontSize: 13, marginBottom: -6 },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: {
    backgroundColor: colors.card, color: colors.text, borderRadius: 12, padding: 14, fontSize: 18,
    borderWidth: 1, borderColor: colors.border,
  },
  maxBtn: { backgroundColor: colors.cardAlt, borderRadius: 12, paddingHorizontal: 16, justifyContent: 'center' },
  maxText: { color: colors.accent, fontWeight: '800' },
  muted: { color: colors.muted, fontSize: 12 },
  error: { color: colors.red, fontWeight: '600' },
  big: { fontSize: 22, fontWeight: '800', marginBottom: 8 },
  cardTitle: { color: colors.text, fontWeight: '700', fontSize: 16, marginBottom: 6 },
});
