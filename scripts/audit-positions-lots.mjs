// Audit positions vs lots for data integrity issues.
// Run with: node --use-system-ca scripts/audit-positions-lots.mjs
import { initializeApp } from 'firebase/app';
import { initializeFirestore, collection, getDocs } from 'firebase/firestore';
import { writeFileSync } from 'fs';

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

function escapeCSV(val) {
  const s = val == null ? '' : String(val);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function row(...cols) {
  return cols.map(escapeCSV).join(',');
}

async function main() {
  const [posSnap, lotSnap] = await Promise.all([
    getDocs(collection(db, 'positions')),
    getDocs(collection(db, 'lots')),
  ]);

  const positions = posSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const lots      = lotSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const posMap = new Map(positions.map(p => [p.id, p]));

  // Index lots by positionId
  const lotsByPosition = new Map();
  for (const lot of lots) {
    if (!lotsByPosition.has(lot.positionId)) lotsByPosition.set(lot.positionId, []);
    lotsByPosition.get(lot.positionId).push(lot);
  }

  const headers = [
    'position_id', 'ticker', 'strike', 'expiry', 'account', 'position_isOpen',
    'lot_id', 'lot_isOpen', 'lot_buyDate', 'lot_contracts', 'lot_costBasis',
    'flag',
  ];

  const csvRows = [headers.join(',')];
  const flagCounts = { OK: 0, POSITION_NO_LOTS: 0, LOT_NO_POSITION: 0, STATUS_MISMATCH: 0 };

  // --- Rows for every position ---
  for (const p of positions) {
    const posLots = lotsByPosition.get(p.id) ?? [];

    if (posLots.length === 0) {
      flagCounts.POSITION_NO_LOTS++;
      csvRows.push(row(
        p.id, p.ticker, p.strike, p.expiry, p.account, p.isOpen,
        '', '', '', '', '',
        'POSITION_NO_LOTS',
      ));
      continue;
    }

    for (const lot of posLots) {
      // STATUS_MISMATCH: position open but lot closed, or position closed but lot open
      const mismatch = p.isOpen !== lot.isOpen;
      const flag = mismatch ? 'STATUS_MISMATCH' : 'OK';
      if (mismatch) flagCounts.STATUS_MISMATCH++; else flagCounts.OK++;

      csvRows.push(row(
        p.id, p.ticker, p.strike, p.expiry, p.account, p.isOpen,
        lot.id, lot.isOpen, lot.buyDate, lot.contracts, lot.costBasis,
        flag,
      ));
    }
  }

  // --- Lots whose positionId doesn't match any position doc ---
  for (const lot of lots) {
    if (!posMap.has(lot.positionId)) {
      flagCounts.LOT_NO_POSITION++;
      csvRows.push(row(
        lot.positionId, '', '', '', '', '',
        lot.id, lot.isOpen, lot.buyDate, lot.contracts, lot.costBasis,
        'LOT_NO_POSITION',
      ));
    }
  }

  const outFile = `audit-report-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.csv`;
  writeFileSync(outFile, csvRows.join('\n'), 'utf8');

  // --- Console summary ---
  const openPositions  = positions.filter(p => p.isOpen);
  const closedPositions = positions.filter(p => !p.isOpen);
  const openLots       = lots.filter(l => l.isOpen);
  const closedLots     = lots.filter(l => !l.isOpen);

  // For open positions: how many have ≥1 open lot vs zero open lots
  let openPosWithOpenLot  = 0;
  let openPosWithNoOpenLot = 0;
  const openPosNoOpenLotDetails = [];

  for (const p of openPositions) {
    const posLots = lotsByPosition.get(p.id) ?? [];
    const hasOpenLot = posLots.some(l => l.isOpen);
    if (hasOpenLot) {
      openPosWithOpenLot++;
    } else {
      openPosWithNoOpenLot++;
      openPosNoOpenLotDetails.push(p);
    }
  }

  console.log('\n=== TOTALS ===');
  console.log(`  Total positions        : ${positions.length}  (open: ${openPositions.length}, closed: ${closedPositions.length})`);
  console.log(`  Total lots             : ${lots.length}  (open: ${openLots.length}, closed: ${closedLots.length})`);

  console.log('\n=== FLAG COUNTS ===');
  for (const [flag, count] of Object.entries(flagCounts)) {
    console.log(`  ${flag.padEnd(25)}: ${count}`);
  }

  console.log('\n=== OPEN POSITIONS BY LOT STATUS ===');
  console.log(`  Open positions with ≥1 open lot  : ${openPosWithOpenLot}`);
  console.log(`  Open positions with 0 open lots  : ${openPosWithNoOpenLot}  ← these vanish from CSV export`);

  if (openPosNoOpenLotDetails.length > 0) {
    console.log('\n  Detail (position_isOpen=true, all lots isOpen=false):');
    console.log('  ' + ['ID'.padEnd(30), 'TICKER'.padEnd(8), 'ACCOUNT'.padEnd(16), 'STRIKE'.padEnd(8), 'EXPIRY'].join('| '));
    console.log('  ' + '-'.repeat(85));
    for (const p of openPosNoOpenLotDetails) {
      const posLots = lotsByPosition.get(p.id) ?? [];
      const lotCount = posLots.length;
      console.log(
        `  ${String(p.id).padEnd(30)}| ${String(p.ticker).padEnd(8)}| ${String(p.account).padEnd(16)}| ${String(p.strike).padEnd(8)}| ${p.expiry}  (${lotCount} closed lot${lotCount !== 1 ? 's' : ''})`
      );
    }
  }

  console.log(`\n${outFile} written.\n`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
