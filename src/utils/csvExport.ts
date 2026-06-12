import type { PositionSummary } from '../types';

function downloadCSV(headers: string[], rows: string[][], filename: string) {
  const escape = (val: string) =>
    /[",\n]/.test(val) ? `"${val.replace(/"/g, '""')}"` : val;
  const csv = [headers, ...rows].map(r => r.map(escape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function buildOptionSymbol(ticker: string, expiry: string, optionType: string, strike: number): string {
  const [y, m, d] = expiry.split('-');
  const dateStr = y.slice(2) + m + d;
  const typeChar = optionType.toUpperCase().startsWith('C') ? 'C' : 'P';
  const strikeStr = String(Math.round(strike * 1000)).padStart(8, '0');
  return `${ticker}${dateStr}${typeChar}${strikeStr}`;
}

export function exportOpenPositionsCSV(positions: PositionSummary[]): void {
  const headers = [
    'OPEN_ID', 'BUY_TXN_ID', 'TICKER', 'INSTRUMENT_TYPE', 'OPTION_SYMBOL',
    'STRIKE', 'EXPIRY', 'ACCOUNT_NAME', 'ACCOUNT_NUMBER', 'BUY_DATE',
    'BUY_PRICE', 'BUY_QUANTITY', 'BUY_AMOUNT', 'DAYS_HELD', 'EST_CURRENT_PRICE',
    'EST_UNREALIZED_PCT', 'EST_UNREALIZED_DOLLAR', 'NOMINAL_VALUE', 'LEVERAGE',
  ];

  const rows: string[][] = [];

  for (const summary of positions) {
    const { position } = summary;
    const optionSymbol = buildOptionSymbol(position.ticker, position.expiry, position.optionType, position.strike);
    const currentValue = position.currentValue;

    for (const lot of summary.lots.filter(l => l.isOpen)) {
      const daysHeld = Math.floor((Date.now() - new Date(lot.buyDate).getTime()) / 86400000);
      const nominalValue = (position.strike * lot.contracts * 100).toFixed(2);
      const leverage = (Number(nominalValue) / lot.costBasis).toFixed(2);

      const estCurrentPrice = currentValue != null ? String(currentValue) : '';
      const estUnrealizedPct = currentValue != null
        ? (((currentValue * lot.contracts) - lot.costBasis) / lot.costBasis * 100).toFixed(2)
        : '';
      const estUnrealizedDollar = currentValue != null
        ? ((currentValue * lot.contracts) - lot.costBasis).toFixed(2)
        : '';

      rows.push([
        lot.id ?? '',
        '',
        position.ticker,
        position.optionType,
        optionSymbol,
        String(position.strike),
        position.expiry,
        position.account,
        '',
        lot.buyDate,
        (lot.costBasis / lot.contracts / 100).toFixed(2),
        String(lot.contracts),
        lot.costBasis.toFixed(2),
        String(daysHeld),
        estCurrentPrice,
        estUnrealizedPct,
        estUnrealizedDollar,
        nominalValue,
        leverage,
      ]);
    }
  }

  downloadCSV(headers, rows, `open-positions-${new Date().toISOString().slice(0, 10)}.csv`);
}

export function exportClosedPositionsCSV(positions: PositionSummary[]): void {
  const headers = [
    'CLOSED_ID', 'BUY_TXN_ID', 'SELL_TXN_ID', 'TICKER', 'INSTRUMENT_TYPE',
    'OPTION_SYMBOL', 'STRIKE', 'EXPIRY', 'ACCOUNT_NAME', 'ACCOUNT_NUMBER',
    'BUY_DATE', 'BUY_PRICE', 'BUY_QUANTITY', 'BUY_AMOUNT', 'SELL_DATE',
    'SELL_PRICE', 'SELL_QUANTITY', 'SELL_AMOUNT', 'HOLD_DAYS', 'RETURN_PCT', 'RETURN_DOLLAR',
  ];

  const rows: string[][] = [];

  for (const summary of positions) {
    const { position } = summary;
    const optionSymbol = buildOptionSymbol(position.ticker, position.expiry, position.optionType, position.strike);

    for (const lot of summary.lots.filter(l => !l.isOpen)) {
      const qty = lot.contractsSold ?? lot.contracts;
      const holdDays = lot.sellDate
        ? String(Math.floor((new Date(lot.sellDate).getTime() - new Date(lot.buyDate).getTime()) / 86400000))
        : '';
      const returnPct = lot.realizedPnl != null && lot.costBasis > 0
        ? ((lot.realizedPnl / lot.costBasis) * 100).toFixed(2)
        : '';

      rows.push([
        lot.id ?? '',
        '',
        '',
        position.ticker,
        position.optionType,
        optionSymbol,
        String(position.strike),
        position.expiry,
        position.account,
        '',
        lot.buyDate,
        (lot.costBasis / qty / 100).toFixed(2),
        String(qty),
        lot.costBasis.toFixed(2),
        lot.sellDate ?? '',
        lot.sellPrice != null && qty > 0 ? (lot.sellPrice / qty / 100).toFixed(2) : '',
        String(qty),
        lot.sellPrice?.toFixed(2) ?? '',
        holdDays,
        returnPct,
        lot.realizedPnl?.toFixed(2) ?? '',
      ]);
    }
  }

  downloadCSV(headers, rows, `closed-positions-${new Date().toISOString().slice(0, 10)}.csv`);
}
