import { collection, addDoc, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from './firebase';
import type { PendingClose } from '../types';

const COLLECTION = 'pendingCloses';

export const createPendingClose = async (
  data: Omit<PendingClose, 'id' | 'createdAt'>
): Promise<string> => {
  const docRef = await addDoc(collection(db, COLLECTION), {
    ...data,
    createdAt: new Date().toISOString()
  });
  return docRef.id;
};

export const getPendingCloses = async (): Promise<PendingClose[]> => {
  const snapshot = await getDocs(collection(db, COLLECTION));
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PendingClose));
};

export const deletePendingClose = async (id: string): Promise<void> => {
  await deleteDoc(doc(db, COLLECTION, id));
};
