import { useState, useEffect } from 'react';
import { getOpenPositions, getPositionSummaries, updatePosition } from '../services/positionService';
import { getAllLots } from '../services/lotService';
import type { PositionSummary } from '../types';
import { formatCurrency, formatPct } from '../utils/calculations';
import { getFunctions, httpsCallable } from 'firebase/functions';
import AddPositionModal from '../components/AddPositionModal';
import ClosePositionModal from '../components/ClosePositionModal';
import PositionDetailModal from '../components/PositionDetailModal';
import { exportOpenPositionsCSV } from '../utils/csvExport';

function Positions() {
  const [summaries, setSummaries] = useState<PositionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [accountFilter, setAccountFilter] = useState('ALL');
  const [sortColumn, setSortColumn] = useState('Ticker');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedSummary, setSelectedSummary] = useState<PositionSummary | null>(null);
  const [detailSummary, setDetailSummary] = useState<PositionSummary | null>(null);
  const [refreshStatus, setRefreshStatus] = useState<{ succeeded: number; failed: Array<{ ticker: string; id: string }> } | null>(null);
  const [viewMode, setViewMode] = useState<'normal' | 'compact' | 'ticker'>(() =>
    (localStorage.getItem('viewMode') as 'normal' | 'compact' | 'ticker') || 'ticker'
  );
  const [expandedTickers, setExpandedTickers] = useState<Set<string>>(new Set());

  const toggleViewMode = () => {
    const next = viewMode === 'ticker' ? 'compact' : viewMode === 'compact' ? 'normal' : 'ticker';
    setViewMode(next as 'normal' | 'compact' | 'ticker');
    localStorage.setItem('viewMode', next);
  };

  const toggleTicker = (ticker: string) => {
    setExpandedTickers(prev => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  };

  const load = async () => {
    const [positions, lots] = await Promise.all([getOpenPositions(), getAllLots()]);
    setSummaries(getPositionSummaries(positions, lots));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshStatus(null);
    console.log('Refreshing', summaries.length, 'positions');
    const fns = getFunctions();
    const getOptionPrice = httpsCallable(fns, 'getOptionPrice');
    const today = new Date().toISOString().split('T')[0];

    let succeeded = 0;
    const failed: Array<{ ticker: string; id: string }> = [];

    for (const s of summaries) {
      const { position } = s;
      try {
        const result = await getOptionPrice({
          ticker: position.ticker,
          optionType: position.optionType,
          strike: position.strike,
          expiry: position.expiry
        }) as any;
          if (result.data.currentValue != null) {
            const lastPrice = result.data.lastPrice ?? 0;
            const bid = result.data.bid ?? 0;
            const price = bid > 0 ? bid : lastPrice;
            const currentValue = price * 100;

            await updatePosition(position.id!, {
              lastPrice: result.data.lastPrice,
              bid: result.data.bid,
              ask: result.data.ask,
              price,
              currentValue,
              lastPriceDate: today
            });
            succeeded++;
          } else {
          console.error('No price for', position.ticker, position.strike, result.data.error);
          failed.push({ ticker: position.ticker, id: position.id! });
        }
      } catch (err: any) {
        console.error('Failed for', position.ticker, position.strike, err.message);
        failed.push({ ticker: position.ticker, id: position.id! });
      }
    }

    await load();
    setRefreshing(false);
    const status = { succeeded, failed };
    setRefreshStatus(status);
    setTimeout(() => setRefreshStatus(null), 30000);
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
      case 'Buy Date':     aVal = a.position.buyDate ?? ''; bVal = b.position.buyDate ?? ''; break;
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

  const sortableColumns = new Set(['Account', 'Ticker', 'Expiry', 'Buy Date', 'Current Value', 'Cost Basis', 'P&L $', 'P&L %']);
  const failedIds = new Set(refreshStatus?.failed.map(f => f.id) ?? []);

  // Ticker summary groups — sorted alphabetically by ticker
  const tickerGroups = (() => {
    const map = new Map<string, PositionSummary[]>();
    for (const s of sorted) {
      const t = s.position.ticker;
      if (!map.has(t)) map.set(t, []);
      map.get(t)!.push(s);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ticker, positions]) => {
        const totalCostBasis = positions.reduce((sum, s) => sum + s.totalCostBasis, 0);
        const totalCurrentValue = positions.reduce((sum, s) => sum + (s.currentValue ?? s.totalCostBasis), 0);
        const totalPnl = totalCurrentValue - totalCostBasis;
        return {
          ticker,
          positions,
          totalContracts: positions.reduce((sum, s) => sum + s.openContracts, 0),
          totalCurrentValue,
          totalCostBasis,
          totalPnl,
          totalPnlPct: totalCostBasis > 0 ? (totalPnl / totalCostBasis) * 100 : 0,
        };
      });
  })();

  if (loading) return <p style={{ color: '#fff' }}>Loading...</p>;

  const totalCurrentValue = filtered.reduce((sum, s) => sum + (s.currentValue ?? s.totalCostBasis), 0);
  const totalCostBasis = filtered.reduce((sum, s) => sum + s.totalCostBasis, 0);
  const totalPnl = totalCurrentValue - totalCostBasis;
  const totalPnlPct = totalCostBasis > 0 ? (totalPnl / totalCostBasis) * 100 : 0;

  const viewToggleLabel = viewMode === 'ticker' ? '📱 Compact' : viewMode === 'compact' ? '📊 Normal' : '🏷️ Ticker';

  return (
    <div>
      <div style={styles.header}>
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
          <button style={styles.viewToggleBtn} onClick={toggleViewMode}>
            {viewToggleLabel}
          </button>
          <button style={styles.exportBtn} onClick={() => exportOpenPositionsCSV(filtered)}>
            Export CSV
          </button>
        </div>
        {refreshStatus && (
          <div style={styles.refreshStatus}>
            <span style={{ color: '#00ff88' }}>✅ {refreshStatus.succeeded} price{refreshStatus.succeeded !== 1 ? 's' : ''} updated</span>
            {refreshStatus.failed.length > 0 && (
              <span style={{ color: '#ff9900', marginLeft: '12px' }}>
                ⚠️ {refreshStatus.failed.length} failed: {refreshStatus.failed.map(f => f.ticker).join(', ')}
              </span>
            )}
          </div>
        )}
      </div>

      <div style={styles.tableWrapper}>
        <table style={styles.table}>
          <thead>
            <tr>
              {(viewMode === 'normal'
                ? ['Ticker','Type','Strike','Expiry','Buy Date','Qty','Current Value','Cost Basis','P&L $','P&L %','Account','Actions']
                : viewMode === 'compact'
                ? ['Position','Qty','Current Value','Cost Basis','P&L $','P&L %','Account','Actions']
                : ['Ticker','Qty','Current Value','Cost Basis','P&L $','P&L %','','']
              ).map(h => (
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
            {viewMode === 'ticker' ? (
              tickerGroups.flatMap(group => {
                const isExpanded = expandedTickers.has(group.ticker);
                const summaryRow = (
                  <tr key={`tg-${group.ticker}`}
                      style={{ ...styles.tr, backgroundColor: '#1a1a2e', cursor: 'pointer' }}
                      onClick={() => toggleTicker(group.ticker)}>
                    <td style={{ ...styles.td, fontWeight: 'bold' }}>
                      <span style={{ marginRight: '6px', fontSize: '11px', color: '#aaa' }}>{isExpanded ? '▼' : '▶'}</span>
                      {group.ticker}
                      <span style={{ color: '#888', fontWeight: 'normal', marginLeft: '8px', fontSize: '12px' }}>
                        ({group.positions.length})
                      </span>
                    </td>
                    <td style={styles.td}>{group.totalContracts}</td>
                    <td style={styles.td}>{formatCurrency(group.totalCurrentValue)}</td>
                    <td style={styles.td}>{formatCurrency(group.totalCostBasis)}</td>
                    <td style={{ ...styles.td, color: group.totalPnl >= 0 ? '#00ff88' : '#ff4444' }}>
                      {formatCurrency(group.totalPnl)}
                    </td>
                    <td style={{ ...styles.td, color: group.totalPnlPct >= 0 ? '#00ff88' : '#ff4444' }}>
                      {formatPct(group.totalPnlPct)}
                    </td>
                    <td style={styles.td}></td>
                    <td style={styles.td}></td>
                  </tr>
                );

                if (!isExpanded) return [summaryRow];

                const detailRows = group.positions.map(s => {
                  const { position } = s;
                  const hasTBD = String(position.ticker) === 'TBD' || String(position.strike) === 'TBD' || String(position.expiry) === 'TBD';
                  return (
                    <tr key={position.id}
                        style={{ ...styles.tr, cursor: 'pointer', backgroundColor: '#0a0a14' }}
                        onClick={() => setDetailSummary(s)}>
                      <td style={{ ...styles.td, paddingLeft: '28px', color: '#bbb' }}>
                        ↳ {position.optionType} ${position.strike} {position.expiry}
                        {hasTBD && <span title="Contains TBD fields — edit to fill in" style={{ marginLeft: '6px', color: '#ff9900' }}>⚠️</span>}
                      </td>
                      <td style={styles.td}>{s.openContracts}</td>
                      <td style={{ ...styles.td, color: failedIds.has(position.id!) ? '#ff9900' : '#fff' }}>
                        {s.currentValue != null ? formatCurrency(s.currentValue) : '—'}
                        {failedIds.has(position.id!) && <span style={{ marginLeft: '4px', fontSize: '10px' }} title="Last refresh failed">●</span>}
                      </td>
                      <td style={styles.td}>{formatCurrency(s.totalCostBasis)}</td>
                      <td style={{ ...styles.td, color: s.unrealizedPnl == null ? '#fff' : s.unrealizedPnl >= 0 ? '#00ff88' : '#ff4444' }}>
                        {s.unrealizedPnl != null ? formatCurrency(s.unrealizedPnl) : '—'}
                      </td>
                      <td style={{ ...styles.td, color: s.unrealizedPct == null ? '#fff' : s.unrealizedPct >= 0 ? '#00ff88' : '#ff4444' }}>
                        {s.unrealizedPct != null ? formatPct(s.unrealizedPct) : '—'}
                      </td>
                      <td style={styles.td}>{position.account}</td>
                      <td style={styles.td} onClick={e => e.stopPropagation()}>
                        <button style={styles.closeBtn} onClick={() => setSelectedSummary(s)}>Close</button>
                      </td>
                    </tr>
                  );
                });

                return [summaryRow, ...detailRows];
              })
            ) : (
              sorted.map(s => {
                const { position } = s;
                const hasTBD = String(position.ticker) === 'TBD' || String(position.strike) === 'TBD' || String(position.expiry) === 'TBD';
                return (
                  <tr key={position.id} style={{ ...styles.tr, cursor: 'pointer' }} onClick={() => setDetailSummary(s)}>
                    {viewMode === 'normal' ? (
                      <>
                        <td style={styles.td}>
                          {position.ticker}
                          {hasTBD && <span title="Contains TBD fields — edit to fill in" style={{ marginLeft: '6px', color: '#ff9900' }}>⚠️</span>}
                        </td>
                        <td style={styles.td}>{position.optionType}</td>
                        <td style={styles.td}>${position.strike}</td>
                        <td style={styles.td}>{position.expiry}</td>
                        <td style={styles.td}>{position.buyDate ?? s.lots.find(l => l.isOpen)?.buyDate ?? '—'}</td>
                      </>
                    ) : (
                      <td style={styles.td}>
                        {position.ticker} {position.optionType} ${position.strike} {position.expiry}
                        {hasTBD && <span title="Contains TBD fields — edit to fill in" style={{ marginLeft: '6px', color: '#ff9900' }}>⚠️</span>}
                      </td>
                    )}
                    <td style={styles.td}>{s.openContracts}</td>
                    <td style={{ ...styles.td, color: failedIds.has(position.id!) ? '#ff9900' : '#fff' }}>
                      {s.currentValue != null ? formatCurrency(s.currentValue) : '—'}
                      {failedIds.has(position.id!) && <span style={{ marginLeft: '4px', fontSize: '10px' }} title="Last refresh failed">●</span>}
                    </td>
                    <td style={styles.td}>{formatCurrency(s.totalCostBasis)}</td>
                    <td style={{ ...styles.td, color: s.unrealizedPnl == null ? '#fff' : s.unrealizedPnl >= 0 ? '#00ff88' : '#ff4444' }}>
                      {s.unrealizedPnl != null ? formatCurrency(s.unrealizedPnl) : '—'}
                    </td>
                    <td style={{ ...styles.td, color: s.unrealizedPct == null ? '#fff' : s.unrealizedPct >= 0 ? '#00ff88' : '#ff4444' }}>
                      {s.unrealizedPct != null ? formatPct(s.unrealizedPct) : '—'}
                    </td>
                    <td style={styles.td}>{position.account}</td>
                    <td style={styles.td} onClick={e => e.stopPropagation()}>
                      <button style={styles.closeBtn} onClick={() => setSelectedSummary(s)}>Close</button>
                    </td>
                  </tr>
                );
              })
            )}
            {/* Totals row */}
            <tr>
              <td style={styles.totalTd} colSpan={viewMode === 'normal' ? 5 : 1}><strong>TOTAL</strong></td>
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
  header: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', marginBottom: '20px' },
  heading: { color: '#fff', margin: 0 },
  controls: { display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' },
  select: { padding: '8px 12px', backgroundColor: '#2a2a3e', color: '#fff', border: 'none', borderRadius: '6px' },
  refreshBtn: { padding: '8px 16px', backgroundColor: '#00d4ff', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
  addBtn: { padding: '8px 16px', backgroundColor: '#00ff88', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
  viewToggleBtn: { padding: '8px 16px', backgroundColor: 'transparent', color: '#aaa', border: '1px solid #444', borderRadius: '6px', cursor: 'pointer' },
  exportBtn: { padding: '8px 16px', backgroundColor: 'transparent', color: '#aaa', border: '1px solid #444', borderRadius: '6px', cursor: 'pointer' },
  tableWrapper: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { backgroundColor: '#1a1a2e', color: '#aaa', padding: '12px', textAlign: 'left', borderBottom: '1px solid #333', whiteSpace: 'nowrap' },
  td: { padding: '12px', color: '#fff', borderBottom: '1px solid #222', whiteSpace: 'nowrap' },
  tr: { backgroundColor: '#0f0f1a' },
  totalTd: { padding: '12px', color: '#fff', borderBottom: '1px solid #333', borderTop: '2px solid #444', backgroundColor: '#2a2a3e', whiteSpace: 'nowrap' },
  closeBtn: { padding: '4px 10px', backgroundColor: '#ff9900', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '6px', whiteSpace: 'nowrap' },
  deleteBtn: { padding: '4px 10px', backgroundColor: '#ff4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', whiteSpace: 'nowrap' },
  refreshStatus: { fontSize: '13px', padding: '4px 0' }
};

export default Positions;