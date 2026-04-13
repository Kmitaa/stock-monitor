import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';
import { MARKETS, parseMarketParam, type MarketId } from '@/lib/markets';

const yahooFinance = new YahooFinance();

export const dynamic = 'force-dynamic';

function newsTimeMs(d: Date | string | number | undefined): number {
  if (d == null) return 0;
  if (typeof d === 'number') return d < 1e12 ? d * 1000 : d;
  return new Date(d).getTime() || 0;
}

function mockNewsForMarket(market: MarketId) {
  if (market === 'btc' || market === 'eth') {
    return [
      {
        title: `${MARKETS[market].shortLabel} holds key level as flows stabilize`,
        publisher: 'CoinDesk',
        link: '#',
        date: Math.floor(Date.now() / 1000),
      },
      {
        title: `Institutional demand for ${MARKETS[market].shortLabel} picks up after macro data`,
        publisher: 'Bloomberg Crypto',
        link: '#',
        date: Math.floor(Date.now() / 1000) - 3600,
      },
    ];
  }
  return [
    {
      title: `${MARKETS[market].shortLabel} stabilizes amid inflation concerns`,
      publisher: 'Financial Times',
      link: '#',
      date: Math.floor(Date.now() / 1000),
    },
    {
      title: `Macro sentiment shifts around ${MARKETS[market].shortLabel}`,
      publisher: 'Reuters',
      link: '#',
      date: Math.floor(Date.now() / 1000) - 3600,
    },
  ];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const market = parseMarketParam(searchParams.get('market'));
  const symbol = MARKETS[market].yahooSymbol;

  try {
    const result = await yahooFinance.search(symbol);

    const cleanNews = (result.news || [])
      .map((n) => ({
        title: n.title,
        publisher: n.publisher,
        link: n.link,
        date: n.providerPublishTime,
      }))
      .filter((n) => n.title && n.link)
      .sort((a, b) => newsTimeMs(b.date) - newsTimeMs(a.date));

    if (cleanNews.length === 0) throw new Error('empty');

    return NextResponse.json({ news: cleanNews, market });
  } catch {
    console.error('Yahoo failed, using mock news');
    const mockSorted = [...mockNewsForMarket(market)].sort((a, b) => newsTimeMs(b.date) - newsTimeMs(a.date));
    return NextResponse.json({ news: mockSorted, note: 'Mock data (Yahoo limit)', market });
  }
}
 