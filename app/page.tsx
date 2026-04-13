'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { MARKETS, type MarketId } from '@/lib/markets';
import { formatCryptoUsd } from '@/lib/format-currency-tickers';

declare global {
  interface Window {
    TradingView?: { widget: new (opts: Record<string, unknown>) => unknown };
  }
}

type ChartSnapshot = {
  lastPrice: number;
  currency: string;
  vsPreviousClosePct: number | null;
  asOfTime: string;
  symbol: string;
  marketState: string;
  exchangeDelayMinutes: number;
  priceNote: string;
  source: 'yahoo_quote' | 'chart_meta_fallback';
};

function newsTimeMs(d: unknown): number {
  if (d == null) return 0;
  if (typeof d === 'number') return d < 1e12 ? d * 1000 : d;
  if (typeof d === 'string') return new Date(d).getTime() || 0;
  return 0;
}

function formatNewsDate(value: unknown): string | null {
  if (value == null) return null;
  let d: Date;
  if (typeof value === 'number') {
    d = new Date(value < 1e12 ? value * 1000 : value);
  } else if (typeof value === 'string') {
    d = new Date(value);
  } else {
    return null;
  }
  if (Number.isNaN(d.getTime())) return null;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const HH = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}:${mm}:${yyyy} · ${HH}:${min}`;
}

type TickerRow = {
  label: string;
  symbol: string;
  price: number | null;
  changePct: number | null;
  caption: string;
};

type NewsHeadline = { title?: string; publisher?: string; date?: string | number | null };

function analysisBlocks(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function renderInlineBold(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={idx} className="font-semibold text-gray-100">{part.slice(2, -2)}</strong>;
    }
    return <span key={idx}>{part}</span>;
  });
}

export default function MarketTerminal() {
  const { data: session, status: sessionStatus } = useSession();
  const isLoggedIn = sessionStatus === 'authenticated';

  const [market, setMarket] = useState<MarketId>('gold');
  const [tvReady, setTvReady] = useState(false);
  const [news, setNews] = useState<NewsHeadline[]>([]);
  const [marketAnalysis, setMarketAnalysis] = useState<string | null>(null);
  const [priceSnapshot, setPriceSnapshot] = useState<ChartSnapshot | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [newsHydrated, setNewsHydrated] = useState(false);
  const [fxTickers, setFxTickers] = useState<TickerRow[]>([]);
  const [cryptoTickers, setCryptoTickers] = useState<TickerRow[]>([]);
  const [tickersReady, setTickersReady] = useState(false);
  const tvWidgetsInit = useRef(false);

  const cfg = MARKETS[market];
  const isCrypto = market === 'btc' || market === 'eth';

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = () => setTvReady(true);
    document.head.appendChild(script);
    return () => {
      script.remove();
    };
  }, []);

  // Mount all TradingView iframes once; switching only toggles visibility.
  useEffect(() => {
    if (!tvReady || !window.TradingView || tvWidgetsInit.current) return;

    const mount = (containerId: string, symbol: string) => {
      const el = document.getElementById(containerId);
      if (!el) return;
      el.innerHTML = '';
      new window.TradingView!.widget({
        container_id: containerId,
        width: '100%',
        height: 500,
        symbol,
        interval: '5',
        timezone: 'Etc/UTC',
        theme: 'dark',
        style: '1',
        locale: 'en',
        backgroundColor: '#050505',
        gridColor: '#161b22',
      });
    };

    Object.values(MARKETS).forEach((m) => mount(`tv_chart_container_${m.id}`, m.tradingViewSymbol));
    tvWidgetsInit.current = true;

    return () => {
      tvWidgetsInit.current = false;
      Object.values(MARKETS).forEach((m) => {
        document.getElementById(`tv_chart_container_${m.id}`)?.replaceChildren();
      });
    };
  }, [tvReady]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/market-tickers', { cache: 'no-store' });
        const data = await res.json();
        if (cancelled) return;
        if (Array.isArray(data.fx)) setFxTickers(data.fx);
        if (Array.isArray(data.crypto)) setCryptoTickers(data.crypto);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setTickersReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setNewsHydrated(false);
      setNews([]);
      try {
        const res = await fetch(`/api/news?market=${market}`, { cache: 'no-store' });
        const data = await res.json();
        if (cancelled) return;
        if (data.news) {
          const sorted = [...data.news].sort(
            (a: NewsHeadline, b: NewsHeadline) => newsTimeMs(b.date) - newsTimeMs(a.date)
          );
          setNews(sorted);
        }
      } catch {
        console.error('Failed to fetch news');
      } finally {
        if (!cancelled) setNewsHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [market]);

  useEffect(() => {
    if (sessionStatus === 'loading') return;
    if (sessionStatus !== 'authenticated') {
      setAnalysisLoading(false);
      setAnalysisError(null);
      setMarketAnalysis(null);
      setPriceSnapshot(null);
      return;
    }
    if (!newsHydrated) return;
    let cancelled = false;
    (async () => {
      setAnalysisLoading(true);
      setAnalysisError(null);
      setMarketAnalysis(null);
      setPriceSnapshot(null);
      try {
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          credentials: 'same-origin',
          body: JSON.stringify({ news, market }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setAnalysisError(typeof data.error === 'string' ? data.error : 'AI analysis failed.');
          return;
        }
        if (typeof data.analysis === 'string') setMarketAnalysis(data.analysis);
        else setAnalysisError('Unexpected response shape.');
        if (
          data.snapshot &&
          typeof data.snapshot.lastPrice === 'number' &&
          typeof data.snapshot.asOfTime === 'string' &&
          (data.snapshot.source === 'yahoo_quote' || data.snapshot.source === 'chart_meta_fallback')
        ) {
          setPriceSnapshot(data.snapshot as ChartSnapshot);
        }
      } catch {
        if (!cancelled) setAnalysisError('Could not reach the analysis API.');
      } finally {
        if (!cancelled) setAnalysisLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [news, newsHydrated, market, sessionStatus]);

  const asideClass =
    'w-full sm:max-w-md sm:mx-auto lg:mx-0 lg:w-56 shrink-0 bg-gray-900/20 border border-gray-800 p-4 rounded-2xl flex flex-col lg:sticky lg:top-6 lg:max-h-[calc(100vh-2rem)] text-left';

  return (
    <main className="min-h-screen w-full bg-transparent text-white px-4 py-6 sm:px-6 lg:px-8 font-sans box-border">
      <div className="w-full flex flex-col lg:flex-row gap-4 lg:gap-6 items-start">
        <div className="order-1 lg:order-2 flex-1 min-w-0 w-full flex justify-center">
          <div className="w-full max-w-6xl mx-auto space-y-6 sm:space-y-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1
              className={`text-4xl font-black italic tracking-tighter uppercase ${
                isCrypto ? 'text-amber-500' : 'text-emerald-500'
              }`}
            >
              {cfg.shortLabel} Terminal
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`w-2 h-2 rounded-full animate-ping ${isCrypto ? 'bg-amber-500' : 'bg-emerald-500'}`}
              />
              <p className="text-[10px] font-mono text-gray-400 uppercase tracking-widest text-left">
                Live TradingView · {cfg.shortLabel}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-stretch sm:items-end gap-3">
            <div
              className="inline-flex flex-wrap justify-end rounded-2xl p-1 bg-gray-900 border border-gray-800 gap-1"
              role="group"
              aria-label="Select market"
            >
              {Object.values(MARKETS).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMarket(m.id)}
                  className={`px-3 py-2 rounded-full text-[10px] font-bold uppercase tracking-wide transition-all ${
                    market === m.id
                      ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {m.shortLabel}
                </button>
              ))}
            </div>
            <div className="flex flex-col items-end gap-1">
              {isLoggedIn && session?.user?.email ? (
                <p className="text-[9px] font-mono text-gray-500 max-w-[14rem] truncate text-right">{session.user.email}</p>
              ) : null}
              {isLoggedIn ? (
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: '/' })}
                  className="bg-white text-black px-6 py-2 rounded-full font-bold hover:bg-gray-200 transition-all text-xs uppercase"
                >
                  Sign out
                </button>
              ) : (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Link
                    href="/login"
                    className="bg-white text-black px-6 py-2 rounded-full font-bold hover:bg-gray-200 transition-all text-xs uppercase"
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/register"
                    className="border border-gray-600 text-gray-300 px-5 py-2 rounded-full font-bold hover:border-gray-400 transition-all text-xs uppercase"
                  >
                    Register
                  </Link>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="bg-[#050505] border border-gray-800 rounded-2xl overflow-hidden shadow-2xl w-full">
          <div className="relative h-[320px] lg:h-[500px] w-full">
            {Object.values(MARKETS).map((m) => (
              <div
                key={m.id}
                id={`tv_chart_container_${m.id}`}
                className={`absolute inset-0 min-h-0 ${
                  market === m.id ? 'z-10 opacity-100' : 'z-0 opacity-0 pointer-events-none'
                }`}
                aria-hidden={market !== m.id}
              />
            ))}
          </div>
        </div>

        <section
          className={`rounded-2xl p-6 md:p-8 text-left shadow-lg border ${
            isCrypto
              ? 'bg-amber-500/5 border-amber-500/20'
              : 'bg-emerald-500/5 border-emerald-500/20'
          }`}
        >
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl" aria-hidden>
              🤖
            </span>
            <div>
              <h2
                className={`font-bold uppercase text-sm tracking-widest ${
                  isCrypto ? 'text-amber-400' : 'text-emerald-400'
                }`}
              >
                AI analysis: headlines vs chart
              </h2>
              <p className="text-[10px] text-gray-500 mt-0.5 font-mono uppercase tracking-wider">
                {cfg.yahooSymbol} · Yahoo + OpenAI
                {sessionStatus !== 'authenticated' ? ' · sign in required' : ''}
              </p>
            </div>
          </div>

          {isLoggedIn && priceSnapshot ? (
            <div
              className={`mb-6 rounded-xl bg-black/50 border px-3 py-3 ${
                isCrypto ? 'border-amber-500/25' : 'border-emerald-500/25'
              }`}
            >
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">
                {priceSnapshot.source === 'yahoo_quote'
                  ? 'Current / last printed price (Yahoo quote)'
                  : 'Indicative price (chart fallback — not a live tick)'}
              </p>
              <p
                className={`text-lg font-mono font-semibold tabular-nums ${
                  isCrypto ? 'text-amber-400' : 'text-emerald-400'
                }`}
              >
                {priceSnapshot.lastPrice}{' '}
                <span className="text-sm text-gray-400">{priceSnapshot.currency}</span>
              </p>
              {priceSnapshot.vsPreviousClosePct != null ? (
                <p className="text-[11px] text-gray-400 mt-1 tabular-nums">
                  Change % (Yahoo, this price/session):{' '}
                  <span
                    className={
                      priceSnapshot.vsPreviousClosePct >= 0
                        ? isCrypto
                          ? 'text-amber-500/90'
                          : 'text-emerald-500/90'
                        : 'text-rose-400/90'
                    }
                  >
                    {priceSnapshot.vsPreviousClosePct >= 0 ? '+' : ''}
                    {priceSnapshot.vsPreviousClosePct.toFixed(2)}%
                  </span>
                </p>
              ) : null}
              <p className="text-[10px] text-gray-500 mt-2 leading-snug">{priceSnapshot.priceNote}</p>
              <p className="text-[9px] text-gray-600 mt-1.5 font-mono">
                {priceSnapshot.symbol} · state: {priceSnapshot.marketState}
                {priceSnapshot.exchangeDelayMinutes > 0
                  ? ` · delay ~${priceSnapshot.exchangeDelayMinutes} min`
                  : ''}
                <br />
                quote time: {new Date(priceSnapshot.asOfTime).toLocaleString('en-US')}
              </p>
            </div>
          ) : null}

          {sessionStatus === 'loading' ? (
            <p className="text-gray-600 text-sm italic">Checking session…</p>
          ) : !isLoggedIn ? (
            <p className="text-gray-500 text-sm leading-relaxed border-l-2 border-gray-700 pl-4">
              AI analysis and the comparison quote are available after{' '}
              <Link href="/login" className="text-emerald-500/90 font-semibold hover:underline">
                signing in
              </Link>{' '}
              with a verified email — only then the app calls the analysis API.
            </p>
          ) : !newsHydrated ? (
            <p className="text-gray-600 text-sm italic">Loading headlines before analysis…</p>
          ) : analysisLoading ? (
            <p className="text-gray-500 text-sm italic">Generating comparison (latest headlines + quote)…</p>
          ) : analysisError ? (
            <p className="text-amber-500/90 text-sm border-l-2 border-amber-500/50 pl-4">{analysisError}</p>
          ) : marketAnalysis ? (
            <div
              className={`rounded-2xl border p-4 md:p-5 bg-black/35 ${
                isCrypto ? 'border-amber-500/30' : 'border-emerald-500/30'
              }`}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">AI market summary</p>
                <span
                  className={`h-2 w-2 rounded-full ${isCrypto ? 'bg-amber-400/80' : 'bg-emerald-400/80'}`}
                  aria-hidden
                />
              </div>
              <div className="space-y-2.5">
                {analysisBlocks(marketAnalysis).map((block, idx) => (
                  <p key={idx} className="text-[13px] md:text-sm text-gray-200 leading-6">
                    {renderInlineBold(block)}
                  </p>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-gray-600 text-sm italic">Waiting for data…</p>
          )}

          <p className="text-[9px] text-gray-600 mt-4 uppercase tracking-widest">
            Chart: {cfg.tradingViewSymbol} · Analysis data: Yahoo {cfg.yahooSymbol}
          </p>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
          <div
            className={`md:col-span-1 bg-gray-900/20 border p-6 rounded-2xl ${
              isCrypto ? 'border-amber-500/20' : 'border-gray-800'
            }`}
          >
            <h3 className="text-gray-500 font-bold mb-4 uppercase text-[10px] tracking-[0.2em] border-b border-gray-800 pb-2">
              Headlines ({cfg.shortLabel}, Yahoo — newest first)
            </h3>
            <div className="space-y-4">
              {news.length > 0 ? (
                news.map((item, i) => {
                  const when = formatNewsDate(item.date);
                  return (
                    <div
                      key={i}
                      className={`group border-l pl-3 ${
                        isCrypto ? 'border-amber-500/30' : 'border-emerald-500/30'
                      }`}
                    >
                      <p
                        className={`text-xs font-semibold transition-colors line-clamp-2 ${
                          isCrypto ? 'group-hover:text-amber-400' : 'group-hover:text-emerald-400'
                        }`}
                      >
                        {item.title}
                      </p>
                      <p className="text-[9px] text-gray-600 mt-1 uppercase">{item.publisher}</p>
                      {when ? (
                        <p className="text-[9px] font-mono text-gray-500 mt-1 tabular-nums">{when}</p>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <p className="text-gray-700 text-xs italic">Loading…</p>
              )}
            </div>
          </div>

          <div className="md:col-span-2 bg-gray-900/30 border border-gray-800 p-8 rounded-2xl h-full">
            <h3 className="text-gray-500 font-bold mb-2 uppercase text-[10px] tracking-[0.2em]">Disclaimer</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              This combines Yahoo headlines ({cfg.yahooSymbol}) with Yahoo quote and candle data. Not investment advice.
              {isLoggedIn ? (
                <> Signed in as {session?.user?.email ?? 'user'}.</>
              ) : (
                <>
                  {' '}
                  <Link
                    href="/login"
                    className={`font-semibold hover:underline ${isCrypto ? 'text-amber-500' : 'text-emerald-500'}`}
                  >
                    Sign in
                  </Link>{' '}
                  or{' '}
                  <Link
                    href="/register"
                    className={`font-semibold hover:underline ${isCrypto ? 'text-amber-500' : 'text-emerald-500'}`}
                  >
                    create an account
                  </Link>
                  .
                </>
              )}
            </p>
          </div>
        </div>
            </div>
          </div>

        <aside className={`order-2 lg:order-1 ${asideClass}`}>
          <div className="shrink-0 mb-3 border-b border-gray-800 pb-3">
            <h3 className="text-lg font-black italic tracking-tighter uppercase text-sky-400">FX Terminal</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-2 h-2 rounded-full animate-ping bg-sky-500" aria-hidden />
              <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest text-left">
                Live Yahoo · FX vs USD
              </p>
            </div>
          </div>
          <div className="space-y-0 overflow-y-auto flex-1 min-h-0">
            {!tickersReady ? (
              <p className="text-gray-600 text-xs italic py-2">Loading rates…</p>
            ) : fxTickers.length > 0 ? (
              fxTickers.map((row) => (
                <div
                  key={row.symbol}
                  className="flex justify-between items-start gap-2 py-2.5 border-b border-gray-800/70 last:border-0"
                >
                  <span className="text-[10px] font-black text-sky-300/95 uppercase tracking-wide w-9 shrink-0 pt-0.5">
                    {row.label}
                  </span>
                  <div className="flex-1 min-w-0 text-right">
                    <p className="text-[11px] font-mono text-sky-100/95 tabular-nums leading-snug break-words">
                      {row.caption}
                    </p>
                  </div>
                  {row.changePct != null ? (
                    <span
                      className={`shrink-0 text-[10px] font-mono tabular-nums w-[3.25rem] text-right pt-0.5 ${
                        row.changePct >= 0 ? 'text-emerald-400/90' : 'text-rose-400/90'
                      }`}
                    >
                      {row.changePct >= 0 ? '+' : ''}
                      {row.changePct.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                      %
                    </span>
                  ) : (
                    <span className="text-[10px] text-gray-600 font-mono w-[3.25rem] text-right shrink-0">—</span>
                  )}
                </div>
              ))
            ) : (
              <p className="text-gray-600 text-xs italic py-2">No FX data.</p>
            )}
          </div>
        </aside>

        <aside className={`order-3 lg:order-3 ${asideClass}`}>
          <div className="shrink-0 mb-3 border-b border-gray-800 pb-3">
            <h3 className="text-lg font-black italic tracking-tighter uppercase text-violet-400">Crypto Terminal</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-2 h-2 rounded-full animate-ping bg-violet-500" aria-hidden />
              <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest text-left">
                Live Yahoo · vs USD
              </p>
            </div>
          </div>
          <div className="space-y-0 overflow-y-auto flex-1 min-h-0">
            {!tickersReady ? (
              <p className="text-gray-600 text-xs italic py-2">Loading rates…</p>
            ) : cryptoTickers.length > 0 ? (
              cryptoTickers.map((row) => (
                <div
                  key={row.symbol}
                  className="flex justify-between items-center gap-2 py-2.5 border-b border-gray-800/70 last:border-0"
                >
                  <span className="text-[10px] font-black text-violet-300/95 uppercase tracking-wide w-9 shrink-0">
                    {row.label}
                  </span>
                  <div className="flex-1 text-right min-w-0">
                    <p className="text-[11px] font-mono text-violet-50/95 tabular-nums leading-tight">
                      {row.price != null ? `${formatCryptoUsd(row.price)} USD` : '—'}
                    </p>
                  </div>
                  {row.changePct != null ? (
                    <span
                      className={`shrink-0 text-[10px] font-mono tabular-nums w-[3.25rem] text-right ${
                        row.changePct >= 0 ? 'text-emerald-400/90' : 'text-rose-400/90'
                      }`}
                    >
                      {row.changePct >= 0 ? '+' : ''}
                      {row.changePct.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                      %
                    </span>
                  ) : (
                    <span className="text-[10px] text-gray-600 font-mono w-[3.25rem] text-right shrink-0">—</span>
                  )}
                </div>
              ))
            ) : (
              <p className="text-gray-600 text-xs italic py-2">No crypto data.</p>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
