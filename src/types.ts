export type OptionType = 'CALL' | 'PUT';

export type Account = string;

export interface Position {
  id?: string;
  ticker: string;
  optionType: OptionType;
  strike: number;
  expiry: string;
  contracts: number;
  costBasis: number;
  buyDate: string;
  account: Account;
  isOpen: boolean;
  sellDate?: string;
  sellPrice?: number;
  contractsSold?: number;
  realizedPnl?: number;
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
