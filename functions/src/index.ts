import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import * as https from 'https';

admin.initializeApp();
const db = admin.firestore();

const httpsGet = (url: string, headers: Record<string, string> = {}): Promise<any> => {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0', ...headers } }, (res) => {
      let data = '';
      res.on('data', (chunk: string) => data += chunk);
      res.on('end', () => {
        try { resolve({ body: JSON.parse(data), headers: res.headers }); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
};

const getYahooCrumb = (): Promise<{ crumb: string; cookie: string }> => {
  return new Promise((resolve, reject) => {
    https.get('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      }
    }, (res) => {
      let data = '';
      const cookie = res.headers['set-cookie']?.join(';') ?? '';
      res.on('data', (chunk: string) => data += chunk);
      res.on('end', () => resolve({ crumb: data.trim(), cookie }));
    }).on('error', reject);
  });
};

const getExpiryTimestamp = (expiry: string): number =>
  Math.floor(new Date(expiry).getTime() / 1000);

type PriceResult =
  | { currentValue: number; price: number; lastPrice: number; bid: number; ask: number; error?: never }
  | { currentValue: null; error: string };

const fetchOptionPrice = async (ticker: string, optionType: string, strike: number, expiry: string): Promise<PriceResult> => {
  const { crumb, cookie } = await getYahooCrumb();
  const url = `https://query1.finance.yahoo.com/v7/finance/options/${ticker}?date=${getExpiryTimestamp(expiry)}&crumb=${encodeURIComponent(crumb)}`;
  const { body: json } = await httpsGet(url, { 'Cookie': cookie });
  console.log('Yahoo response:', JSON.stringify(json).slice(0, 200));
  const contracts = optionType === 'CALL'
    ? json?.optionChain?.result?.[0]?.options?.[0]?.calls
    : json?.optionChain?.result?.[0]?.options?.[0]?.puts;
  console.log('Contracts found:', contracts?.length ?? 'none');

  if (!contracts) {
    console.error(`No contracts found for ${ticker} ${optionType} expiry ${expiry}`);
    return { currentValue: null, error: `No contracts found for ${ticker} ${optionType} expiry ${expiry}` };
  }

  const match = contracts.find((c: any) => Math.abs(c.strike - strike) < 0.01);
  console.log('Strike', strike, 'match:', match ? `found at ${match.strike}, lastPrice: ${match.lastPrice}` : 'NOT FOUND');

  if (!match) {
    console.error(`No contract found for strike ${strike} on ${ticker}`);
    return { currentValue: null, error: `No contract found for strike ${strike} on ${ticker}` };
  }

  const lastPrice: number = match.lastPrice ?? 0;
  const bid: number = match.bid ?? 0;
  const price = Math.max(lastPrice, bid);
  return {
    lastPrice,
    bid,
    ask: match.ask ?? 0,
    price,
    currentValue: price * 100  // per-contract value
  };
};

const fetchStockPrice = async (ticker: string): Promise<number | null> => {
  const { crumb, cookie } = await getYahooCrumb();
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d&crumb=${encodeURIComponent(crumb)}`;
  const { body: json } = await httpsGet(url, { 'Cookie': cookie });
  return json?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
};

export const getOptionPrice = functions.https.onCall(async (data) => {
  const { ticker, optionType, strike, expiry } = data;
  console.log('Received:', { ticker, optionType, strike, expiry })
  try {
    return await fetchOptionPrice(ticker, optionType, strike, expiry);
  } catch (error: any) {
    console.error('getOptionPrice unexpected error:', error.message);
    return { currentValue: null, error: error.message };
  }
});

export const dailySnapshot = functions.pubsub
  .schedule('30 16 * * 1-5')
  .timeZone('America/New_York')
  .onRun(async () => {
    try {
      // Load all positions and lots in parallel
      const [posSnap, lotsSnap] = await Promise.all([
        db.collection('positions').get(),
        db.collection('lots').get()
      ]);

      const positions = posSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      const lots = lotsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

      // Group lots by positionId
      const lotsByPosition: { [positionId: string]: any[] } = {};
      for (const lot of lots) {
        if (!lotsByPosition[lot.positionId]) lotsByPosition[lot.positionId] = [];
        lotsByPosition[lot.positionId].push(lot);
      }

      const openPositions = positions.filter(p => p.isOpen);

      // Refresh prices for open positions; store per-contract value
      for (const position of openPositions) {
        try {
          const result = await fetchOptionPrice(position.ticker, position.optionType, position.strike, position.expiry);
          if (result.currentValue != null) {
            const price = Math.max(result.lastPrice ?? 0, result.bid ?? 0);
            await db.collection('positions').doc(position.id).update({
              lastPrice: result.lastPrice,
              bid: result.bid,
              ask: result.ask,
              price,
              currentValue: price * 100,
              lastPriceDate: new Date().toISOString().split('T')[0]
            });
            position.currentValue = price * 100;
          } else {
            console.error(`dailySnapshot: skipping price update for ${position.ticker} — ${result.error}`);
          }
        } catch (err: any) {
          console.error(`dailySnapshot: unexpected error for ${position.ticker}:`, err.message);
        }
      }

      // Compute unrealized P&L from open positions using lot-derived open contract counts
      let totalCostBasis = 0;
      let totalValue = 0;
      for (const position of openPositions) {
        const openLots = (lotsByPosition[position.id] ?? []).filter((l: any) => l.isOpen);
        const openContracts = openLots.reduce((sum: number, l: any) => sum + l.contracts, 0);
        const costBasis = openLots.reduce((sum: number, l: any) => sum + l.costBasis, 0);
        const value = position.currentValue != null
          ? position.currentValue * openContracts
          : costBasis;
        totalCostBasis += costBasis;
        totalValue += value;
      }
      const unrealizedPnl = totalValue - totalCostBasis;
      const unrealizedPct = totalCostBasis === 0 ? 0 : (unrealizedPnl / totalCostBasis) * 100;

      // Realized P&L from closed lots across all positions
      const allClosedLots = lots.filter((l: any) => !l.isOpen);
      const realizedPnl = allClosedLots.reduce((sum: number, l: any) => sum + (l.realizedPnl ?? 0), 0);
      const totalClosedCost = allClosedLots.reduce((sum: number, l: any) => sum + l.costBasis, 0);
      const realizedPct = totalClosedCost === 0 ? 0 : (realizedPnl / totalClosedCost) * 100;

      const totalPnl = unrealizedPnl + realizedPnl;
      const totalBasis = totalCostBasis + totalClosedCost;
      const totalPct = totalBasis === 0 ? 0 : (totalPnl / totalBasis) * 100;

      // Per-account breakdown
      const accountSet = new Set(positions.map((p: any) => p.account));
      const byAccount: any = {};
      for (const account of accountSet) {
        const accountOpenPositions = openPositions.filter((p: any) => p.account === account);
        let aCostBasis = 0, aValue = 0;
        for (const position of accountOpenPositions) {
          const openLots = (lotsByPosition[position.id] ?? []).filter((l: any) => l.isOpen);
          const openContracts = openLots.reduce((sum: number, l: any) => sum + l.contracts, 0);
          const costBasis = openLots.reduce((sum: number, l: any) => sum + l.costBasis, 0);
          aCostBasis += costBasis;
          aValue += position.currentValue != null ? position.currentValue * openContracts : costBasis;
        }
        const aUnrealized = aValue - aCostBasis;

        const accountClosedLots = allClosedLots.filter((l: any) => {
          const pos = positions.find((p: any) => p.id === l.positionId);
          return pos?.account === account;
        });
        const aRealized = accountClosedLots.reduce((sum: number, l: any) => sum + (l.realizedPnl ?? 0), 0);
        const aClosedCost = accountClosedLots.reduce((sum: number, l: any) => sum + l.costBasis, 0);
        const aTotalPnl = aUnrealized + aRealized;
        const aTotalBasis = aCostBasis + aClosedCost;

        byAccount[account as string] = {
          costBasis: aCostBasis,
          value: aValue,
          unrealizedPnl: aUnrealized,
          realizedPnl: aRealized,
          totalPnl: aTotalPnl,
          totalPct: aTotalBasis === 0 ? 0 : (aTotalPnl / aTotalBasis) * 100
        };
      }

    const [qqqPrice, spyPrice] = await Promise.all([
      fetchStockPrice('QQQ'),
      fetchStockPrice('SPY')
    ]);

    await db.collection('snapshots').add({
      date: new Date().toISOString().split('T')[0],
      totalCostBasis,
      totalValue,
      unrealizedPnl,
      unrealizedPct,
      realizedPnl,
      realizedPct,
      totalPnl,
      totalPct,
      qqqPrice,
      spyPrice,
      byAccount
    });

      console.log('Daily snapshot saved successfully');
    } catch (error) {
      console.error('Error saving daily snapshot:', error);
    }
  });
