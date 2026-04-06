import type { PositionSummary } from '../types';

// Aggregate portfolio totals from all position summaries (open + closed).
// Unrealized P&L comes from open positions; realized P&L comes from closed
// lots across all positions (partial closes on open positions are included).
export const calcPortfolioSummary = (summaries: PositionSummary[]) => {
  const openSummaries = summaries.filter(s => s.position.isOpen);

  const totalCostBasis = openSummaries.reduce((sum, s) => sum + s.totalCostBasis, 0);
  const totalCurrentValue = openSummaries.reduce(
    (sum, s) => sum + (s.currentValue ?? s.totalCostBasis), 0
  );
  const unrealizedPnl = totalCurrentValue - totalCostBasis;
  const unrealizedPct = totalCostBasis === 0 ? 0 : (unrealizedPnl / totalCostBasis) * 100;

  const realizedPnl = summaries.reduce((sum, s) => sum + s.realizedPnl, 0);
  const totalClosedCost = summaries.reduce(
    (sum, s) => sum + s.lots.filter(l => !l.isOpen).reduce((a, l) => a + l.costBasis, 0), 0
  );
  const realizedPct = totalClosedCost === 0 ? 0 : (realizedPnl / totalClosedCost) * 100;

  const totalPnl = unrealizedPnl + realizedPnl;
  const totalBasis = totalCostBasis + totalClosedCost;
  const totalPct = totalBasis === 0 ? 0 : (totalPnl / totalBasis) * 100;

  return {
    totalCostBasis,
    totalCurrentValue,
    unrealizedPnl,
    unrealizedPct,
    realizedPnl,
    realizedPct,
    totalPnl,
    totalPct
  };
};

export const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

export const formatPct = (value: number): string =>
  `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

export const formatDate = (date: string): string => {
  if (!date) return '—';
  if (date.includes('/')) return date;
  const [year, month, day] = date.split('-');
  if (!year || !month || !day) return date;
  return `${month}/${day}/${year}`;
};
