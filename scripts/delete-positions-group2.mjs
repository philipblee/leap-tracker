// One-off: delete specific position docs (Group 2 — junk/phantom/no-lot closed positions).
// Run with: node --use-system-ca scripts/delete-positions-group2.mjs
// Does NOT touch any lots documents.
import { initializeApp } from 'firebase/app';
import { initializeFirestore, doc, getDoc, deleteDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDkYtAGLOJhJ7SpTcRMSTUFrybihP8eQkk",
  authDomain: "leap-tracker.firebaseapp.com",
  projectId: "leap-tracker",
  storageBucket: "leap-tracker.firebasestorage.app",
  messagingSenderId: "692325365574",
  appId: "1:692325365574:web:a73d82eaedc8f453a75747",
};

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, { experimentalForceLongPolling: true });

const targets = [
  { id: 'pfjivGFgmQAKPdgr7tI3', note: 'test/junk FAKE $100' },
  { id: 'okUAPiIzpnucgABhiZ6e', note: 'closed MGNI $14 no lots' },
  { id: 'pIINBWcswfRoVt8IB4ai', note: 'closed MGNI $15 no lots' },
  { id: 'pERT7W9X1mM0fLrwr16g', note: 'closed FSLY $17.5 no lots' },
  { id: 'LK6kiazsZJ9jY35sCDOM', note: 'phantom FSLY $15 isOpen=true zero lots' },
];

async function main() {
  for (const { id, note } of targets) {
    const ref = doc(db, 'positions', id);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      console.log(`[SKIP] ${id} — not found (${note})`);
      continue;
    }

    const d = snap.data();
    console.log(`[DELETE] ${id} (${note})`);
    console.log(`         ticker=${d.ticker}  strike=${d.strike}  expiry=${d.expiry}  account=${d.account}  isOpen=${d.isOpen}`);

    await deleteDoc(ref);
    console.log(`         deleted.`);
  }

  console.log('\nDone. No lots documents were touched.');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
