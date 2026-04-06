import Papa from 'papaparse';
import type { OptionType } from '../types';

const normalizeRow = (row: any): any => {
  const normalized: any = {};
  for (const key of Object.keys(row)) {
    normalized[key.toLowerCase().trim()] = row[key];
  }
  return normalized;
};

export interface BuyImportRow {
  ticker: string;
  optionType: OptionType;
  strike: number;
  expiry: string;
  account: string;
  buyDate: string;
  contracts: number;
  costBasis: number;
  currentValue?: number;
}

export interface SellImportRow {
  ticker: string;
  optionType: OptionType;
  strike: number;
  expiry: string;
  account: string;
  contractsSold: number;
  sellDate: string;
  sellPrice: number;
}

export interface ClosedImportRow {
  ticker: string;
  optionType: OptionType;
  strike: number;
  expiry: string;
  account: string;
  buyDate: string;
  contracts: number;
  costBasis: number;
  sellDate: string;
  sellPrice: number;
  contractsSold: number;
  realizedPnl: number;
}

export interface ParseResult<T> {
  valid: T[];
  errors: { row: number; message: string }[];
}

export type BrokerFormat = 'fidelity' | 'fidelity_closed' | 'custom_buy' | 'custom_sell' | 'unknown';

export const detectFormat = (headers: string[]): BrokerFormat => {
  const h = headers.map(x => x.trim().toLowerCase());
  if (h.some(x => x.includes('symbol(cusip)')) && h.includes('date acquired'))
    return 'fidelity_closed';
  if (h.includes('symbol') && h.includes('cost basis total') && h.includes('account name'))
    return 'fidelity';
  if (h.includes('ticker') && h.includes('cost_basis') && h.includes('buy_date'))
    return 'custom_buy';
  if (h.includes('ticker') && h.includes('sell_price') && h.includes('sell_date'))
    return 'custom_sell';
  return 'unknown';
};

export const parseFidelitySymbol = (symbol: string): {
  ticker: string;
  optionType: OptionType;
  strike: number;
  expiry: string;
} | null => {
  const cleaned = symbol.trim().replace(/^-/, '');
  const match = cleaned.match(/^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d+(\.\d+)?)$/);
  if (!match) return null;
  const [, ticker, yy, mm, dd, type, strikeStr] = match;
  return {
    ticker,
    optionType: type === 'C' ? 'CALL' : 'PUT',
    strike: Number(strikeStr),
    expiry: `20${yy}-${mm}-${dd}`
  };
};

const cleanNumber = (val: string): number =>
  Number(val.replace(/[$,%\s"]/g, '').replace(/,/g, '').trim());

export const parseBuyCSV = (file: File): Promise<ParseResult<BuyImportRow>> => {
  return new Promise((resolve) => {
    Papa.parse<any>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const valid: BuyImportRow[] = [];
        const errors: { row: number; message: string }[] = [];
        results.data.forEach((row: any, index: number) => {
          const r = normalizeRow(row);
          const n = index + 2;
          if (!r.ticker) { errors.push({ row: n, message: 'Missing ticker' }); return; }
          if (!['CALL', 'PUT'].includes(r.type?.toUpperCase())) { errors.push({ row: n, message: 'Type must be CALL or PUT' }); return; }
          if (isNaN(Number(r.strike)) || Number(r.strike) <= 0) { errors.push({ row: n, message: 'Invalid strike price' }); return; }
          if (!r.expiry || isNaN(Date.parse(r.expiry))) { errors.push({ row: n, message: 'Invalid expiry date' }); return; }
          if (isNaN(Number(r.contracts)) || Number(r.contracts) <= 0) { errors.push({ row: n, message: 'Invalid contracts' }); return; }
          if (isNaN(Number(r.cost_basis)) || Number(r.cost_basis) <= 0) { errors.push({ row: n, message: 'Invalid cost basis' }); return; }
          if (!r.buy_date || isNaN(Date.parse(r.buy_date))) { errors.push({ row: n, message: 'Invalid buy date' }); return; }
          if (!r.account) { errors.push({ row: n, message: 'Missing account' }); return; }
          valid.push({
            ticker: r.ticker.toUpperCase(),
            optionType: r.type.toUpperCase() as OptionType,
            strike: Number(r.strike),
            expiry: r.expiry,
            account: r.account,
            buyDate: r.buy_date,
            contracts: Number(r.contracts),
            costBasis: Number(r.cost_basis)
          });
        });
        resolve({ valid, errors });
      }
    });
  });
};

