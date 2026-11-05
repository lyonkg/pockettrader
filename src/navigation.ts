import { Side } from './store/orders';

export type RootStackParamList = {
  Tabs: undefined;
  Symbol: { symbol: string };
  Trade: { symbol: string; side?: Side };
};

export type TabParamList = {
  Portfolio: undefined;
  Watchlist: undefined;
  Orders: undefined;
  Settings: undefined;
};
