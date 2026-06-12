import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  where
} from 'firebase/firestore';
import { db } from './firebase';
import type { Lot, Position, PositionSummary } from '../types';

const COLLECTION = 'positions';

export const getAllPositions = async (): Promise<Position[]> => {
  const snapshot = await getDocs(collection(db, COLLECTION));
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Position));
};

export const getOpenPositions = async (): Promise<Position[]> => {
  const q = query(collection(db, COLLECTION), where('isOpen', '==', true));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Position));
};

export const getClosedPositions = async (): Promise<Position[]> => {
  const q = query(collection(db, COLLECTION), where('isOpen', '==', false));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Position));
};

export const addPosition = async (position: Omit<Position, 'id'>): Promise<string> => {
  const docRef = await addDoc(collection(db, COLLECTION), position);
  return docRef.id;
};

export const updatePosition = async (id: string, updates: Partial<Position>): Promise<void> => {
  await updateDoc(doc(db, COLLECTION, id), updates);
};

export const deletePosition = async (id: string): Promise<void> => {
  const { getLotsForPosition, deleteLot } = await import('./lotService');
  const lots = await getLotsForPosition(id);
  await Promise.all(lots.map(l => deleteLot(l.id!)));
  await deleteDoc(doc(db, COLLECTION, id));
};

// Find a position matching ticker + optionType + strike + expiry + account (short label),
// or create one if no match found. accountNumber is stored on new positions only.
// Returns the positionId.
export const findOrCreatePosition = async (
  ticker: string,
  optionType: Position['optionType'],
  strike: number,
  expiry: string,
  account: string,
  accountNumber: string | undefined,
  buyDate: string,
  costBasis: number
): Promise<string> => {
  const q = query(
    collection(db, COLLECTION),
    where('ticker', '==', ticker),
    where('optionType', '==', optionType),
    where('strike', '==', strike),
    where('expiry', '==', expiry),
    where('account', '==', account),
    where('isOpen', '==', true)
  );
  const snapshot = await getDocs(q);
  if (!snapshot.empty) {
    return snapshot.docs[0].id;
  }
  return addPosition({ ticker, optionType, strike, expiry, account, accountNumber, isOpen: true, buyDate, costBasis });
};

// Aggregate lot data into a PositionSummary for each position.
// position.currentValue is expected to be per-contract market value (lastPrice * 100),
// so total current value = currentValue * openContracts.
export const getPositionSummaries = (
  positions: Position[],
  lots: Lot[]
): PositionSummary[] => {
  return positions.map(position => {
    const positionLots = lots.filter(l => l.positionId === position.id);
    const openLots = positionLots.filter(l => l.isOpen);
    const closedLots = positionLots.filter(l => !l.isOpen);

    const openContracts = openLots.reduce((sum, l) => sum + l.contracts, 0);
    const totalCostBasis = openLots.reduce((sum, l) => sum + l.costBasis, 0);

    const currentValue = position.currentValue != null
      ? position.currentValue * openContracts
      : null;
    const unrealizedPnl = currentValue != null ? currentValue - totalCostBasis : null;
    const unrealizedPct = unrealizedPnl != null && totalCostBasis > 0
      ? (unrealizedPnl / totalCostBasis) * 100
      : null;

    const realizedPnl = closedLots.reduce((sum, l) => sum + (l.realizedPnl ?? 0), 0);

    return {
      position,
      lots: positionLots,
      openContracts,
      totalCostBasis,
      currentValue,
      unrealizedPnl,
      unrealizedPct,
      realizedPnl
    };
  });
};
