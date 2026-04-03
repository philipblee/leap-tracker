import type { Position } from '../types';

// Calculate unrealized P&L for a single open position
export const calcUnrealizedPnl = (position: Position, currentValue: number): number => {
  return currentValue - position.costBasis;
};

// Calculate unrealized P&L percentage
export const calcUnrealizedPct = (position: Position, currentValue: number): number => {
  if (position.costBasis === 0) return 0;
  return ((currentValue - position.costBasis) / position.costBasis) * 100;
};

// Calculate realized P&L for a closed position
export const calcRealizedPnl = (position: Position): number => {
  if (!position.sellPrice || !position.costBasis) return 0;
  const costPerContract = position.costBasis / position.contracts;
  const contractsSold = position.contractsSold ?? position.contracts;
  return position.sellPrice - (costPerContract * contractsSold);
};

// Calculate realized P&L percentage
export const calcRealizedPct = (position: Position): number => {
  if (!position.sellPrice || !position.costBasis) return 0;
  const costPerContract = position.costBasis / position.contracts;
  const contractsSold = position.contractsSold ?? position.contracts;
  const allocatedCost = costPerContract * contractsSold;
  if (allocatedCost === 0) return 0;
  return ((position.sellPrice - allocatedCost) / allocatedCost) * 100;
};

// Aggregate portfolio summary from positions + current prices
export const calcPortfolioSummary = (
  openPositions: Position[],
  closedPositions: Position[],
  currentValues: { [positionId: string]: number }
) => {
  const totalCostBasis = openPositions.reduce((sum, p) => sum + p.costBasis, 0);
  const totalCurrentValue = openPositions.reduce((sum, p) => {
    return sum + (currentValues[p.id!] ?? p.costBasis);
  }, 0);
  const unrealizedPnl = totalCurrentValue - totalCostBasis;
  const unrealizedPct = totalCostBasis === 0 ? 0 : (unrealizedPnl / totalCostBasis) * 100;

  const realizedPnl = closedPositions.reduce((sum, p) => sum + calcRealizedPnl(p), 0);
  const totalClosedCost = closedPositions.reduce((sum, p) => {
    const costPerContract = p.costBasis / p.contracts;
    const contractsSold = p.contractsSold ?? p.contracts;
    return sum + (costPerContract * contractsSold);
  }, 0);
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

// Format currency
export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(value);
};

// Format percentage
export const formatPct = (value: number): string => {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
};

// Format date from YYYY-MM-DD to MM/DD/YYYY
export const formatDate = (date: string): string => {
  if (!date) return '—';
  const [year, month, day] = date.split('-');
  return `${month}/${day}/${year}`;
};
