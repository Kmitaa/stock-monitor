export type MarketId = 'gold' | 'btc' | 'eth' | 'sp500' | 'nasdaq' | 'eurusd' | 'oil';

export const MARKETS: Record<
  MarketId,
  {
    id: MarketId;
    label: string;
    shortLabel: string;
    yahooSymbol: string;
    tradingViewSymbol: string;
    /** Passed into the AI system prompt */
    aiContext: string;
  }
> = {
  gold: {
    id: 'gold',
    label: 'Gold XAU',
    shortLabel: 'Gold',
    yahooSymbol: 'GC=F',
    tradingViewSymbol: 'OANDA:XAUUSD',
    aiContext: 'the gold market (Yahoo: GC=F; TradingView: XAU/USD)',
  },
  btc: {
    id: 'btc',
    label: 'Bitcoin',
    shortLabel: 'BTC / USD',
    yahooSymbol: 'BTC-USD',
    tradingViewSymbol: 'COINBASE:BTCUSD',
    aiContext: 'Bitcoin vs USD (Yahoo: BTC-USD; TradingView: Coinbase BTC/USD)',
  },
  eth: {
    id: 'eth',
    label: 'Ethereum',
    shortLabel: 'ETH / USD',
    yahooSymbol: 'ETH-USD',
    tradingViewSymbol: 'COINBASE:ETHUSD',
    aiContext: 'Ethereum vs USD (Yahoo: ETH-USD; TradingView: Coinbase ETH/USD)',
  },
  sp500: {
    id: 'sp500',
    label: 'S&P 500',
    shortLabel: 'S&P 500',
    yahooSymbol: '^GSPC',
    tradingViewSymbol: 'OANDA:SPX500USD',
    aiContext: 'S&P 500 index (Yahoo: ^GSPC; TradingView: SPX500USD)',
  },
  nasdaq: {
    id: 'nasdaq',
    label: 'Nasdaq 100',
    shortLabel: 'NASDAQ 100',
    yahooSymbol: '^NDX',
    tradingViewSymbol: 'OANDA:NAS100USD',
    aiContext: 'Nasdaq 100 index (Yahoo: ^NDX; TradingView: NAS100USD)',
  },
  eurusd: {
    id: 'eurusd',
    label: 'EUR/USD',
    shortLabel: 'EUR / USD',
    yahooSymbol: 'EURUSD=X',
    tradingViewSymbol: 'FX:EURUSD',
    aiContext: 'EUR/USD forex pair (Yahoo: EURUSD=X; TradingView: EURUSD)',
  },
  oil: {
    id: 'oil',
    label: 'Crude Oil',
    shortLabel: 'US OIL',
    yahooSymbol: 'CL=F',
    tradingViewSymbol: 'OANDA:WTICOUSD',
    aiContext: 'WTI crude oil (Yahoo: CL=F; TradingView: WTICOUSD)',
  },
};

export function parseMarketParam(v: string | null): MarketId {
  if (!v) return 'gold';
  return v in MARKETS ? (v as MarketId) : 'gold';
}
