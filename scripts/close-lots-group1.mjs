// One-off: set isOpen: false on specific lot docs (Group 1).
// Run with: node --use-system-ca scripts/close-lots-group1.mjs
import { initializeApp } from 'firebase/app';
import { initializeFirestore, doc, getDoc, updateDoc } from 'firebase/firestore';

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

// [lotId, label, extraFields]
const updates = [
  ['ngQdQR2mR6LiznTZUUbw', 'NET  $120',  {}],
  ['sOHt4GVveqhzDq7OQ3in', 'AVGO $240',  {}],
  ['3oJsp97Otw222JhfP678', 'PLTR $100',  {}],
  ['RNsgLho1M0iNi411NzPf', 'PLTR $100',  {}],
  ['q4hrOP1mzmvSZTtvdIpw', 'PLTR $100',  {}],
  ['wxUejoMG8e8CYt4g8Sji', 'WDAY $90',   {}],
  ['oXcvOyztSYuziYHswoPe', 'DELL $140',  {}],
  ['z8AEkUtM0Beldknp0Fzw', 'DELL $140',  {}],
  ['BWzLSbWmJlxKrSaL19I9', 'NVDA $150',  {}],
  ['xAN6iD5oFFHcIB62h0Wz', 'NVDA $150',  { contracts: 1, costBasis: 5285.02 }],
];

async function main() {
  for (const [lotId, label, extra] of updates) {
    const ref = doc(db, 'lots', lotId);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      console.log(`[SKIP] ${lotId} (${label}) — document not found`);
      continue;
    }

    const before = snap.data();
    const patch = { isOpen: false, ...extra };

    // Log before
    const beforeLog = { isOpen: before.isOpen };
    if (Object.keys(extra).length) {
      for (const k of Object.keys(extra)) beforeLog[k] = before[k];
    }

    await updateDoc(ref, patch);

    // Log after
    const afterLog = { isOpen: false };
    if (Object.keys(extra).length) {
      for (const [k, v] of Object.entries(extra)) afterLog[k] = v;
    }

    console.log(`[OK] ${lotId} (${label})`);
    console.log(`     before: ${JSON.stringify(beforeLog)}`);
    console.log(`      after: ${JSON.stringify(afterLog)}`);
  }

  console.log('\nDone.');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
