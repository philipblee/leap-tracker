import { useState, useEffect } from 'react';
import { getOpenPositions, getPositionSummaries, updatePosition } from '../services/positionService';
import { getAllLots } from '../services/lotService';
import { deletePosition } from '../services/positionService';
import type { PositionSummary } from '../types';
import { formatCurrency, formatPct } from '../utils/calculations';
import { getFunctions, httpsCallable } from 'firebase/functions';
import AddPositionModal from '../components/AddPositionModal';
import ClosePositionModal from '../components/ClosePositionModal';
import PositionDetailModal from '../components/PositionDetailModal';

function Positions() {
  const [summaries, setSummaries] = useState<PositionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [accountFilter, setAccountFilter] = useState('ALL');
  const [sortColumn, setSortColumn] = useState('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedSummary, setSelectedSummary] = useState<PositionSummary | null>(null);
  const [detailSummary, setDetailSummary] = useState<PositionSummary | null>(null);

  const load = async () => {
    const [positions, lots] = await Promise.all([getOpenPositions(), getAllLots()]);
    setSummaries(getPositionSummaries(positions, lots));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    const functions = getFunctions();
    const getOptionPrice = httpsCallable(functions, 'getOptionPrice');
    const today = new Date().toISOString().split('T')[0];

    for (const s of summaries) {
      const { position } = s;
      try {
        const result = await getOptionPrice({
          ticker: position.ticker,
          optionType: position.optionType,
          strike: position.strike,
          expiry: position.expiry
        }) as any;
        // Store per-contract value (lastPrice * 100); total = currentValue * openContracts
        await updatePosition(position.id!, {
          currentValue: result.data.currentValue,
          lastPriceDate: today
        });
      } catch {
        // Leave existing price if fetch fails
      }
    }

    await load();
    setRefreshing(false);
  };

  const accounts = ['ALL', ...new Set(summaries.map(s => s.position.account))];
  const filtered = accountFilter === 'ALL' ? summaries : summaries.filter(s => s.position.account === accountFilter);

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
      case 'Ticker':       aVal = a.position.ticker;      bVal = b.position.ticker; break;
      case 'Account':      aVal = a.position.account;     bVal = b.position.account; break;
      case 'Expiry':       aVal = new Date(a.position.expiry).getTime(); bVal = new Date(b.position.expiry).getTime(); break;
      case 'Cost Basis':   aVal = a.totalCostBasis;       bVal = b.totalCostBasis; break;
      case 'Current Value': aVal = a.currentValue ?? a.totalCostBasis; bVal = b.currentValue ?? b.totalCostBasis; break;
      case 'P&L $':        aVal = a.unrealizedPnl ?? 0;   bVal = b.unrealizedPnl ?? 0; break;
      case 'P&L %':        aVal = a.unrealizedPct ?? 0;   bVal = b.unrealizedPct ?? 0; break;
      default: return 0;
    }
    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const sortableColumns = new Set(['Account', 'Ticker', 'Expiry', 'Current Value', 'Cost Basis', 'P&L $', 'P&L %']);

  if (loading) return <p style={{ color: '#fff' }}>Loading...</p>;

  const totalCurrentValue = filtered.reduce((sum, s) => sum + (s.currentValue ?? s.totalCostBasis), 0);
  const totalCostBasis = filtered.reduce((sum, s) => sum + s.totalCostBasis, 0);
  const totalPnl = totalCurrentValue - totalCostBasis;
  const totalPnlPct = totalCostBasis > 0 ? (totalPnl / totalCostBasis) * 100 : 0;

  return (
    <div>
      <div style={styles.header}>
        <h2 style={styles.heading}>Open Positions</h2>
        <div style={styles.controls}>
          <select style={styles.select} value={accountFilter} onChange={e => setAccountFilter(e.target.value)}>
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
              {['Account','Ticker','Type','Strike','Expiry','Contracts','Current Value','Cost Basis','P&L $','P&L %','Actions'].map(h => (
                <th
                  key={h}
                  style={{ ...styles.th, cursor: sortableColumns.has(h) ? 'pointer' : 'default' }}
                  onClick={() => sortableColumns.has(h) ? handleSort(h) : undefined}
                >
                  {h} {sortColumn === h ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(s => {
              const { position } = s;
              return (
                <tr key={position.id} style={{ ...styles.tr, cursor: 'pointer' }} onClick={() => setDetailSummary(s)}>
                  <td style={styles.td}>{position.account}</td>
                  <td style={styles.td}>{position.ticker}</td>
                  <td style={styles.td}>{position.optionType}</td>
                  <td style={styles.td}>${position.strike}</td>
                  <td style={styles.td}>{position.expiry}</td>
                  <td style={styles.td}>{s.openContracts}</td>
                  <td style={styles.td}>{s.currentValue != null ? formatCurrency(s.currentValue) : '—'}</td>
                  <td style={styles.td}>{formatCurrency(s.totalCostBasis)}</td>
                  <td style={{ ...styles.td, color: s.unrealizedPnl == null ? '#fff' : s.unrealizedPnl >= 0 ? '#00ff88' : '#ff4444' }}>
                    {s.unrealizedPnl != null ? formatCurrency(s.unrealizedPnl) : '—'}
                  </td>
                  <td style={{ ...styles.td, color: s.unrealizedPct == null ? '#fff' : s.unrealizedPct >= 0 ? '#00ff88' : '#ff4444' }}>
                    {s.unrealizedPct != null ? formatPct(s.unrealizedPct) : '—'}
                  </td>
                  <td style={styles.td} onClick={e => e.stopPropagation()}>
                    <button style={styles.closeBtn} onClick={() => setSelectedSummary(s)}>Close</button>
                    <button style={styles.deleteBtn} onClick={() => deletePosition(position.id!).then(load)}>Delete</button>
                  </td>
                </tr>
              );
            })}
            {/* Totals row */}
            <tr>
              <td style={styles.totalTd} colSpan={5}><strong>TOTAL</strong></td>
              <td style={styles.totalTd}><strong>{filtered.reduce((sum, s) => sum + s.openContracts, 0)}</strong></td>
              <td style={styles.totalTd}><strong>{formatCurrency(totalCurrentValue)}</strong></td>
              <td style={styles.totalTd}><strong>{formatCurrency(totalCostBasis)}</strong></td>
              <td style={{ ...styles.totalTd, color: totalPnl >= 0 ? '#00ff88' : '#ff4444' }}>
                <strong>{formatCurrency(totalPnl)}</strong>
              </td>
              <td style={{ ...styles.totalTd, color: totalPnlPct >= 0 ? '#00ff88' : '#ff4444' }}>
                <strong>{formatPct(totalPnlPct)}</strong>
              </td>
              <td style={styles.totalTd}></td>
            </tr>
          </tbody>
        </table>
      </div>

      {showAddModal && (
        <AddPositionModal
          onClose={() => setShowAddModal(false)}
          onSaved={() => { setShowAddModal(false); load(); }}
        />
      )}

      {selectedSummary && (
        <ClosePositionModal
          summary={selectedSummary}
          onClose={() => setSelectedSummary(null)}
          onSaved={() => { setSelectedSummary(null); load(); }}
        />
      )}

      {detailSummary && (
        <PositionDetailModal
          summary={detailSummary}
          onClose={() => setDetailSummary(null)}
          onSaved={() => { setDetailSummary(null); load(); }}
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
  totalTd: { padding: '12px', color: '#fff', borderBottom: '1px solid #333', borderTop: '2px solid #444', backgroundColor: '#2a2a3e', whiteSpace: 'nowrap' },
  closeBtn: { padding: '4px 10px', backgroundColor: '#ff9900', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '6px', whiteSpace: 'nowrap' },
  deleteBtn: { padding: '4px 10px', backgroundColor: '#ff4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', whiteSpace: 'nowrap' }
};

export default Positions;
