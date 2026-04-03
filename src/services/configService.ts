import {
  collection,
  getDocs,
  setDoc,
  doc
} from 'firebase/firestore';
import { db } from './firebase';

interface Config {
  pinHash: string;
  accounts: string[];
}

const COLLECTION = 'config';
const CONFIG_DOC = 'app_config';

// Get config
export const getConfig = async (): Promise<Config | null> => {
  const docRef = doc(db, COLLECTION, CONFIG_DOC);
  const collections = await getDocs(collection(db, COLLECTION));
  if (collections.empty) return null;
  const snapshot = collections.docs.find(d => d.id === CONFIG_DOC);
  if (!snapshot) return null;
  return snapshot.data() as Config;
};

// Save config (creates or overwrites)
export const saveConfig = async (config: Config): Promise<void> => {
  const docRef = doc(db, COLLECTION, CONFIG_DOC);
  await setDoc(docRef, config);
};

// Hash a PIN (simple SHA-256)
export const hashPin = async (pin: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

// Verify PIN
export const verifyPin = async (pin: string, storedHash: string): Promise<boolean> => {
  const hash = await hashPin(pin);
  return hash === storedHash;
};

// Add an account
export const addAccount = async (accountName: string): Promise<void> => {
  const config = await getConfig();
  if (!config) return;
  const updated = { ...config, accounts: [...config.accounts, accountName] };
  await saveConfig(updated);
};
