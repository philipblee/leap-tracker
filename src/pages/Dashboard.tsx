import { useState, useEffect } from 'react';
import { getAllPositions, getPositionSummaries } from '../services/positionService';
import { getAllLots } from '../services/lotService';
import { getSnapshots } from '../services/snapshotService';
import { calcPortfolioSummary, formatCurrency, formatPct } from '../utils/calculations';
import type { Snapshot } from '../types';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts';

interface PortfolioSummary {
  totalCostBasis: number;
  totalCurrentValue: number;
  unrealizedPnl: number;
  unrealizedPct: number;
  realizedPnl: number;
  realizedPct: number;
  totalPnl: number;
  totalPct: number;
}

const fmtWhole = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Math.trunc(v));

function Dashboard() {
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [chartView, setChartView] = useState<'dollar' | 'percent'>('dollar');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [positions, lots, snaps] = await Promise.all([
        getAllPositions(),   // all positions — open + closed
        getAllLots(),        // all lots across all positions
        getSnapshots()
      ]);

      // Build per-position summaries, then aggregate into portfolio totals
      const summaries = getPositionSummaries(positions, lots);
      setPortfolio(calcPortfolioSummary(summaries));
      setSnapshots(snaps);
      setLoading(false);
    };
    load();
  }, []);

  if (loading || !portfolio) return <p style={{ color: '#fff' }}>Loading...</p>;

  // Guard against null/undefined snapshot fields (old snapshots saved before lot model)
  const chartData = snapshots.map(s => ({
    date: s.date,
    'Unrealized $': parseFloat(((s.unrealizedPnl ?? 0)).toFixed(2)),
    'Realized $':   parseFloat(((s.realizedPnl   ?? 0)).toFixed(2)),
    'Total $':      parseFloat(((s.totalPnl       ?? 0)).toFixed(2)),
    'Unrealized %': parseFloat(((s.unrealizedPct  ?? 0)).toFixed(2)),
    'Realized %':   parseFloat(((s.realizedPct    ?? 0)).toFixed(2)),
    'Total %':      parseFloat(((s.totalPct        ?? 0)).toFixed(2)),
  }));

  const isDollar = chartView === 'dollar';

  return (
    <div>
      <h2 style={styles.heading}>Portfolio Summary</h2>

      {/* Summary cards */}
      <div style={styles.cards}>
        <SummaryCard
          title="Total Invested"
          value={formatCurrency(portfolio.totalCostBasis)}
        />
        <SummaryCard
          title="Current Value"
          value={formatCurrency(portfolio.totalCurrentValue)}
        />
        <SummaryCard
          title="Unrealized P&L"
          value={formatCurrency(portfolio.unrealizedPnl)}
          sub={formatPct(portfolio.unrealizedPct)}
          positive={portfolio.unrealizedPnl >= 0}
        />
        <SummaryCard
          title="Realized P&L"
          value={formatCurrency(portfolio.realizedPnl)}
          sub={formatPct(portfolio.realizedPct)}
          positive={portfolio.realizedPnl >= 0}
        />
        <SummaryCard
          title="Total P&L"
          value={formatCurrency(portfolio.totalPnl)}
          sub={formatPct(portfolio.totalPct)}
          positive={portfolio.totalPnl >= 0}
        />
      </div>

      {/* Chart */}
      <div style={styles.chartContainer}>
        <div style={styles.chartHeader}>
          <h3 style={{ color: '#fff', margin: 0 }}>Portfolio P&L Over Time</h3>
          <div style={styles.toggle}>
            <button
              style={{ ...styles.toggleBtn, backgroundColor: isDollar ? '#00d4ff' : '#2a2a3e', color: isDollar ? '#000' : '#fff' }}
              onClick={() => setChartView('dollar')}
            >$ Dollar</button>
            <button
              style={{ ...styles.toggleBtn, backgroundColor: !isDollar ? '#00d4ff' : '#2a2a3e', color: !isDollar ? '#000' : '#fff' }}
              onClick={() => setChartView('percent')}
            >% Percent</button>
          </div>
        </div>

        {chartData.length === 0 ? (
          <p style={{ color: '#aaa' }}>No snapshot data yet — chart will appear after the first daily snapshot at 4:30 pm ET.</p>
        ) : (
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="date" stroke="#aaa" />
              <YAxis stroke="#aaa" />
              <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', border: 'none' }} />
              <Legend />
              <Line type="monotone" dataKey={isDollar ? 'Unrealized $' : 'Unrealized %'} stroke="#00d4ff" dot={false} />
              <Line type="monotone" dataKey={isDollar ? 'Realized $'   : 'Realized %'}   stroke="#00ff88" dot={false} />
              <Line type="monotone" dataKey={isDollar ? 'Total $'      : 'Total %'}       stroke="#ff6b6b" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Snapshot history table */}
      {snapshots.length > 0 && (
        <div style={styles.tableContainer}>
          <h3 style={{ color: '#fff', margin: '0 0 16px 0' }}>Snapshot History</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {['Date', 'Current Value', 'Total Invested', 'Unrealized Gain', 'Realized Gain', 'Total Gain'].map(h => (
                    <th key={h} style={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...snapshots].sort((a, b) => b.date.localeCompare(a.date)).map((s, i) => (
                  <tr key={s.id ?? s.date} style={{ backgroundColor: i % 2 === 0 ? '#0f0f1a' : '#1a1a2e' }}>
                    <td style={styles.td}>{s.date}</td>
                    <td style={styles.td}>{fmtWhole(s.totalValue)}</td>
                    <td style={styles.td}>{fmtWhole(s.totalCostBasis)}</td>
                    <td style={{ ...styles.td, color: s.unrealizedPnl >= 0 ? '#00ff88' : '#ff4444' }}>{fmtWhole(s.unrealizedPnl)}</td>
                    <td style={{ ...styles.td, color: s.realizedPnl >= 0 ? '#00ff88' : '#ff4444' }}>{fmtWhole(s.realizedPnl)}</td>
                    <td style={{ ...styles.td, color: s.totalPnl >= 0 ? '#00ff88' : '#ff4444' }}>{fmtWhole(s.totalPnl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ title, value, sub, positive }: {
  title: string;
  value: string;
  sub?: string;
  positive?: boolean;
}) {
  const valueColor = positive === undefined ? '#fff' : positive ? '#00ff88' : '#ff4444';
  const subColor   = positive ? '#00ff88' : '#ff4444';
  return (
    <div style={styles.card}>
      <p style={styles.cardTitle}>{title}</p>
      <p style={{ ...styles.cardValue, color: valueColor }}>{value}</p>
      {sub !== undefined && <p style={{ ...styles.cardSub, color: subColor }}>{sub}</p>}
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  heading:       { color: '#fff', marginBottom: '20px' },
  cards:         { display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '32px' },
  card:          { backgroundColor: '#1a1a2e', padding: '20px', borderRadius: '12px', minWidth: '180px', flex: '1' },
  cardTitle:     { color: '#aaa', margin: '0 0 8px 0', fontSize: '14px' },
  cardValue:     { margin: '0', fontSize: '24px', fontWeight: 'bold' },
  cardSub:       { margin: '4px 0 0 0', fontSize: '14px' },
  chartContainer: { backgroundColor: '#1a1a2e', padding: '24px', borderRadius: '12px' },
  chartHeader:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
  toggle:        { display: 'flex', gap: '8px' },
  toggleBtn:     { padding: '8px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
  tableContainer: { backgroundColor: '#1a1a2e', padding: '24px', borderRadius: '12px', marginTop: '24px' },
  table:         { width: '100%', borderCollapse: 'collapse' },
  th:            { color: '#aaa', padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid #333', whiteSpace: 'nowrap' as const },
  td:            { padding: '10px 12px', color: '#fff', whiteSpace: 'nowrap' as const }
};

export default Dashboard;
