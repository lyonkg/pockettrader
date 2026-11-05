import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../store/AppContext';
import { OrderStatus } from '../store/orders';
import { Segmented } from '../components/ui';
import { colors } from '../theme';
import { fmtMoney, fmtQty, fmtTime } from '../utils/format';

const FILTERS = ['All', 'Open', 'Filled', 'Other'] as const;
const STATUS_COLOR: Record<OrderStatus, string> = {
  open: colors.yellow, filled: colors.green, cancelled: colors.muted, rejected: colors.red,
};

export default function OrdersScreen() {
  const { account, cancel, quotes } = useApp();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  const orders = account.orders.filter((o) =>
    filter === 'All' ? true : filter === 'Open' ? o.status === 'open' : filter === 'Filled' ? o.status === 'filled' : o.status === 'cancelled' || o.status === 'rejected',
  );

  return (
    <View style={styles.screen} testID="orders-screen">
      <View style={{ padding: 16, paddingBottom: 8 }}>
        <Segmented options={[...FILTERS]} value={filter} onChange={setFilter} />
      </View>
      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        ListEmptyComponent={<Text style={styles.empty}>No orders yet.</Text>}
        renderItem={({ item: o }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>
                <Text style={{ color: o.side === 'buy' ? colors.green : colors.red }}>{o.side.toUpperCase()}</Text> {fmtQty(o.qty)} {o.symbol}
              </Text>
              <Text style={styles.small}>
                {o.type === 'market' ? 'Market' : `Limit ${fmtMoney(o.limitPrice ?? 0)}`} · {fmtTime(o.createdAt)}
              </Text>
              {o.fillPrice != null && <Text style={styles.small}>Filled @ {fmtMoney(o.fillPrice)} = {fmtMoney(o.fillPrice * o.qty)}</Text>}
              {o.status === 'open' && quotes[o.symbol] && <Text style={styles.small}>Last {fmtMoney(quotes[o.symbol].price)}</Text>}
              {o.reason && <Text style={[styles.small, { color: colors.red }]}>{o.reason}</Text>}
            </View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <Text style={[styles.status, { color: STATUS_COLOR[o.status], borderColor: STATUS_COLOR[o.status] }]}>{o.status.toUpperCase()}</Text>
              {o.status === 'open' && (
                <Pressable onPress={() => cancel(o.id)} accessibilityRole="button"><Text style={styles.cancel}>Cancel</Text></Pressable>
              )}
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: 'row', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { color: colors.text, fontWeight: '700', fontSize: 15 },
  small: { color: colors.muted, fontSize: 12, marginTop: 2 },
  status: { fontSize: 11, fontWeight: '800', borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  cancel: { color: colors.accent, fontWeight: '700' },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 40 },
});
