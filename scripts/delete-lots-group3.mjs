// One-off: delete orphan lot docs whose positionId points at deleted position docs (Group 3).
// Run with: node --use-system-ca scripts/delete-lots-group3.mjs
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
  '1u9IkyxSJ4zMmJR1OXR5',
  '6i8Cp4o2q9jsHRzEkYrs',
  'WKlkINWyDNqzid5ZXx2L',
  'IfTD6GkvxtL109g2301A',
  'j7boYRMxdEpxO2JTAzyk',
  'PbY8VDwgMWfr3ovlZMku',
];

async function main() {
  for (const id of targets) {
    const ref = doc(db, 'lots', id);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      console.log(`[SKIP] ${id} — not found`);
      continue;
    }

    const d = snap.data();
    console.log(`[DELETE] ${id}`);
    console.log(`         positionId=${d.positionId}  isOpen=${d.isOpen}`);

    await deleteDoc(ref);
    console.log(`         deleted.`);
  }

  console.log('\nDone.');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
