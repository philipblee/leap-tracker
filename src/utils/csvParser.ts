import Papa from 'papaparse';
import type { OptionType } from '../types';

// ─── Import Row Types ─────────────────────────────────────────────────────────

// One purchase: identifies the position + provides lot fields
export interface BuyImportRow {
  ticker: string;
  optionType: OptionType;
  strike: number;
  expiry: string;
  account: string;
  buyDate: string;
  contracts: number;
  costBasis: number;
  currentValue?: number; // Fidelity open export only
}

// One sale: identifies the position to close against
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

// Fidelity closed export: fully-formed closed lot with exact cost/proceeds data
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

// ─── Format Detection ────────────────────────────────────────────────────────

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

// ─── Fidelity Symbol Parser ──────────────────────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

const cleanNumber = (val: string): number =>
  Number(val.replace(/[$,%\s"]/g, '').replace(/,/g, '').trim());

// ─── Custom Buy CSV ──────────────────────────────────────────────────────────
// Expected columns: ticker, type, strike, expiry, contracts, cost_basis, buy_date, account

export const parseBuyCSV = (file: File): Promise<ParseResult<BuyImportRow>> => {
  return new Promise((resolve) => {
    Papa.parse<any>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const valid: BuyImportRow[] = [];
        const errors: { row: number; message: string }[] = [];

        results.data.forEach((row: any, index: number) => {
          const n = index + 2;
          if (!row.ticker) { errors.push({ row: n, message: 'Missing ticker' }); return; }
          if (!['CALL', 'PUT'].includes(row.type?.toUpperCase())) { errors.push({ row: n, message: 'Type must be CALL or PUT' }); return; }
          if (isNaN(Number(row.strike)) || Number(row.strike) <= 0) { errors.push({ row: n, message: 'Invalid strike price' }); return; }
          if (!row.expiry || isNaN(Date.parse(row.expiry))) { errors.push({ row: n, message: 'Invalid expiry date' }); return; }
          if (isNaN(Number(row.contracts)) || Number(row.contracts) <= 0) { errors.push({ row: n, message: 'Invalid contracts' }); return; }
          if (isNaN(Number(row.cost_basis)) || Number(row.cost_basis) <= 0) { errors.push({ row: n, message: 'Invalid cost basis' }); return; }
          if (!row.buy_date || isNaN(Date.parse(row.buy_date))) { errors.push({ row: n, message: 'Invalid buy date' }); return; }
          if (!row.account) { errors.push({ row: n, message: 'Missing account' }); return; }

          valid.push({
            ticker: row.ticker.toUpperCase(),
            optionType: row.type.toUpperCase() as OptionType,
            strike: Number(row.strike),
            expiry: row.expiry,
            account: row.account,
            buyDate: row.buy_date,
            contracts: Number(row.contracts),
            costBasis: Number(row.cost_basis)
          });
        });
        resolve({ valid, errors });
      }
    });
  });
};

// ─── Custom Sell CSV ─────────────────────────────────────────────────────────
// Expected columns: ticker, type, strike, expiry, contracts_sold, sell_date, sell_price, account

export const parseSellCSV = (file: File): Promise<ParseResult<SellImportRow>> => {
  return new Promise((resolve) => {
    Papa.parse<any>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const valid: SellImportRow[] = [];
        const errors: { row: number; message: string }[] = [];

        results.data.forEach((row: any, index: number) => {
          const n = index + 2;
          if (!row.ticker) { errors.push({ row: n, message: 'Missing ticker' }); return; }
          if (!['CALL', 'PUT'].includes(row.type?.toUpperCase())) { errors.push({ row: n, message: 'Type must be CALL or PUT' }); return; }
          if (isNaN(Number(row.strike)) || Number(row.strike) <= 0) { errors.push({ row: n, message: 'Invalid strike price' }); return; }
          if (!row.expiry || isNaN(Date.parse(row.expiry))) { errors.push({ row: n, message: 'Invalid expiry date' }); return; }
          if (isNaN(Number(row.contracts_sold)) || Number(row.contracts_sold) <= 0) { errors.push({ row: n, message: 'Invalid contracts sold' }); return; }
          if (!row.sell_date || isNaN(Date.parse(row.sell_date))) { errors.push({ row: n, message: 'Invalid sell date' }); return; }
          if (isNaN(Number(row.sell_price)) || Number(row.sell_price) <= 0) { errors.push({ row: n, message: 'Invalid sell price' }); return; }

          valid.push({
            ticker: row.ticker.toUpperCase(),
            optionType: row.type.toUpperCase() as OptionType,
            strike: Number(row.strike),
            expiry: row.expiry,
            account: row.account ?? '',
            contractsSold: Number(row.contracts_sold),
            sellDate: row.sell_date,
            sellPrice: Number(row.sell_price)
          });
        });
        resolve({ valid, errors });
      }
    });
  });
};

// ─── Fidelity Open Positions CSV ─────────────────────────────────────────────

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
          const n = index + 2;
          const symbol = row['Symbol']?.trim() ?? '';
          if (!symbol.startsWith('-')) return;

          const parsed = parseFidelitySymbol(symbol);
          if (!parsed) { errors.push({ row: n, message: `Cannot parse symbol: ${symbol}` }); return; }

          const contracts = Number(row['Quantity']?.trim());
          if (isNaN(contracts) || contracts <= 0) { errors.push({ row: n, message: `Invalid quantity at row ${n}` }); return; }

          valid.push({
            ticker: parsed.ticker,
            optionType: parsed.optionType,
            strike: parsed.strike,
            expiry: parsed.expiry,
            account: row['Type']?.trim() ?? 'Unknown',
            buyDate: '1900-01-01',
            contracts,
            costBasis: cleanNumber(row['Cost Basis Total'] ?? '0'),
            currentValue: cleanNumber(row['Current Value'] ?? '0')
          });
        });
        resolve({ valid, errors });
      }
    });
  });
};

// ─── Fidelity Closed Positions CSV ───────────────────────────────────────────

export const parseFidelityClosedCSV = (file: File): Promise<ParseResult<ClosedImportRow>> => {
  return new Promise((resolve) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const valid: ClosedImportRow[] = [];
        const errors: { row: number; message: string }[] = [];

        results.data.forEach((row: any, index: number) => {
          const n = index + 2;
          const rawSymbol = row['Symbol(CUSIP)']?.trim() ?? '';
          const symbol = rawSymbol.replace(/\(.*\)/, '').trim();
          const parsed = parseFidelitySymbol(symbol);
          if (!parsed) return; // non-option row, skip silently

          const contracts = Number(row['Quantity']?.trim());
          if (isNaN(contracts) || contracts <= 0) { errors.push({ row: n, message: `Invalid quantity at row ${n}` }); return; }

          const costBasis = cleanNumber(row['Cost basis'] ?? '0');
          const proceeds = cleanNumber(row['Proceeds'] ?? '0');

          console.log('Row keys:', Object.keys(row));
          console.log('account value:', row['account']);

          valid.push({
            ticker: parsed.ticker,
            optionType: parsed.optionType,
            strike: parsed.strike,
            expiry: parsed.expiry,
            account: row['Account']?.trim() ?? row['account']?.trim() ?? row['Account name']?.trim() ?? 'Unknown',
            buyDate: row['Date acquired']?.trim() ?? '1900-01-01',
            contracts,
            costBasis,
            sellDate: row['Date sold']?.trim() ?? '',
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
