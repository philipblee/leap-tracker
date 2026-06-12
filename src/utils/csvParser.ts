import Papa from 'papaparse';
import type { OptionType } from '../types';

export const ACCOUNT_NUMBER_MAP: Record<string, string> = {
  '119072621': 'IRA',
  '233267024': 'IRA ROTH',
  'X69705290': 'DI Ind',
  '209435910': 'DI IRA',
  'Z40402241': 'Margin',
};

export function accountLabelFromNumber(accountNumber: string): string | null {
  return ACCOUNT_NUMBER_MAP[accountNumber] ?? null;
}

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
  accountNumber?: string;
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
  accountNumber?: string;
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
  accountNumber?: string;
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

export type ActivityImportRow =
  | (BuyImportRow & { transactionType: 'BUY' })
  | (SellImportRow & { transactionType: 'SELL' });

export type BrokerFormat = 'fidelity' | 'fidelity_closed' | 'fidelity_activity' | 'custom_buy' | 'custom_sell' | 'unknown';

export const detectFormat = (headers: string[]): BrokerFormat => {
  const h = headers.map(x => x.trim().toLowerCase());
  if (h.some(x => x.includes('symbol(cusip)')) && h.includes('date acquired'))
    return 'fidelity_closed';
  if (h.includes('symbol') && h.includes('cost basis total') && h.includes('account name'))
    return 'fidelity';
  if (h.includes('action') && h.some(x => x.includes('run date')))
    return 'fidelity_activity';
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
          const rawAcctNum = r['account number']?.trim();
          let account: string;
          let accountNumber: string | undefined;
          if (rawAcctNum) {
            accountNumber = rawAcctNum;
            const label = accountLabelFromNumber(rawAcctNum);
            if (label) {
              account = label;
            } else {
              account = 'UNRECOGNIZED:' + rawAcctNum;
              errors.push({ row: n, message: `Unrecognized account number: ${rawAcctNum} — added with placeholder label, needs manual review` });
            }
          } else {
            account = normalizeAccount(r['account name']?.trim() ?? r['account']?.trim() ?? 'Unknown');
          }
          valid.push({
            ticker: parsed.ticker,
            optionType: parsed.optionType,
            strike: parsed.strike,
            expiry: parsed.expiry,
            account,
            accountNumber,
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
          const rawAcctNumC = r['account number']?.trim();
          let accountC: string;
          let accountNumberC: string | undefined;
          if (rawAcctNumC) {
            accountNumberC = rawAcctNumC;
            const label = accountLabelFromNumber(rawAcctNumC);
            if (label) {
              accountC = label;
            } else {
              accountC = 'UNRECOGNIZED:' + rawAcctNumC;
              errors.push({ row: n, message: `Unrecognized account number: ${rawAcctNumC} — added with placeholder label, needs manual review` });
            }
          } else {
            accountC = normalizeAccount(r['account']?.trim() ?? r['account name']?.trim() ?? 'Unknown');
          }
          valid.push({
            ticker: parsed.ticker,
            optionType: parsed.optionType,
            strike: parsed.strike,
            expiry: parsed.expiry,
            account: accountC,
            accountNumber: accountNumberC,
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

const MONTH_MAP: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12'
};

const normalizeRunDate = (date: string): string => {
  const s = date.trim();
  if (!s.includes('/')) return s;
  const [m, d, y] = s.split('/');
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
};

export const normalizeAccount = (raw: string): string => {
  const s = raw.trim();
  if (/ira.?roth/i.test(s)) return 'IRA ROTH';
  if (/ira.?roll/i.test(s)) return 'IRA';
  if (/^ira/i.test(s)) return 'IRA';
  if (/trust/i.test(s)) return 'Margin';
  if (/di\s*individual/i.test(s)) return 'DI IND';
  return s.replace(/\s*\$[\d,.KkMm]+.*$/, '').trim();
};

const parseActivityDescription = (description: string): {
  ticker: string; optionType: OptionType; strike: number; expiry: string;
} | null => {
  const m = description.match(
    /^(CALL|PUT)\s*\(([^)]+)\).*?([A-Z]{3})\s+(\d{1,2})\s+(\d{2,4})\s+\$(\d+(?:\.\d+)?)/i
  );
  if (!m) return null;
  const [, type, ticker, mon, day, yy, strikeStr] = m;
  const month = MONTH_MAP[mon.toUpperCase()];
  if (!month) return null;
  const year = yy.length === 4 ? yy : `20${yy}`;
  return {
    ticker: ticker.trim().toUpperCase(),
    optionType: type.toUpperCase() as OptionType,
    strike: Number(strikeStr),
    expiry: `${year}-${month}-${day.padStart(2, '0')}`
  };
};

const lenientParseDescription = (description: string): {
  ticker: string; optionType: OptionType; strike: number; expiry: string;
} | null => {
  const m = description.match(/^(CALL|PUT)\s*\(([^)]+)\)/i);
  if (!m) return null;
  return {
    ticker: m[2].trim().toUpperCase(),
    optionType: m[1].toUpperCase() as OptionType,
    strike: 'TBD' as any,
    expiry: 'TBD'
  };
};

export const parseFidelityActivity = (file: File): Promise<ParseResult<ActivityImportRow>> => {
  return new Promise((resolve) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const valid: ActivityImportRow[] = [];
        const errors: { row: number; message: string }[] = [];
        results.data.forEach((row: any, index: number) => {
          const r = normalizeRow(row);
          const n = index + 2;

          const action = (r['action'] ?? '').toUpperCase();
          const symbol = (r['symbol'] ?? '').trim();
          const description = (r['description'] ?? '').trim();

          const isOptionRow = symbol.startsWith('-') || /\b(CALL|PUT)\b/i.test(description);
          if (!isOptionRow) return;

          const isBuy = action.includes('BOUGHT') || action.includes('OPENING');
          const isSell = action.includes('SOLD') || action.includes('CLOSING');
          if (!isBuy && !isSell) return;

          const parsed = parseActivityDescription(description)
            ?? (symbol.startsWith('-') ? parseFidelitySymbol(symbol) : null)
            ?? lenientParseDescription(description);
          if (!parsed) {
            errors.push({ row: n, message: `Cannot parse option details: ${description || symbol}` });
            return;
          }

          const qty = Math.abs(Number((r['quantity'] ?? '0').toString().replace(/,/g, '')));
          if (isNaN(qty) || qty <= 0) {
            errors.push({ row: n, message: `Invalid quantity at row ${n}` });
            return;
          }

          const amount = Math.abs(cleanNumber(r['amount'] ?? '0'));
          const runDate = normalizeRunDate(r['run date'] ?? '');
          if (!runDate) {
            errors.push({ row: n, message: `Missing run date at row ${n}` });
            return;
          }

          const rawAcctNumA = r['account number']?.trim();
          let accountA: string;
          let accountNumberA: string | undefined;
          if (rawAcctNumA) {
            accountNumberA = rawAcctNumA;
            const label = accountLabelFromNumber(rawAcctNumA);
            if (label) {
              accountA = label;
            } else {
              accountA = 'UNRECOGNIZED:' + rawAcctNumA;
              errors.push({ row: n, message: `Unrecognized account number: ${rawAcctNumA} — added with placeholder label, needs manual review` });
            }
          } else {
            const accountRaw = r['account name'] ?? r['account name/number'] ?? r['account'] ?? '';
            accountA = normalizeAccount(accountRaw) || 'Unknown';
          }

          if (isBuy) {
            valid.push({ ...parsed, account: accountA, accountNumber: accountNumberA, buyDate: runDate, contracts: qty, costBasis: amount, transactionType: 'BUY' });
          } else {
            valid.push({ ...parsed, account: accountA, accountNumber: accountNumberA, contractsSold: qty, sellDate: runDate, sellPrice: amount, transactionType: 'SELL' });
          }
        });
        resolve({ valid, errors });
      }
    });
  });
};
