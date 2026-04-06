import { useState, useEffect } from 'react';
import { getAllPositions, getPositionSummaries } from '../services/positionService';
import { getAllLots } from '../services/lotService';
import type { PositionSummary } from '../types';
import { formatCurrency, formatPct, formatDate } from '../utils/calculations';
import PositionDetailModal from '../components/PositionDetailModal';

const getYear = (dateStr: string): string => {
  if (!dateStr) return '';
  if (dateStr.includes('-')) return dateStr.split('-')[0];
  if (dateStr.includes('/')) return dateStr.split('/')[2];
  return '';
};

function ClosedPositions() {
  const [summaries, setSummaries] = useState<PositionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [accountFilter, setAccountFilter] = useState('ALL');
  const [yearFilter, setYearFilter] = useState('ALL');
  const [sortColumn, setSortColumn] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [detailSummary, setDetailSummary] = useState<PositionSummary | null>(null);

  const load = async () => {
    const [positions, lots] = await Promise.all([getAllPositions(), getAllLots()]);
    const all = getPositionSummaries(positions, lots);
    setSummaries(all.filter(s => s.lots.some(l => !l.isOpen)));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const accounts = ['ALL', ...new Set(summaries.map(s => s.position.account))];
  const years = ['ALL', ...[...new Set(
    summaries
      .flatMap(s => s.lots.filter(l => !l.isOpen).map(l => getYear(l.sellDate ?? '')))
      .filter(Boolean)
  )].sort().reverse()];

  const filtered = summaries
    .filter(s => accountFilter === 'ALL' || s.position.account === accountFilter)
    .filter(s => yearFilter === 'ALL' || s.lots.some(l => !l.isOpen && getYear(l.sellDate ?? '') === yearFilter));

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sortableColumns = new Set(['Account', 'Ticker', 'Expiry', 'Cost Basis', 'Proceeds', 'Last Sell Date', 'Realized P&L $', 'Realized P&L %']);

  const sorted = [...filtered].sort((a, b) => {
    if (!sortColumn) return 0;
    const aClosedLots = a.lots.filter(l => !l.isOpen);
    const bClosedLots = b.lots.filter(l => !l.isOpen);
    let aVal: any, bVal: any;
    switch (sortColumn) {
      case 'Ticker': aVal = a.position.ticker; bVal = b.position.ticker; break;
      case 'Account': aVal = a.position.account; bVal = b.position.account; break;
      case 'Expiry': aVal = new Date(a.position.expiry).getTime(); bVal = new Date(b.position.expiry).getTime(); break;
      case 'Cost Basis':
        aVal = aClosedLots.reduce((sum, l) => sum + l.costBasis, 0);
        bVal = bClosedLots.reduce((sum, l) => sum + l.costBasis, 0);
        break;
      case 'Proceeds':
        aVal = aClosedLots.reduce((sum, l) => sum + (l.sellPrice ?? 0), 0);
        bVal = bClosedLots.reduce((sum, l) => sum + (l.sellPrice ?? 0), 0);
        break;
      case 'Last Sell Date':
        aVal = aClosedLots.map(l => l.sellDate ?? '').filter(Boolean).sort().at(-1) ?? '';
        bVal = bClosedLots.map(l => l.sellDate ?? '').filter(Boolean).sort().at(-1) ?? '';
        break;
      case 'Realized P&L $': aVal = a.realizedPnl; bVal = b.realizedPnl; break;
      case 'Realized P&L %':
        const aCost = aClosedLots.reduce((sum, l) => sum + l.costBasis, 0);
        const bCost = bClosedLots.reduce((sum, l) => sum + l.costBasis, 0);
        aVal = aCost > 0 ? (a.realizedPnl / aCost) * 100 : 0;
        bVal = bCost > 0 ? (b.realizedPnl / bCost) * 100 : 0;
        break;
      default: return 0;
    }
    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const totalRealized = filtered.reduce((sum, s) => sum + s.realizedPnl, 0);
  const totalClosedCost = filtered.reduce(
    (sum, s) => sum + s.lots.filter(l => !l.isOpen).reduce((a, l) => a + l.costBasis, 0), 0
  );
  const totalRealizedPct = totalClosedCost > 0 ? (totalRealized / totalClosedCost) * 100 : 0;
  const totalProceeds = filtered.reduce(
    (sum, s) => sum + s.lots.filter(l => !l.isOpen).reduce((a, l) => a + (l.sellPrice ?? 0), 0), 0
  );

  if (loading) return <p style={{ color: '#fff' }}>Loading...</p>;

  return (
    <div>
      <div style={styles.header}>
        <h2 style={styles.heading}>Closed Positions</h2>
        <div style={styles.controls}>
          <select style={styles.select} value={yearFilter} onChange={e => setYearFilter(e.target.value)}>
            {years.map(y => <option key={y} value={y}>{y === 'ALL' ? 'All Years' : y}</option>)}
          </select>
          <select style={styles.select} value={accountFilter} onChange={e => setAccountFilter(e.target.value)}>
            {accounts.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      <div style={styles.banner}>
        <span style={styles.bannerLabel}>Total Realized P&L:</span>
        <span style={{ ...styles.bannerValue, color: totalRealized >= 0 ? '#00ff88' : '#ff4444' }}>
          {formatCurrency(totalRealized)}
        </span>
      </div>

      <div style={styles.tableWrapper}>
        <table style={styles.table}>
          <thead>
            <tr>
              {['Account','Ticker','Type','Strike','Expiry','Contracts','Cost Basis','Proceeds','Last Sell Date','Realized P&L $','Realized P&L %'].map(h => (
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
              const closedLots = s.lots.filter(l => !l.isOpen);
              const contractsSold = closedLots.reduce((sum, l) => sum + (l.contractsSold ?? l.contracts), 0);
              const costBasis = closedLots.reduce((sum, l) => sum + l.costBasis, 0);
              const proceeds = closedLots.reduce((sum, l) => sum + (l.sellPrice ?? 0), 0);
              const lastSellDate = closedLots
                .map(l => l.sellDate ?? '')
                .filter(Boolean)
                .sort()
                .at(-1) ?? '—';
              const pct = costBasis > 0 ? (s.realizedPnl / costBasis) * 100 : 0;

              return (
                <tr key={position.id} style={{ ...styles.tr, cursor: 'pointer' }} onClick={() => setDetailSummary(s)}>
                  <td style={styles.td}>{position.account}</td>
                  <td style={styles.td}>{position.ticker}</td>
                  <td style={styles.td}>{position.optionType}</td>
                  <td style={styles.td}>${position.strike}</td>
                  <td style={styles.td}>{position.expiry}</td>
                  <td style={styles.td}>{contractsSold}</td>
                  <td style={styles.td}>{formatCurrency(costBasis)}</td>
                  <td style={styles.td}>{formatCurrency(proceeds)}</td>
                  <td style={styles.td}>{formatDate(lastSellDate)}</td>
                  <td style={{ ...styles.td, color: s.realizedPnl >= 0 ? '#00ff88' : '#ff4444' }}>
                    {formatCurrency(s.realizedPnl)}
                  </td>
                  <td style={{ ...styles.td, color: pct >= 0 ? '#00ff88' : '#ff4444' }}>
                    {formatPct(pct)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ backgroundColor: '#2a2a3e' }}>
              <td style={styles.td} colSpan={5}><strong>TOTAL</strong></td>
              <td style={styles.td}>
                <strong>
                  {filtered.reduce((sum, s) =>
                    sum + s.lots.filter(l => !l.isOpen).reduce((a, l) => a + (l.contractsSold ?? l.contracts), 0), 0
                  )}
                </strong>
              </td>
              <td style={styles.td}><strong>{formatCurrency(totalClosedCost)}</strong></td>
              <td style={styles.td}><strong>{formatCurrency(totalProceeds)}</strong></td>
              <td style={styles.td}></td>
              <td style={{ ...styles.td, color: totalRealized >= 0 ? '#00ff88' : '#ff4444' }}>
                <strong>{formatCurrency(totalRealized)}</strong>
              </td>
              <td style={{ ...styles.td, color: totalRealizedPct >= 0 ? '#00ff88' : '#ff4444' }}>
                <strong>{formatPct(totalRealizedPct)}</strong>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

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
  controls: { display: 'flex', gap: '10px', alignItems: 'center' },
  select: { padding: '8px 12px', backgroundColor: '#2a2a3e', color: '#fff', border: 'none', borderRadius: '6px' },
  banner: {
    backgroundColor: '#1a1a2e', padding: '16px 20px', borderRadius: '10px',
    marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'center'
  },
  bannerLabel: { color: '#aaa', fontSize: '16px' },
  bannerValue: { fontSize: '24px', fontWeight: 'bold' },
  tableWrapper: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { backgroundColor: '#1a1a2e', color: '#aaa', padding: '12px', textAlign: 'left', borderBottom: '1px solid #333', whiteSpace: 'nowrap' },
  td: { padding: '12px', color: '#fff', borderBottom: '1px solid #222', whiteSpace: 'nowrap' },
  tr: { backgroundColor: '#0f0f1a' }
};

export default ClosedPositions;
