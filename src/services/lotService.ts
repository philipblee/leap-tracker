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
import type { Lot } from '../types';

const COLLECTION = 'lots';

export const addLot = async (lot: Lot): Promise<string> => {
  const docRef = await addDoc(collection(db, COLLECTION), lot);
  return docRef.id;
};

export const getLotsForPosition = async (positionId: string): Promise<Lot[]> => {
  const q = query(collection(db, COLLECTION), where('positionId', '==', positionId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Lot));
};

export const getOpenLots = async (positionId: string): Promise<Lot[]> => {
  const q = query(
    collection(db, COLLECTION),
    where('positionId', '==', positionId),
    where('isOpen', '==', true)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Lot));
};

export const getClosedLots = async (positionId: string): Promise<Lot[]> => {
  const q = query(
    collection(db, COLLECTION),
    where('positionId', '==', positionId),
    where('isOpen', '==', false)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Lot));
};

export const updateLot = async (id: string, updates: Partial<Lot>): Promise<void> => {
  await updateDoc(doc(db, COLLECTION, id), updates);
};

export const deleteLot = async (id: string): Promise<void> => {
  await deleteDoc(doc(db, COLLECTION, id));
};

// Close specific lots with explicit per-lot quantities.
// sellPrice is the total proceeds for all contracts sold across all selections.
export const closeLotsManual = async (
  positionId: string,
  selections: { lot: Lot; contractsToClose: number }[],
  sellDate: string,
  sellPrice: number
): Promise<void> => {
  const totalContractsSold = selections.reduce((sum, s) => sum + s.contractsToClose, 0);

  for (const { lot, contractsToClose } of selections) {
    const lotFraction = contractsToClose / lot.contracts;
    const allocatedCost = lotFraction * lot.costBasis;
    const allocatedProceeds = totalContractsSold > 0
      ? (contractsToClose / totalContractsSold) * sellPrice
      : 0;
    const realizedPnl = allocatedProceeds - allocatedCost;

    if (contractsToClose === lot.contracts) {
      await updateLot(lot.id!, {
        isOpen: false, sellDate, sellPrice: allocatedProceeds,
        contractsSold: contractsToClose, realizedPnl
      });
    } else {
      await updateLot(lot.id!, {
        contracts: lot.contracts - contractsToClose,
        costBasis: (1 - lotFraction) * lot.costBasis
      });
      await addLot({
        positionId, buyDate: lot.buyDate, contracts: contractsToClose,
        costBasis: allocatedCost, isOpen: false, sellDate,
        sellPrice: allocatedProceeds, contractsSold: contractsToClose, realizedPnl
      });
    }
  }
};

// Close contracts FIFO across open lots.
// sellPrice is the total proceeds for all contractsSold.
export const getAllLots = async (): Promise<Lot[]> => {
  const snapshot = await getDocs(collection(db, COLLECTION));
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Lot));
};

export const closeLotsFIFO = async (
  positionId: string,
  contractsSold: number,
  sellDate: string,
  sellPrice: number
): Promise<void> => {
  const openLots = await getOpenLots(positionId);

  // Sort by buyDate ascending — oldest lots closed first
  openLots.sort((a, b) => new Date(a.buyDate).getTime() - new Date(b.buyDate).getTime());

  let remaining = contractsSold;

  for (const lot of openLots) {
    if (remaining <= 0) break;

    const contractsFromLot = Math.min(remaining, lot.contracts);
    const lotFraction = contractsFromLot / lot.contracts;
    const allocatedCost = lotFraction * lot.costBasis;
    // Allocate proceeds proportionally to how many contracts are coming from this lot
    const allocatedProceeds = (contractsFromLot / contractsSold) * sellPrice;
    const realizedPnl = allocatedProceeds - allocatedCost;

    if (contractsFromLot === lot.contracts) {
      // Full close: update the lot in place
      await updateLot(lot.id!, {
        isOpen: false,
        sellDate,
        sellPrice: allocatedProceeds,
        contractsSold: contractsFromLot,
        realizedPnl
      });
    } else {
      // Partial close: shrink the open lot, then create a new closed lot for the sold portion
      await updateLot(lot.id!, {
        contracts: lot.contracts - contractsFromLot,
        costBasis: (1 - lotFraction) * lot.costBasis
      });
      await addLot({
        positionId,
        buyDate: lot.buyDate,
        contracts: contractsFromLot,
        costBasis: allocatedCost,
        isOpen: false,
        sellDate,
        sellPrice: allocatedProceeds,
        contractsSold: contractsFromLot,
        realizedPnl
      });
    }

    remaining -= contractsFromLot;
  }
};
