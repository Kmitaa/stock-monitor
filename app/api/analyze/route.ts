import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import OpenAI from 'openai';
import YahooFinance from 'yahoo-finance2';
import { authOptions } from '@/lib/auth';
import { MARKETS, parseMarketParam, type MarketId } from '@/lib/markets';

const yahooFinance = new YahooFinance();

export const dynamic = 'force-dynamic';

type NewsItem = { title?: string; publisher?: string; date?: string | number | null };

export type ChartPriceSnapshot = {
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

type QuoteResult = Awaited<ReturnType<typeof yahooFinance.quote>>;

function snapshotFromQuote(q: QuoteResult): ChartPriceSnapshot | null {
  const state = q.marketState;
  let price = q.regularMarketPrice;
  let asOf: Date | undefined = q.regularMarketTime;
  let changePct: number | null = q.regularMarketChangePercent ?? null;

  if ((state === 'PRE' || state === 'PREPRE') && q.preMarketPrice != null) {
    price = q.preMarketPrice;
    asOf = q.preMarketTime ?? asOf;
    changePct = q.preMarketChangePercent ?? changePct;
  } else if ((state === 'POST' || state === 'POSTPOST') && q.postMarketPrice != null) {
    price = q.postMarketPrice;
    asOf = q.postMarketTime ?? asOf;
    changePct = q.postMarketChangePercent ?? changePct;
  }

  if (price == null || Number.isNaN(price)) return null;

  const currency = q.currency ?? 'USD';
  const delay = q.exchangeDataDelayedBy ?? 0;
  let priceNote: string;
  if (state === 'CLOSED') {
    priceNote =
      'Last price from the last regular session (market closed — no live ticks until the open).';
  } else if (state === 'REGULAR') {
    priceNote =
      delay > 0
        ? `Quote delayed ~${delay} min (Yahoo).`
        : 'Current or last regular-session print (Yahoo quote).';
  } else {
    priceNote = `Extended-hours or 24/7 price (state: ${state}).`;
  }

  return {
    lastPrice: price,
    currency,
    vsPreviousClosePct: changePct,
    asOfTime: (asOf ?? new Date()).toISOString(),
    symbol: q.symbol ?? '',
    marketState: state,
    exchangeDelayMinutes: delay,
    priceNote,
    source: 'yahoo_quote',
  };
}

async function fetchQuoteSnapshot(yahooSymbol: string): Promise<ChartPriceSnapshot | null> {
  try {
    const q = await yahooFinance.quote(yahooSymbol);
    return snapshotFromQuote(q);
  } catch {
    return null;
  }
}

async function snapshotFromChartMetaFallback(yahooSymbol: string): Promise<ChartPriceSnapshot | null> {
  try {
    const result = await yahooFinance.chart(yahooSymbol, {
      period1: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      interval: '1h',
    });
    const { meta, quotes } = result;
    if (!meta.regularMarketPrice || !quotes?.length) return null;
    const lastBar = quotes[quotes.length - 1];
    const prev = meta.chartPreviousClose ?? meta.previousClose;
    let vs: number | null = null;
    if (prev != null && prev > 0) {
      vs = ((meta.regularMarketPrice - prev) / prev) * 100;
    }
    return {
      lastPrice: meta.regularMarketPrice,
      currency: meta.currency,
      vsPreviousClosePct: vs,
      asOfTime: lastBar.date.toISOString(),
      symbol: meta.symbol,
      marketState: 'CHART_META',
      exchangeDelayMinutes: 0,
      priceNote:
        'No Yahoo quote — rough number from chart meta / last 1h bar time (not a live tick).',
      source: 'chart_meta_fallback',
    };
  } catch {
    return null;
  }
}

function summarizeChartForPrompt(
  yahooSymbol: string,
  meta: {
    symbol: string;
    currency: string;
    regularMarketPrice: number;
    chartPreviousClose?: number;
    previousClose?: number;
    regularMarketDayHigh?: number;
    regularMarketDayLow?: number;
  },
  quotes: Array<{ date: Date; open: number | null; high: number | null; low: number | null; close: number | null }>,
  quoteSnapshot: ChartPriceSnapshot | null
): string {
  const lines: string[] = [];
  const lastBar = quotes[quotes.length - 1];
  const prev = meta.chartPreviousClose ?? meta.previousClose;

  if (quoteSnapshot?.source === 'yahoo_quote') {
    lines.push(
      `=== QUOTE (Yahoo quote API, ${yahooSymbol}) — treat this as the “current” price vs headlines ===`
    );
    lines.push(
      `Price: ${quoteSnapshot.lastPrice} ${quoteSnapshot.currency}. Market state: ${quoteSnapshot.marketState}. Quote time: ${quoteSnapshot.asOfTime}.`
    );
    if (quoteSnapshot.vsPreviousClosePct != null) {
      lines.push(`Change % (Yahoo for this session/price): ~${quoteSnapshot.vsPreviousClosePct.toFixed(2)}%.`);
    }
    if (quoteSnapshot.exchangeDelayMinutes > 0) {
      lines.push(`Exchange delay (Yahoo): ~${quoteSnapshot.exchangeDelayMinutes} min.`);
    }
  } else if (quoteSnapshot?.source === 'chart_meta_fallback') {
    lines.push('=== QUOTE: chart fallback only (no quote) — treat as indicative ===');
    lines.push(
      `Meta price: ${quoteSnapshot.lastPrice} ${quoteSnapshot.currency}. Timestamp tied to last 1h bar: ${quoteSnapshot.asOfTime}.`
    );
  } else {
    lines.push('=== QUOTE: no quote — rough from chart meta ===');
    lines.push(`Chart meta regularMarketPrice: ${meta.regularMarketPrice} ${meta.currency}.`);
  }

  lines.push('');
  lines.push('=== 1h CANDLES (last bar = hour close, not a live tick) ===');
  if (prev != null && prev > 0) {
    const chgMeta = ((meta.regularMarketPrice - prev) / prev) * 100;
    lines.push(`Meta vs previous close: ~${chgMeta.toFixed(2)}%.`);
  }
  if (meta.regularMarketDayHigh != null && meta.regularMarketDayLow != null) {
    lines.push(`Day session from meta: high ${meta.regularMarketDayHigh}, low ${meta.regularMarketDayLow}.`);
  }
  if (quotes.length > 0) {
    const first = quotes[0];
    const c0 = first.close;
    const c1 = lastBar.close;
    if (c0 != null && c1 != null && c0 > 0) {
      const rangePct = ((c1 - c0) / c0) * 100;
      lines.push(
        `In this 1h window: first close ${c0}, last close ${c1} (~${rangePct.toFixed(2)}%).`
      );
    }
    lines.push(`Last 1h bar (bar CLOSE time): ${lastBar.date.toISOString()}.`);
  }
  return lines.join('\n');
}

async function fetchChartContext(
  yahooSymbol: string,
  quoteSnapshot: ChartPriceSnapshot | null
): Promise<string | null> {
  try {
    const result = await yahooFinance.chart(yahooSymbol, {
      period1: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      interval: '1h',
    });
    const { meta, quotes } = result;
    if (!quotes?.length) return null;
    return summarizeChartForPrompt(yahooSymbol, meta, quotes, quoteSnapshot);
  } catch {
    return null;
  }
}

function formatNewsForPrompt(items: NewsItem[], assetHint: string): string {
  if (!items.length) {
    return `(No headlines — lean on chart data and general context: ${assetHint}.)`;
  }
  const sorted = [...items].filter((n) => n.title).sort((a, b) => {
    const ta = typeof a.date === 'number' ? (a.date < 1e12 ? a.date * 1000 : a.date) : new Date(a.date as string).getTime() || 0;
    const tb = typeof b.date === 'number' ? (b.date < 1e12 ? b.date * 1000 : b.date) : new Date(b.date as string).getTime() || 0;
    return tb - ta;
  });
  return sorted
    .slice(0, 15)
    .map((n, i) => {
      const bits = [n.title];
      if (n.publisher) bits.push(`(${n.publisher})`);
      if (n.date != null) bits.push(`— ${String(n.date)}`);
      return `${i + 1}. ${bits.join(' ')}`;
    })
    .join('\n');
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY is not set on the server.' }, { status: 503 });
  }

  let news: NewsItem[] = [];
  let market: MarketId = 'gold';
  try {
    const body = await request.json();
    if (Array.isArray(body?.news)) news = body.news;
    market = parseMarketParam(body?.market);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const cfg = MARKETS[market];
  const yahooSymbol = cfg.yahooSymbol;

  const openai = new OpenAI({ apiKey });

  const quoteSnapshot =
    (await fetchQuoteSnapshot(yahooSymbol)) ?? (await snapshotFromChartMetaFallback(yahooSymbol));
  const chartBlock =
    (await fetchChartContext(yahooSymbol, quoteSnapshot)) ??
    '(Yahoo chart data unavailable — stick to headlines and any quote you have.)';
  const newsBlock = formatNewsForPrompt(news, cfg.aiContext);

  const userContent = `## Asset
${cfg.aiContext}
Yahoo symbol for numbers: ${yahooSymbol}.

## Headlines (newest first, Yahoo / app)
${newsBlock}

## Chart summary (Yahoo Finance, ${yahooSymbol}, ~5d window, 1h bars)
${chartBlock}

From the above, write an analysis that **first** covers global/macro context, **then** ties it to this instrument.

Requirements (order matters):
1) **Global context (2–4 sentences):** What threads from the world (geopolitics, macro policy, rates, inflation, risk, sentiment, key regions) **show up in the headlines** or typically matter for this asset? Give a concise “world picture” without inventing facts beyond the headlines and data — if headlines are thin, say so honestly and lean on general market context for ${cfg.shortLabel}.

2) **Market & chart:** Could any of these threads **plausibly explain** the current price move or tension on the chart (multi-day window, 1h candles, % change from the quote)? Note **alignment or mismatch** between headline narrative and price; consider delay, noise, session effects (e.g. closed markets), or other factors.

3) **Quote:** One sentence with the **concrete price from the “QUOTE (Yahoo quote API)” section** (do not confuse with the last 1h candle close) and what the Yahoo % change implies, if present.

4) **Wrap-up:** One–two sentences: main takeaway linking **global conditions** to what you see on the chart/quote; no trade calls.

Write in **English**, ~**9–14 sentences** (room for global context). No investment advice or buy/sell instructions. Do not claim causality where data doesn’t support it — use probability language (“may”, “could”, “often”).`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            `You are a macro and markets analyst. Context: ${cfg.aiContext}. ` +
            `Priority: **describe the current global picture** (from headlines and how it typically affects this segment), then **assess whether and how** those threads tie to price and chart behavior. ` +
            `Treat the **only** “current” price as the Yahoo quote API section — never the last 1h candle close. ` +
            `Connect headline facts with chart observations; don’t invent events. Write in English. No investment advice or buy/sell recommendations.`,
        },
        { role: 'user', content: userContent },
      ],
    });

    const analysis = response.choices[0]?.message?.content?.trim();
    if (!analysis) {
      return NextResponse.json({ error: 'Empty model response.' }, { status: 502 });
    }

    return NextResponse.json({
      analysis,
      snapshot: quoteSnapshot,
      market,
    });
  } catch {
    return NextResponse.json(
      { error: 'Could not reach OpenAI or parse the response.' },
      { status: 500 }
    );
  }
}
