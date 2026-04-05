import { useState, useEffect } from 'react';
import { getOpenPositions, deletePosition, updatePosition } from '../services/positionService';
import type { Position } from '../types';
import { formatCurrency, formatPct } from '../utils/calculations';
import { getFunctions, httpsCallable } from 'firebase/functions';
import AddPositionModal from '../components/AddPositionModal';
import ClosePositionModal from '../components/ClosePositionModal';
import PositionDetailModal from '../components/PositionDetailModal';


function Positions() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [currentValues, setCurrentValues] = useState<{ [id: string]: number }>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [accountFilter, setAccountFilter] = useState('ALL');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [detailPosition, setDetailPosition] = useState<Position | null>(null);

  const load = async () => {
    const data = await getOpenPositions();
    setPositions(data);
    // Load stored current values from Firestore
    const storedValues: { [id: string]: number } = {};
    data.forEach(p => {
      if (p.currentValue && p.id) {
        storedValues[p.id] = p.currentValue;
      }
    });
    setCurrentValues(storedValues);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

    const [sortColumn, setSortColumn] = useState<string>('');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

    const handleRefresh = async () => {
      setRefreshing(true);
      const functions = getFunctions();
      const getOptionPrice = httpsCallable(functions, 'getOptionPrice');
      const updated: { [id: string]: number } = {};
      const today = new Date().toISOString().split('T')[0];

      for (const position of positions) {
        try {
          const result = await getOptionPrice({
            ticker: position.ticker,
            optionType: position.optionType,
            strike: position.strike,
            expiry: position.expiry
          }) as any;
          const currentVal = result.data.currentValue * position.contracts;
          updated[position.id!] = currentVal;
          // Save price back to Firestore
          await updatePosition(position.id!, {
            currentValue: currentVal,
            lastPriceDate: today
          });
        } catch {
          updated[position.id!] = position.costBasis;
        }
      }

      setCurrentValues(updated);
      setRefreshing(false);
    };

  const accounts = ['ALL', ...new Set(positions.map(p => p.account))];
  const filtered = accountFilter === 'ALL' ? positions : positions.filter(p => p.account === accountFilter);

  const handleSort = (column: string) => {
  if (sortColumn === column) {
    setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
  } else {
    setSortColumn(column);
    setSortDirection('asc');
  }
  };

  const sorted = [...filtered].sort((a, b) => {
    if (!sortColumn) return 0;
    let aVal: any, bVal: any;
    switch (sortColumn) {
      case 'Ticker': aVal = a.ticker; bVal = b.ticker; break;
      case 'Account': aVal = a.account; bVal = b.account; break;
      case 'Buy Date': aVal = new Date(a.buyDate).getTime(); bVal = new Date(b.buyDate).getTime(); break;
      case 'Expiry': aVal = new Date(a.expiry).getTime(); bVal = new Date(b.expiry).getTime(); break;
      case 'P&L $':
        aVal = (currentValues[a.id!] ?? a.costBasis) - a.costBasis;
        bVal = (currentValues[b.id!] ?? b.costBasis) - b.costBasis;
        break;
      case 'Cost Basis': aVal = a.costBasis; bVal = b.costBasis; break;
      case 'Current Value':
        aVal = currentValues[a.id!] ?? a.costBasis;
        bVal = currentValues[b.id!] ?? b.costBasis;
        break;
      case 'P&L %':
        aVal = a.costBasis > 0 ? ((currentValues[a.id!] ?? a.costBasis) - a.costBasis) / a.costBasis : 0;
        bVal = b.costBasis > 0 ? ((currentValues[b.id!] ?? b.costBasis) - b.costBasis) / b.costBasis : 0;
        break;
      default: return 0;
      }
    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
    });

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
              {['Account','Ticker','Type','Strike','Expiry','Buy Date','Contracts','Current Value','Cost Basis','P&L $','P&L %','Actions'].map(h => (
                <th key={h} style={{ ...styles.th, cursor: ['Account','Ticker','Expiry','Buy Date','Current Value','Cost Basis','P&L $', 'P&L %'].includes(h) ? 'pointer' : 'default' }}
                  onClick={() => ['Account','Ticker','Expiry','Buy Date','Current Value','Cost Basis','P&L $','P&L %'].includes(h) ? handleSort(h) : null}>
                  {h} {sortColumn === h ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(p => {
              const currentVal = currentValues[p.id!] ?? null;
              const pnl = currentVal !== null ? currentVal - p.costBasis : null;
              const pnlPct = currentVal !== null && p.costBasis > 0
                ? ((currentVal - p.costBasis) / p.costBasis) * 100
                : null;

              return (
                <tr key={p.id} style={{ ...styles.tr, cursor: 'pointer' }} onClick={() => setDetailPosition(p)}>
                  <td style={styles.td}>{p.account}</td>
                  <td style={styles.td}>{p.ticker}</td>
                  <td style={styles.td}>{p.optionType}</td>
                  <td style={styles.td}>${p.strike}</td>
                  <td style={styles.td}>{p.expiry}</td>
                  <td style={styles.td}>{p.buyDate}</td>
                  <td style={styles.td}>{p.contracts}</td>
                  <td style={styles.td}>{currentVal !== null ? formatCurrency(currentVal) : '—'}</td>
                  <td style={styles.td}>{formatCurrency(p.costBasis)}</td>
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
          <tfoot>
            <tr style={{ backgroundColor: '#2a2a3e' }}>
              <td style={styles.td} colSpan={6}><strong>TOTAL</strong></td>
              <td style={styles.td}>
                <strong>
                  {filtered.reduce((sum, p) => sum + p.contracts, 0)}
                </strong>
              </td>
              <td style={styles.td}>
                <strong>
                  {formatCurrency(filtered.reduce((sum, p) => sum + (currentValues[p.id!] ?? p.costBasis), 0))}
                </strong>
              </td>
              <td style={styles.td}>
                <strong>
                  {formatCurrency(filtered.reduce((sum, p) => sum + p.costBasis, 0))}
                </strong>
              </td>
              <td style={{ ...styles.td, color: filtered.reduce((sum, p) => sum + ((currentValues[p.id!] ?? p.costBasis) - p.costBasis), 0) >= 0 ? '#00ff88' : '#ff4444' }}>
                <strong>
                  {formatCurrency(filtered.reduce((sum, p) => sum + ((currentValues[p.id!] ?? p.costBasis) - p.costBasis), 0))}
                </strong>
              </td>
              <td style={{ ...styles.td, color: (() => {
                const totalCost = filtered.reduce((sum, p) => sum + p.costBasis, 0);
                const totalVal = filtered.reduce((sum, p) => sum + (currentValues[p.id!] ?? p.costBasis), 0);
                return totalCost > 0 ? ((totalVal - totalCost) / totalCost) * 100 : 0;
              })() >= 0 ? '#00ff88' : '#ff4444' }}>
                <strong>
                  {formatPct((() => {
                    const totalCost = filtered.reduce((sum, p) => sum + p.costBasis, 0);
                    const totalVal = filtered.reduce((sum, p) => sum + (currentValues[p.id!] ?? p.costBasis), 0);
                    return totalCost > 0 ? ((totalVal - totalCost) / totalCost) * 100 : 0;
                  })())}
                </strong>
              </td>
              <td style={styles.td}></td>
            </tr>
          </tfoot>
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
      {detailPosition && (
        <PositionDetailModal
          position={detailPosition}
          currentValue={currentValues[detailPosition.id!]}
          onClose={() => setDetailPosition(null)}
          onSaved={() => { setDetailPosition(null); load(); }}
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
