export type OptionType = 'CALL' | 'PUT';

export type Account = string;

export interface Position {
  id?: string;
  ticker: string;
  optionType: OptionType;
  strike: number;
  expiry: string;
  account: Account;
  accountNumber?: string;
  isOpen: boolean;
  buyDate: string;
  costBasis: number;
  currentValue?: number;
  lastPriceDate?: string;
  lastPrice?: number;
  bid?: number;
  ask?: number;
  price?: number;  // max(lastPrice, bid) — effective price used for valuation
}

export interface Lot {
  id?: string;
  positionId: string;
  buyDate: string;
  contracts: number;
  costBasis: number;
  isOpen: boolean;
  sellDate?: string;
  sellPrice?: number;
  contractsSold?: number;
  realizedPnl?: number;
}

// Aggregated view of a Position + its Lots, used for display
export interface PositionSummary {
  position: Position;
  lots: Lot[];
  // Open lot aggregates
  openContracts: number;
  totalCostBasis: number;        // sum of costBasis across open lots
  // Current market value (from position.currentValue, per-contract basis × openContracts)
  currentValue: number | null;
  unrealizedPnl: number | null;
  unrealizedPct: number | null;
  // Closed lot aggregates
  realizedPnl: number;
}

export interface Snapshot {
  id?: string;
  date: string;
  totalCostBasis: number;
  totalValue: number;
  unrealizedPnl: number;
  unrealizedPct: number;
  realizedPnl: number;
  realizedPct: number;
  totalPnl: number;
  totalPct: number;
  byAccount: {
    [account: string]: {
      costBasis: number;
      value: number;
      unrealizedPnl: number;
      realizedPnl: number;
      totalPnl: number;
      totalPct: number;
    };
  };
}

export type Config = {
  pinHash: string;
  accounts: string[];
}

export interface PendingClose {
  id?: string;
  positionId: string;
  ticker: string;
  strike: number;
  expiry: string;
  account: string;
  contractsToClose: number;
  sellDate: string;
  sellPrice: number;
  importSource: string;
  createdAt: string;
  matched?: boolean;
}
