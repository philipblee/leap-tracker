import { useState, useEffect } from 'react';
import { getOpenPositions, deletePosition, closePosition } from '../services/positionService';
import type { Position } from '../types';
import { formatCurrency, formatPct } from '../utils/calculations';
import { getFunctions, httpsCallable } from 'firebase/functions';
import AddPositionModal from '../components/AddPositionModal';
import ClosePositionModal from '../components/ClosePositionModal';

function Positions() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [currentValues, setCurrentValues] = useState<{ [id: string]: number }>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [accountFilter, setAccountFilter] = useState('ALL');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);

  const load = async () => {
    const data = await getOpenPositions();
    setPositions(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    const functions = getFunctions();
    const getOptionPrice = httpsCallable(functions, 'getOptionPrice');
    const updated: { [id: string]: number } = {};

    for (const position of positions) {
      try {
        const result = await getOptionPrice({
          ticker: position.ticker,
          optionType: position.optionType,
          strike: position.strike,
          expiry: position.expiry
        }) as any;
        updated[position.id!] = result.data.currentValue * position.contracts;
      } catch {
        updated[position.id!] = position.costBasis;
      }
    }

    setCurrentValues(updated);
    setRefreshing(false);
  };

  const accounts = ['ALL', ...new Set(positions.map(p => p.account))];
  const filtered = accountFilter === 'ALL' ? positions : positions.filter(p => p.account === accountFilter);

  if (loading) return <p style={{ color: '#fff' }}>Loading...</p>;

  return (
    <div>
      <div style={styles.header}>
        <h2 style={styles.heading}>Open Positions</h2>
        <div style={styles.controls}>
          <select
            style={styles.select}
            value={accountFilter}
            onChange={e => setAccountFilter(e.target.value)}
          >
            {accounts.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <button style={styles.refreshBtn} onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? 'Refreshing...' : '🔄 Refresh Prices'}
          </button>
          <button style={styles.addBtn} onClick={() => setShowAddModal(true)}>
            + Add Position
          </button>
        </div>
      </div>

      <div style={styles.tableWrapper}>
        <table style={styles.table}>
          <thead>
            <tr>
              {['Account','Ticker','Type','Strike','Expiry','Contracts','Cost Basis','Current Value','P&L $','P&L %','Actions'].map(h => (
                <th key={h} style={styles.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => {
              const currentVal = currentValues[p.id!] ?? null;
              const pnl = currentVal !== null ? currentVal - p.costBasis : null;
              const pnlPct = currentVal !== null && p.costBasis > 0
                ? ((currentVal - p.costBasis) / p.costBasis) * 100
                : null;

              return (
                <tr key={p.id} style={styles.tr}>
                  <td style={styles.td}>{p.account}</td>
                  <td style={styles.td}>{p.ticker}</td>
                  <td style={styles.td}>{p.optionType}</td>
                  <td style={styles.td}>${p.strike}</td>
                  <td style={styles.td}>{p.expiry}</td>
                  <td style={styles.td}>{p.contracts}</td>
                  <td style={styles.td}>{formatCurrency(p.costBasis)}</td>
                  <td style={styles.td}>{currentVal !== null ? formatCurrency(currentVal) : '—'}</td>
                  <td style={{ ...styles.td, color: pnl === null ? '#fff' : pnl >= 0 ? '#00ff88' : '#ff4444' }}>
                    {pnl !== null ? formatCurrency(pnl) : '—'}
                  </td>
                  <td style={{ ...styles.td, color: pnlPct === null ? '#fff' : pnlPct >= 0 ? '#00ff88' : '#ff4444' }}>
                    {pnlPct !== null ? formatPct(pnlPct) : '—'}
                  </td>
                  <td style={styles.td}>
                    <button style={styles.closeBtn} onClick={() => setSelectedPosition(p)}>Close</button>
                    <button style={styles.deleteBtn} onClick={() => deletePosition(p.id!).then(load)}>Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showAddModal && (
        <AddPositionModal
          onClose={() => setShowAddModal(false)}
          onSaved={() => { setShowAddModal(false); load(); }}
        />
      )}

      {selectedPosition && (
        <ClosePositionModal
          position={selectedPosition}
          onClose={() => setSelectedPosition(null)}
          onSaved={() => { setSelectedPosition(null); load(); }}
        />
      )}
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
  heading: { color: '#fff', margin: 0 },
  controls: { display: 'flex', gap: '12px', alignItems: 'center' },
  select: { padding: '8px 12px', backgroundColor: '#2a2a3e', color: '#fff', border: 'none', borderRadius: '6px' },
  refreshBtn: { padding: '8px 16px', backgroundColor: '#00d4ff', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
  addBtn: { padding: '8px 16px', backgroundColor: '#00ff88', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
  tableWrapper: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { backgroundColor: '#1a1a2e', color: '#aaa', padding: '12px', textAlign: 'left', borderBottom: '1px solid #333', whiteSpace: 'nowrap' },
  td: { padding: '12px', color: '#fff', borderBottom: '1px solid #222', whiteSpace: 'nowrap' },
  tr: { backgroundColor: '#0f0f1a' },
  closeBtn: { padding: '4px 10px', backgroundColor: '#ff9900', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '6px', whiteSpace: 'nowrap' },
  deleteBtn: { padding: '4px 10px', backgroundColor: '#ff4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', whiteSpace: 'nowrap' }
};

export default Positions;
