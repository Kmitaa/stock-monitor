import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';
import { formatFxRateCaption, type FxPairFormat } from '@/lib/format-currency-tickers';

const yahooFinance = new YahooFinance();

export const dynamic = 'force-dynamic';

const FX_ROWS: { symbol: string; label: string; format: 'per_usd' | 'usd_per_unit' }[] = [
  { symbol: 'EURUSD=X', label: 'EUR', format: 'usd_per_unit' },
  { symbol: 'GBPUSD=X', label: 'GBP', format: 'usd_per_unit' },
  { symbol: 'AUDUSD=X', label: 'AUD', format: 'usd_per_unit' },
  { symbol: 'NZDUSD=X', label: 'NZD', format: 'usd_per_unit' },
  { symbol: 'USDJPY=X', label: 'JPY', format: 'per_usd' },
  { symbol: 'USDCAD=X', label: 'CAD', format: 'per_usd' },
  { symbol: 'USDCHF=X', label: 'CHF', format: 'per_usd' },
  { symbol: 'USDPLN=X', label: 'PLN', format: 'per_usd' },
  { symbol: 'USDSEK=X', label: 'SEK', format: 'per_usd' },
  { symbol: 'USDNOK=X', label: 'NOK', format: 'per_usd' },
  { symbol: 'USDDKK=X', label: 'DKK', format: 'per_usd' },
  { symbol: 'USDTRY=X', label: 'TRY', format: 'per_usd' },
  { symbol: 'USDMXN=X', label: 'MXN', format: 'per_usd' },
  { symbol: 'USDSGD=X', label: 'SGD', format: 'per_usd' },
  { symbol: 'USDZAR=X', label: 'ZAR', format: 'per_usd' },
  { symbol: 'USDCNH=X', label: 'CNH', format: 'per_usd' },
];

const CRYPTO_ROWS: { symbol: string; label: string }[] = [
  { symbol: 'BTC-USD', label: 'BTC' },
  { symbol: 'ETH-USD', label: 'ETH' },
  { symbol: 'SOL-USD', label: 'SOL' },
  { symbol: 'XRP-USD', label: 'XRP' },
  { symbol: 'ADA-USD', label: 'ADA' },
  { symbol: 'DOGE-USD', label: 'DOGE' },
  { symbol: 'AVAX-USD', label: 'AVAX' },
  { symbol: 'LINK-USD', label: 'LINK' },
  { symbol: 'LTC-USD', label: 'LTC' },
  { symbol: 'DOT-USD', label: 'DOT' },
  { symbol: 'TRX-USD', label: 'TRX' },
  { symbol: 'ATOM-USD', label: 'ATOM' },
  { symbol: 'NEAR-USD', label: 'NEAR' },
  { symbol: 'BCH-USD', label: 'BCH' },
  { symbol: 'XLM-USD', label: 'XLM' },
  { symbol: 'UNI-USD', label: 'UNI' },
  { symbol: 'SHIB-USD', label: 'SHIB' },
  { symbol: 'MATIC-USD', label: 'MATIC' },
  { symbol: 'APT-USD', label: 'APT' },
  { symbol: 'HBAR-USD', label: 'HBAR' },
  { symbol: 'OP-USD', label: 'OP' },
  { symbol: 'ARB-USD', label: 'ARB' },
  { symbol: 'SUI-USD', label: 'SUI' },
];

export type TickerRow = {
  label: string;
  symbol: string;
  price: number | null;
  changePct: number | null;
  caption: string;
  /** Set for FX pairs so the UI can mirror terminal-style layout */
  fxFormat?: FxPairFormat;
};

export async function GET() {
  const allSymbols = [...FX_ROWS.map((r) => r.symbol), ...CRYPTO_ROWS.map((r) => r.symbol)];

  try {
    const quotes = await yahooFinance.quote(allSymbols);
    const list = Array.isArray(quotes) ? quotes : [quotes];
    const bySymbol = new Map(list.map((q) => [q.symbol, q]));

    const fx: TickerRow[] = FX_ROWS.map((row) => {
      const q = bySymbol.get(row.symbol);
      const price = q?.regularMarketPrice ?? null;
      const changePct = q?.regularMarketChangePercent ?? null;
      const caption =
        price != null ? formatFxRateCaption(price, row.label, row.format) : '—';
      return {
        label: row.label,
        symbol: row.symbol,
        price,
        changePct,
        caption,
        fxFormat: row.format,
      };
    });

    const crypto: TickerRow[] = CRYPTO_ROWS.map((row) => {
      const q = bySymbol.get(row.symbol);
      const price = q?.regularMarketPrice ?? null;
      const changePct = q?.regularMarketChangePercent ?? null;
      return {
        label: row.label,
        symbol: row.symbol,
        price,
        changePct,
        caption: price != null ? `${row.label} / USD` : '—',
      };
    });

    return NextResponse.json({ fx, crypto });
  } catch {
    return NextResponse.json({ fx: [], crypto: [], error: 'tickers_unavailable' });
  }
}