export const parseSellCSV = (file: File): Promise<ParseResult<SellImportRow>> => {
  return new Promise((resolve) => {
    Papa.parse<any>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const valid: SellImportRow[] = [];
        const errors: { row: number; message: string }[] = [];
        results.data.forEach((row: any, index: number) => {
          const r = normalizeRow(row);
          const n = index + 2;
          if (!r.ticker) { errors.push({ row: n, message: 'Missing ticker' }); return; }
          if (!['CALL', 'PUT'].includes(r.type?.toUpperCase())) { errors.push({ row: n, message: 'Type must be CALL or PUT' }); return; }
          if (isNaN(Number(r.strike)) || Number(r.strike) <= 0) { errors.push({ row: n, message: 'Invalid strike price' }); return; }
          if (!r.expiry || isNaN(Date.parse(r.expiry))) { errors.push({ row: n, message: 'Invalid expiry date' }); return; }
          if (isNaN(Number(r.contracts_sold)) || Number(r.contracts_sold) <= 0) { errors.push({ row: n, message: 'Invalid contracts sold' }); return; }
          if (!r.sell_date || isNaN(Date.parse(r.sell_date))) { errors.push({ row: n, message: 'Invalid sell date' }); return; }
          if (isNaN(Number(r.sell_price)) || Number(r.sell_price) <= 0) { errors.push({ row: n, message: 'Invalid sell price' }); return; }
          valid.push({
            ticker: r.ticker.toUpperCase(),
            optionType: r.type.toUpperCase() as OptionType,
            strike: Number(r.strike),
            expiry: r.expiry,
            account: r.account ?? '',
            contractsSold: Number(r.contracts_sold),
            sellDate: r.sell_date,
            sellPrice: Number(r.sell_price)
          });
        });
        resolve({ valid, errors });
      }
    });
  });
};

export const parseFidelityCSV = (file: File): Promise<ParseResult<BuyImportRow>> => {
  return new Promise((resolve) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      delimiter: ',',
      complete: (results) => {
        const valid: BuyImportRow[] = [];
        const errors: { row: number; message: string }[] = [];
        results.data.forEach((row: any, index: number) => {
          const r = normalizeRow(row);
          const n = index + 2;
          const symbol = r['symbol']?.trim() ?? '';
          if (!symbol.startsWith('-')) return;
          const parsed = parseFidelitySymbol(symbol);
          if (!parsed) { errors.push({ row: n, message: `Cannot parse symbol: ${symbol}` }); return; }
          const contracts = Number(r['quantity']?.trim());
          if (isNaN(contracts) || contracts <= 0) { errors.push({ row: n, message: `Invalid quantity at row ${n}` }); return; }
          valid.push({
            ticker: parsed.ticker,
            optionType: parsed.optionType,
            strike: parsed.strike,
            expiry: parsed.expiry,
            account: r['type']?.trim() ?? 'Unknown',
            buyDate: '1900-01-01',
            contracts,
            costBasis: cleanNumber(r['cost basis total'] ?? '0'),
            currentValue: cleanNumber(r['current value'] ?? '0')
          });
        });
        resolve({ valid, errors });
      }
    });
  });
};

export const parseFidelityClosedCSV = (file: File): Promise<ParseResult<ClosedImportRow>> => {
  return new Promise((resolve) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const valid: ClosedImportRow[] = [];
        const errors: { row: number; message: string }[] = [];
        results.data.forEach((row: any, index: number) => {
          const r = normalizeRow(row);
          const n = index + 2;
          const rawSymbol = r['symbol(cusip)']?.trim() ?? '';
          const symbol = rawSymbol.replace(/\(.*\)/, '').trim();
          const parsed = parseFidelitySymbol(symbol);
          if (!parsed) return;
          const contracts = Number(r['quantity']?.trim());
          if (isNaN(contracts) || contracts <= 0) { errors.push({ row: n, message: `Invalid quantity at row ${n}` }); return; }
          const costBasis = cleanNumber(r['cost basis'] ?? '0');
          const proceeds = cleanNumber(r['proceeds'] ?? '0');
          valid.push({
            ticker: parsed.ticker,
            optionType: parsed.optionType,
            strike: parsed.strike,
            expiry: parsed.expiry,
            account: r['account'] ?? r['account name'] ?? 'Unknown',
            buyDate: r['date acquired']?.trim() ?? '1900-01-01',
            contracts,
            costBasis,
            sellDate: r['date sold']?.trim() ?? '',
            sellPrice: proceeds,
            contractsSold: contracts,
            realizedPnl: proceeds - costBasis
          });
        });
        resolve({ valid, errors });
      }
    });
  });
};
