import { useState, useEffect } from 'react';
import { getOpenPositions, getClosedPositions } from '../services/positionService';
import { getSnapshots } from '../services/snapshotService';
import { calcPortfolioSummary, formatCurrency, formatPct } from '../utils/calculations';
import type { Position, Snapshot } from '../types';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts';

function Dashboard() {
  const [openPositions, setOpenPositions] = useState<Position[]>([]);
  const [closedPositions, setClosedPositions] = useState<Position[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [chartView, setChartView] = useState<'dollar' | 'percent'>('dollar');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [open, closed, snaps] = await Promise.all([
        getOpenPositions(),
        getClosedPositions(),
        getSnapshots()
      ]);
      setOpenPositions(open);
      setClosedPositions(closed);
      setSnapshots(snaps);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <p style={{ color: '#fff' }}>Loading...</p>;

  // Use latest snapshot values or calculate from positions
  const summary = calcPortfolioSummary(openPositions, closedPositions, {});

  // Chart data from snapshots
  const chartData = snapshots.map(s => ({
    date: s.date,
    'Unrealized $': parseFloat(s.unrealizedPnl.toFixed(2)),
    'Realized $': parseFloat(s.realizedPnl.toFixed(2)),
    'Total $': parseFloat(s.totalPnl.toFixed(2)),
    'Unrealized %': parseFloat(s.unrealizedPct.toFixed(2)),
    'Realized %': parseFloat(s.realizedPct.toFixed(2)),
    'Total %': parseFloat(s.totalPct.toFixed(2)),
  }));

  const isDollar = chartView === 'dollar';

  return (
    <div>
      <h2 style={styles.heading}>Portfolio Summary</h2>

      {/* Summary Cards */}
      <div style={styles.cards}>
        <SummaryCard
          title="Total Invested"
          value={formatCurrency(summary.totalCostBasis)}
        />
        <SummaryCard
          title="Current Value"
          value={formatCurrency(summary.totalCurrentValue)}
        />
        <SummaryCard
          title="Unrealized P&L"
          value={formatCurrency(summary.unrealizedPnl)}
          sub={formatPct(summary.unrealizedPct)}
          positive={summary.unrealizedPnl >= 0}
        />
        <SummaryCard
          title="Realized P&L"
          value={formatCurrency(summary.realizedPnl)}
          sub={formatPct(summary.realizedPct)}
          positive={summary.realizedPnl >= 0}
        />
        <SummaryCard
          title="Total P&L"
          value={formatCurrency(summary.totalPnl)}
          sub={formatPct(summary.totalPct)}
          positive={summary.totalPnl >= 0}
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
          <p style={{ color: '#aaa' }}>No snapshot data yet — charts will appear after the first daily snapshot at 4:30pm ET.</p>
        ) : (
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="date" stroke="#aaa" />
              <YAxis stroke="#aaa" />
              <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', border: 'none' }} />
              <Legend />
              <Line type="monotone" dataKey={isDollar ? 'Unrealized $' : 'Unrealized %'} stroke="#00d4ff" dot={false} />
              <Line type="monotone" dataKey={isDollar ? 'Realized $' : 'Realized %'} stroke="#00ff88" dot={false} />
              <Line type="monotone" dataKey={isDollar ? 'Total $' : 'Total %'} stroke="#ff6b6b" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// Summary Card Component
function SummaryCard({ title, value, sub, positive }: {
  title: string;
  value: string;
  sub?: string;
  positive?: boolean;
}) {
  return (
    <div style={styles.card}>
      <p style={styles.cardTitle}>{title}</p>
      <p style={{ ...styles.cardValue, color: positive === undefined ? '#fff' : positive ? '#00ff88' : '#ff4444' }}>
        {value}
      </p>
      {sub && <p style={{ ...styles.cardSub, color: positive ? '#00ff88' : '#ff4444' }}>{sub}</p>}
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  heading: { color: '#fff', marginBottom: '20px' },
  cards: { display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '32px' },
  card: {
    backgroundColor: '#1a1a2e',
    padding: '20px',
    borderRadius: '12px',
    minWidth: '180px',
    flex: '1'
  },
  cardTitle: { color: '#aaa', margin: '0 0 8px 0', fontSize: '14px' },
  cardValue: { margin: '0', fontSize: '24px', fontWeight: 'bold' },
  cardSub: { margin: '4px 0 0 0', fontSize: '14px' },
  chartContainer: {
    backgroundColor: '#1a1a2e',
    padding: '24px',
    borderRadius: '12px'
  },
  chartHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px'
  },
  toggle: { display: 'flex', gap: '8px' },
  toggleBtn: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 'bold'
  }
};

export default Dashboard;
