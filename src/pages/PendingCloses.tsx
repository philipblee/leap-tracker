import { useState, useEffect } from 'react';
import { getOpenPositions, getPositionSummaries } from '../services/positionService';
import { getAllLots } from '../services/lotService';
import { getPendingCloses, deletePendingClose } from '../services/pendingCloseService';
import type { PendingClose, PositionSummary } from '../types';
import { formatCurrency } from '../utils/calculations';
import ClosePositionModal from '../components/ClosePositionModal';
import ManualMatchModal from '../components/ManualMatchModal';

function PendingCloses() {
  const [pendingCloses, setPendingCloses] = useState<PendingClose[]>([]);
  const [summaries, setSummaries] = useState<PositionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<{ pending: PendingClose; summary: PositionSummary } | null>(null);
  const [manualMatching, setManualMatching] = useState<PendingClose | null>(null);

  const load = async () => {
    const [closes, positions, lots] = await Promise.all([
      getPendingCloses(),
      getOpenPositions(),
      getAllLots()
    ]);
    setPendingCloses(closes.sort((a, b) => a.sellDate.localeCompare(b.sellDate)));
    setSummaries(getPositionSummaries(positions, lots));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDiscard = async (id: string) => {
    await deletePendingClose(id);
    load();
  };

  if (loading) return <p style={{ color: '#fff' }}>Loading...</p>;

  return (
    <div>
      <h2 style={styles.heading}>Pending Closes</h2>
      <p style={styles.subtitle}>
        Sells imported from CSV that need to be matched and executed. Click Review to open the close dialog pre-filled with sell details.
      </p>

      {pendingCloses.length === 0 ? (
        <p style={{ color: '#aaa' }}>No pending closes.</p>
      ) : (
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                {['Sell Date', 'Ticker', 'Type', 'Strike', 'Expiry', 'Account', 'Contracts', 'Sell Price', 'Source', 'Actions'].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pendingCloses.map(pc => {
                const summary = summaries.find(s => s.position.id === pc.positionId);
                return (
                  <tr key={pc.id} style={styles.tr}>
                    <td style={styles.td}>{pc.sellDate}</td>
                    <td style={styles.td}>{pc.ticker}</td>
                    <td style={styles.td}>{summary?.position.optionType ?? '—'}</td>
                    <td style={styles.td}>{pc.strike}</td>
                    <td style={styles.td}>{pc.expiry}</td>
                    <td style={styles.td}>{pc.account}</td>
                    <td style={styles.td}>{pc.contractsToClose}</td>
                    <td style={styles.td}>{formatCurrency(pc.sellPrice)}</td>
                    <td style={{ ...styles.td, color: '#555', fontSize: '12px' }}>{pc.importSource}</td>
                    <td style={styles.td} onClick={e => e.stopPropagation()}>
                      {summary && pc.positionId ? (
                        <button
                          style={styles.reviewBtn}
                          onClick={() => setReviewing({ pending: pc, summary })}
                        >
                          Review
                        </button>
                      ) : (
                        <button
                          style={styles.matchBtn}
                          onClick={() => setManualMatching(pc)}
                        >
                          Match
                        </button>
                      )}
                      <button style={styles.discardBtn} onClick={() => handleDiscard(pc.id!)}>
                        Discard
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {manualMatching && (
        <ManualMatchModal
          pending={manualMatching}
          summaries={summaries}
          onClose={() => setManualMatching(null)}
          onSaved={async () => {
            setManualMatching(null);
            load();
          }}
        />
      )}

      {reviewing && (
        <ClosePositionModal
          summary={reviewing.summary}
          prefill={{
            sellDate: reviewing.pending.sellDate,
            sellPrice: String(reviewing.pending.sellPrice),
            contractsSold: String(reviewing.pending.contractsToClose)
          }}
          onClose={() => setReviewing(null)}
          onSaved={async () => {
            await deletePendingClose(reviewing.pending.id!);
            setReviewing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  heading: { color: '#fff', marginBottom: '8px' },
  subtitle: { color: '#aaa', fontSize: '14px', marginBottom: '24px' },
  tableWrapper: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { backgroundColor: '#1a1a2e', color: '#aaa', padding: '12px', textAlign: 'left', borderBottom: '1px solid #333', whiteSpace: 'nowrap' },
  td: { padding: '12px', color: '#fff', borderBottom: '1px solid #222', whiteSpace: 'nowrap' },
  tr: { backgroundColor: '#0f0f1a' },
  reviewBtn: { padding: '4px 10px', backgroundColor: '#00d4ff', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', marginRight: '6px' },
  discardBtn: { padding: '4px 10px', backgroundColor: '#333', color: '#aaa', border: '1px solid #444', borderRadius: '4px', cursor: 'pointer' },
  matchBtn: { backgroundColor: '#b8860b', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px 10px', cursor: 'pointer', marginRight: '8px' }
};

export default PendingCloses;
