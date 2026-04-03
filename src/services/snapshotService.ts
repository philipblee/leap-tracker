import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  limit
} from 'firebase/firestore';
import { db } from './firebase';
import type { Snapshot } from '../types';

const COLLECTION = 'snapshots';

// Get all snapshots ordered by date (for charts)
export const getSnapshots = async (): Promise<Snapshot[]> => {
  const q = query(
    collection(db, COLLECTION),
    orderBy('date', 'asc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Snapshot));
};

// Get most recent snapshot (for dashboard summary cards)
export const getLatestSnapshot = async (): Promise<Snapshot | null> => {
  const q = query(
    collection(db, COLLECTION),
    orderBy('date', 'desc'),
    limit(1)
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() } as Snapshot;
};

// Save a new snapshot
export const saveSnapshot = async (snapshot: Snapshot): Promise<string> => {
  const docRef = await addDoc(collection(db, COLLECTION), snapshot);
  return docRef.id;
};
