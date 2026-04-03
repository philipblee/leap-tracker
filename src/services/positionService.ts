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
import type { Position } from '../types';

const COLLECTION = 'positions';

// Get all open positions
export const getOpenPositions = async (): Promise<Position[]> => {
  const q = query(collection(db, COLLECTION), where('isOpen', '==', true));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Position));
};

// Get all closed positions
export const getClosedPositions = async (): Promise<Position[]> => {
  const q = query(collection(db, COLLECTION), where('isOpen', '==', false));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Position));
};

// Add a single position
export const addPosition = async (position: Position): Promise<string> => {
  const docRef = await addDoc(collection(db, COLLECTION), position);
  return docRef.id;
};

// Update a position
export const updatePosition = async (id: string, updates: Partial<Position>): Promise<void> => {
  const docRef = doc(db, COLLECTION, id);
  await updateDoc(docRef, updates);
};

// Delete a position
export const deletePosition = async (id: string): Promise<void> => {
  const docRef = doc(db, COLLECTION, id);
  await deleteDoc(docRef);
};

// Close a position (full or partial)
export const closePosition = async (
  id: string,
  sellDate: string,
  sellPrice: number,
  contractsSold: number,
  totalContracts: number
): Promise<void> => {
  const realizedPnl = sellPrice - (contractsSold / totalContracts);
  const isFullClose = contractsSold === totalContracts;
  await updatePosition(id, {
    isOpen: !isFullClose,
    sellDate,
    sellPrice,
    contractsSold,
    realizedPnl
  });
};

// Bulk add positions (CSV import)
export const bulkAddPositions = async (positions: Position[]): Promise<void> => {
  const promises = positions.map(p => addPosition(p));
  await Promise.all(promises);
};
