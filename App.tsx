import React, { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppProvider, useApp } from './src/store/AppContext';
import PortfolioScreen from './src/screens/PortfolioScreen';
import WatchlistScreen from './src/screens/WatchlistScreen';
import OrdersScreen from './src/screens/OrdersScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import SymbolScreen from './src/screens/SymbolScreen';
import TradeScreen from './src/screens/TradeScreen';
import { DataBadge } from './src/components/DataBadge';
import { describeDataMode } from './src/data';
import { colors } from './src/theme';
import type { RootStackParamList, TabParamList } from './src/navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.card, text: colors.text, border: colors.border, primary: colors.accent },
};

const ICONS: Record<keyof TabParamList, string> = { Portfolio: '◔', Watchlist: '☆', Orders: '≡', Settings: '⚙' };

function ModeBadge() {
  const { settings, quotes } = useApp();
  return <DataBadge info={describeDataMode(settings.provider, quotes)} style={{ marginRight: 12 }} />;
}

function Tabs() {
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.bg },
        headerTitleStyle: { color: colors.text, fontWeight: '800' },
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          height: 64 + insets.bottom,
          paddingTop: 2,
          paddingBottom: Math.max(insets.bottom, 4),
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18, lineHeight: 22, height: 22 }}>{ICONS[route.name]}</Text>,
        tabBarLabelStyle: { fontSize: 11, lineHeight: 14, fontWeight: '600' },
        headerRight: () => <ModeBadge />,
      })}
    >
      <Tab.Screen name="Portfolio" component={PortfolioScreen} />
      <Tab.Screen name="Watchlist" component={WatchlistScreen} />
      <Tab.Screen name="Orders" component={OrdersScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

function Notice() {
  const { notice, dismissNotice } = useApp();
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(dismissNotice, 4000);
    return () => clearTimeout(t);
  }, [notice]);
  if (!notice) return null;
  return (
    <Pressable style={styles.notice} onPress={dismissNotice}>
      <Text style={styles.noticeText}>{notice}</Text>
    </Pressable>
  );
}

function Root() {
  const { ready } = useApp();
  if (!ready) {
    return (
      <View style={[styles.fill, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  return (
    <NavigationContainer theme={theme} documentTitle={{ formatter: () => 'PocketTrader' }}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen name="Symbol" component={SymbolScreen} />
        <Stack.Screen name="Trade" component={TradeScreen} options={{ presentation: 'modal' }} />
      </Stack.Navigator>
      <Notice />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <View style={styles.fill}>
          <StatusBar style="light" />
          <Root />
        </View>
      </AppProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  notice: {
    position: 'absolute', top: 50, left: 16, right: 16, backgroundColor: colors.accent, borderRadius: 12, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 10, elevation: 6,
  },
  noticeText: { color: '#fff', fontWeight: '700', textAlign: 'center' },
});
