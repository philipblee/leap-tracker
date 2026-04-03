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

const getExpiryTimestamp = (expiry: string): number => {
  return Math.floor(new Date(expiry).getTime() / 1000);
};

const fetchOptionPrice = async (ticker: string, optionType: string, strike: number, expiry: string) => {
  const { crumb, cookie } = await getYahooCrumb();
  console.log('Crumb:', crumb, 'Cookie length:', cookie.length);

  const url = `https://query1.finance.yahoo.com/v7/finance/options/${ticker}?date=${getExpiryTimestamp(expiry)}&crumb=${encodeURIComponent(crumb)}`;
  const { body: json } = await httpsGet(url, { 'Cookie': cookie });
  console.log('Raw response:', JSON.stringify(json).slice(0, 300));

  const contracts = optionType === 'CALL'
    ? json?.optionChain?.result?.[0]?.options?.[0]?.calls
    : json?.optionChain?.result?.[0]?.options?.[0]?.puts;

  if (!contracts) throw new Error('No contracts found');
  const match = contracts.find((c: any) => Math.abs(c.strike - strike) < 0.01);
  if (!match) throw new Error(`No match found for strike ${strike}`);

  return {
    bid: match.bid,
    ask: match.ask,
    lastPrice: match.lastPrice,
    currentValue: match.lastPrice * 100
  };
};

export const getOptionPrice = functions.https.onCall(async (data) => {
  const { ticker, optionType, strike, expiry } = data;
  try {
    return await fetchOptionPrice(ticker, optionType, strike, expiry);
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

export const dailySnapshot = functions.pubsub
  .schedule('30 16 * * 1-5')
  .timeZone('America/New_York')
  .onRun(async () => {
    try {
      const openSnapshot = await db.collection('positions').where('isOpen', '==', true).get();
      const openPositions = openSnapshot.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

      const closedSnapshot = await db.collection('positions').where('isOpen', '==', false).get();
      const closedPositions = closedSnapshot.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

      const currentValues: { [id: string]: number } = {};

      for (const position of openPositions) {
        try {
          const result = await fetchOptionPrice(position.ticker, position.optionType, position.strike, position.expiry);
          currentValues[position.id] = result.currentValue * position.contracts;
        } catch {
          currentValues[position.id] = position.costBasis;
        }
      }

      const totalCostBasis = openPositions.reduce((sum: number, p: any) => sum + p.costBasis, 0);
      const totalValue = openPositions.reduce((sum: number, p: any) => sum + (currentValues[p.id] ?? p.costBasis), 0);
      const unrealizedPnl = totalValue - totalCostBasis;
      const unrealizedPct = totalCostBasis === 0 ? 0 : (unrealizedPnl / totalCostBasis) * 100;

      const realizedPnl = closedPositions.reduce((sum: number, p: any) => {
        if (!p.sellPrice || !p.costBasis) return sum;
        const costPerContract = p.costBasis / p.contracts;
        const contractsSold = p.contractsSold ?? p.contracts;
        return sum + (p.sellPrice - (costPerContract * contractsSold));
      }, 0);

      const totalClosedCost = closedPositions.reduce((sum: number, p: any) => {
        const costPerContract = p.costBasis / p.contracts;
        const contractsSold = p.contractsSold ?? p.contracts;
        return sum + (costPerContract * contractsSold);
      }, 0);
      const realizedPct = totalClosedCost === 0 ? 0 : (realizedPnl / totalClosedCost) * 100;

      const totalPnl = unrealizedPnl + realizedPnl;
      const totalBasis = totalCostBasis + totalClosedCost;
      const totalPct = totalBasis === 0 ? 0 : (totalPnl / totalBasis) * 100;

      const accounts = [...new Set([
        ...openPositions.map((p: any) => p.account),
        ...closedPositions.map((p: any) => p.account)
      ])];

      const byAccount: any = {};
      for (const account of accounts) {
        const accountOpen = openPositions.filter((p: any) => p.account === account);
        const accountClosed = closedPositions.filter((p: any) => p.account === account);
        const aCostBasis = accountOpen.reduce((sum: number, p: any) => sum + p.costBasis, 0);
        const aValue = accountOpen.reduce((sum: number, p: any) => sum + (currentValues[p.id] ?? p.costBasis), 0);
        const aUnrealized = aValue - aCostBasis;
        const aRealized = accountClosed.reduce((sum: number, p: any) => {
          if (!p.sellPrice || !p.costBasis) return sum;
          const costPerContract = p.costBasis / p.contracts;
          const contractsSold = p.contractsSold ?? p.contracts;
          return sum + (p.sellPrice - (costPerContract * contractsSold));
        }, 0);
        const aTotalPnl = aUnrealized + aRealized;
        const aTotalBasis = aCostBasis + accountClosed.reduce((sum: number, p: any) => {
          const costPerContract = p.costBasis / p.contracts;
          return sum + (costPerContract * (p.contractsSold ?? p.contracts));
        }, 0);
        byAccount[account] = {
          costBasis: aCostBasis,
          value: aValue,
          unrealizedPnl: aUnrealized,
          realizedPnl: aRealized,
          totalPnl: aTotalPnl,
          totalPct: aTotalBasis === 0 ? 0 : (aTotalPnl / aTotalBasis) * 100
        };
      }

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
        byAccount
      });

      console.log('Daily snapshot saved successfully');
    } catch (error) {
      console.error('Error saving daily snapshot:', error);
    }
  });
