// One-off diagnostic: find open positions with zero matching lots.
// Run with: node scripts/check-orphan-positions.mjs
import { initializeApp } from 'firebase/app';
import { initializeFirestore, collection, getDocs, query, where } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDkYtAGLOJhJ7SpTcRMSTUFrybihP8eQkk",
  authDomain: "leap-tracker.firebaseapp.com",
  projectId: "leap-tracker",
  storageBucket: "leap-tracker.firebasestorage.app",
  messagingSenderId: "692325365574",
  appId: "1:692325365574:web:a73d82eaedc8f453a75747",
};

const app = initializeApp(firebaseConfig);
// experimentalForceLongPolling avoids gRPC (which has SSL cert issues on Windows Node.js)
const db = initializeFirestore(app, { experimentalForceLongPolling: true });

async function main() {
  // 1. Fetch all open positions
  const posSnap = await getDocs(query(collection(db, 'positions'), where('isOpen', '==', true)));
  const openPositions = posSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // 2. Fetch all lots
  const lotSnap = await getDocs(collection(db, 'lots'));
  const allLots = lotSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  console.log(`\nOpen positions : ${openPositions.length}`);
  console.log(`Total lots     : ${allLots.length}`);

  // 3. Build a Set of positionIds that have at least one lot
  const positionsWithLots = new Set(allLots.map(l => l.positionId));

  // 4. Find orphans
  const orphans = openPositions.filter(p => !positionsWithLots.has(p.id));

  console.log(`\nOrphans (open positions with zero lots): ${orphans.length}`);

  if (orphans.length === 0) {
    console.log('  None — every open position has at least one lot doc.');
  } else {
    console.log('\n  ID                            | TICKER | ACCT           | STRIKE | EXPIRY');
    console.log('  ' + '-'.repeat(90));
    for (const p of orphans) {
      console.log(
        `  ${String(p.id).padEnd(30)} | ${String(p.ticker).padEnd(6)} | ${String(p.account).padEnd(14)} | ${String(p.strike).padEnd(6)} | ${p.expiry}`
      );
    }
  }

  // 5. For completeness, also report open positions that have lots but all lots are closed
  const positionsWithOpenLots = new Set(
    allLots.filter(l => l.isOpen === true).map(l => l.positionId)
  );
  const noOpenLots = openPositions.filter(
    p => positionsWithLots.has(p.id) && !positionsWithOpenLots.has(p.id)
  );

  console.log(`\nOpen positions with lots but ALL lots closed: ${noOpenLots.length}`);
  if (noOpenLots.length > 0) {
    console.log('\n  ID                            | TICKER | ACCT           | STRIKE | EXPIRY');
    console.log('  ' + '-'.repeat(90));
    for (const p of noOpenLots) {
      console.log(
        `  ${String(p.id).padEnd(30)} | ${String(p.ticker).padEnd(6)} | ${String(p.account).padEnd(14)} | ${String(p.strike).padEnd(6)} | ${p.expiry}`
      );
    }
  }

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
