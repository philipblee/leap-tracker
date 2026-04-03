import Papa from 'papaparse';
import type { Position, OptionType } from '../types';

export interface CSVRow {
  ticker: string;
  type: string;
  strike: string;
  expiry: string;
  contracts: string;
  cost_basis: string;
  buy_date: string;
  account: string;
}

export interface SellCSVRow {
  ticker: string;
  type: string;
  strike: string;
  expiry: string;
  contracts_sold: string;
  sell_date: string;
  sell_price: string;
  account: string;
}

export interface ParseResult<T> {
  valid: T[];
  errors: { row: number; message: string }[];
}

// Parse buy CSV
export const parseBuyCSV = (file: File): Promise<ParseResult<Position>> => {
  return new Promise((resolve) => {
    Papa.parse<CSVRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const valid: Position[] = [];
        const errors: { row: number; message: string }[] = [];

        results.data.forEach((row, index) => {
          const rowNum = index + 2; // account for header row

          // Validate required fields
          if (!row.ticker) {
            errors.push({ row: rowNum, message: 'Missing ticker' });
            return;
          }
          if (!['CALL', 'PUT'].includes(row.type?.toUpperCase())) {
            errors.push({ row: rowNum, message: 'Type must be CALL or PUT' });
            return;
          }
          if (isNaN(Number(row.strike)) || Number(row.strike) <= 0) {
            errors.push({ row: rowNum, message: 'Invalid strike price' });
            return;
          }
          if (!row.expiry || isNaN(Date.parse(row.expiry))) {
            errors.push({ row: rowNum, message: 'Invalid expiry date' });
            return;
          }
          if (isNaN(Number(row.contracts)) || Number(row.contracts) <= 0) {
            errors.push({ row: rowNum, message: 'Invalid contracts' });
            return;
          }
          if (isNaN(Number(row.cost_basis)) || Number(row.cost_basis) <= 0) {
            errors.push({ row: rowNum, message: 'Invalid cost basis' });
            return;
          }
          if (!row.buy_date || isNaN(Date.parse(row.buy_date))) {
            errors.push({ row: rowNum, message: 'Invalid buy date' });
            return;
          }
          if (!row.account) {
            errors.push({ row: rowNum, message: 'Missing account' });
            return;
          }

          valid.push({
            ticker: row.ticker.toUpperCase(),
            optionType: row.type.toUpperCase() as OptionType,
            strike: Number(row.strike),
            expiry: row.expiry,
            contracts: Number(row.contracts),
            costBasis: Number(row.cost_basis),
            buyDate: row.buy_date,
            account: row.account,
            isOpen: true
          });
        });

        resolve({ valid, errors });
      }
    });
  });
};

// Parse sell CSV
export const parseSellCSV = (file: File): Promise<ParseResult<SellCSVRow>> => {
  return new Promise((resolve) => {
    Papa.parse<SellCSVRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const valid: SellCSVRow[] = [];
        const errors: { row: number; message: string }[] = [];

        results.data.forEach((row, index) => {
          const rowNum = index + 2;

          if (!row.ticker) {
            errors.push({ row: rowNum, message: 'Missing ticker' });
            return;
          }
          if (!['CALL', 'PUT'].includes(row.type?.toUpperCase())) {
            errors.push({ row: rowNum, message: 'Type must be CALL or PUT' });
            return;
          }
          if (isNaN(Number(row.strike)) || Number(row.strike) <= 0) {
            errors.push({ row: rowNum, message: 'Invalid strike price' });
            return;
          }
          if (!row.expiry || isNaN(Date.parse(row.expiry))) {
            errors.push({ row: rowNum, message: 'Invalid expiry date' });
            return;
          }
          if (isNaN(Number(row.contracts_sold)) || Number(row.contracts_sold) <= 0) {
            errors.push({ row: rowNum, message: 'Invalid contracts sold' });
            return;
          }
          if (!row.sell_date || isNaN(Date.parse(row.sell_date))) {
            errors.push({ row: rowNum, message: 'Invalid sell date' });
            return;
          }
          if (isNaN(Number(row.sell_price)) || Number(row.sell_price) <= 0) {
            errors.push({ row: rowNum, message: 'Invalid sell price' });
            return;
          }

          valid.push(row);
        });

        resolve({ valid, errors });
      }
    });
  });
};
