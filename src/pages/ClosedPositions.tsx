import { useState, useEffect } from 'react';
import { getClosedPositions } from '../services/positionService';
import type { Position } from '../types';
import { formatCurrency, formatPct, calcRealizedPnl, calcRealizedPct, formatDate } from '../utils/calculations';

function ClosedPositions() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [accountFilter, setAccountFilter] = useState('ALL');

  useEffect(() => {
    const load = async () => {
      const data = await getClosedPositions();
      setPositions(data);
      setLoading(false);
    };
    load();
  }, []);

  const accounts = ['ALL', ...new Set(positions.map(p => p.account))];
  const filtered = accountFilter === 'ALL' ? positions : positions.filter(p => p.account === accountFilter);

  const totalRealized = filtered.reduce((sum, p) => sum + calcRealizedPnl(p), 0);

  if (loading) return <p style={{ color: '#fff' }}>Loading...</p>;

  return (
    <div>
      <div style={styles.header}>
        <h2 style={styles.heading}>Closed Positions</h2>
        <div style={styles.controls}>
          <select
            style={styles.select}
            value={accountFilter}
            onChange={e => setAccountFilter(e.target.value)}
          >
            {accounts.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {/* Total Realized P&L Banner */}
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
              {['Account','Ticker','Type','Strike','Expiry','Contracts','Cost Basis','Sell Price','Buy Date','Sell Date','Realized P&L $','Realized P&L %'].map(h => (
                <th key={h} style={styles.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => {
              const realizedPnl = calcRealizedPnl(p);
              const realizedPct = calcRealizedPct(p);

              return (
                <tr key={p.id} style={styles.tr}>
                  <td style={styles.td}>{p.account}</td>
                  <td style={styles.td}>{p.ticker}</td>
                  <td style={styles.td}>{p.optionType}</td>
                  <td style={styles.td}>${p.strike}</td>
                  <td style={styles.td}>{p.expiry}</td>
                  <td style={styles.td}>{p.contractsSold ?? p.contracts}</td>
                  <td style={styles.td}>{formatCurrency(p.costBasis)}</td>
                  <td style={styles.td}>{p.sellPrice ? formatCurrency(p.sellPrice) : '-'}</td>
                  <td style={styles.td}>{p.buyDate}</td>
                  <td style={styles.td}>{p.sellDate ? formatDate(p.sellDate) : '—'}</td>
                  <td style={{ ...styles.td, color: realizedPnl >= 0 ? '#00ff88' : '#ff4444' }}>
                    {formatCurrency(realizedPnl)}
                  </td>
                  <td style={{ ...styles.td, color: realizedPct >= 0 ? '#00ff88' : '#ff4444' }}>
                    {formatPct(realizedPct)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
  heading: { color: '#fff', margin: 0 },
  controls: { display: 'flex', gap: '12px' },
  select: { padding: '8px 12px', backgroundColor: '#2a2a3e', color: '#fff', border: 'none', borderRadius: '6px' },
  banner: {
    backgroundColor: '#1a1a2e',
    padding: '16px 20px',
    borderRadius: '10px',
    marginBottom: '20px',
    display: 'flex',
    gap: '12px',
    alignItems: 'center'
  },
  bannerLabel: { color: '#aaa', fontSize: '16px' },
  bannerValue: { fontSize: '24px', fontWeight: 'bold' },
  tableWrapper: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { backgroundColor: '#1a1a2e', color: '#aaa', padding: '12px', textAlign: 'left', borderBottom: '1px solid #333', whiteSpace: 'nowrap' },
  td: { padding: '12px', color: '#fff', borderBottom: '1px solid #222',  whiteSpace: 'nowrap' },
  tr: { backgroundColor: '#0f0f1a' }
};

export default ClosedPositions;
