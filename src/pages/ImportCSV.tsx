import { useState } from 'react';
import { parseBuyCSV, parseSellCSV } from '../utils/csvParser';
import type { SellCSVRow } from '../utils/csvParser';
import { bulkAddPositions, getOpenPositions, closePosition } from '../services/positionService';
import type { Position } from '../types';
import { formatCurrency } from '../utils/calculations';

type ImportMode = 'buy' | 'sell';

function ImportCSV() {
  const [mode, setMode] = useState<ImportMode>('buy');
  const [preview, setPreview] = useState<Position[] | SellCSVRow[]>([]);
  const [errors, setErrors] = useState<{ row: number; message: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaved(false);
    setPreview([]);
    setErrors([]);

    if (mode === 'buy') {
      const result = await parseBuyCSV(file);
      setPreview(result.valid);
      setErrors(result.errors);
    } else {
      const result = await parseSellCSV(file);
      setPreview(result.valid as SellCSVRow[]);
      setErrors(result.errors);
    }
  };

  const handleConfirm = async () => {
    setSaving(true);
    try {
      if (mode === 'buy') {
        await bulkAddPositions(preview as Position[]);
      } else {
        const openPositions = await getOpenPositions();
        for (const row of preview as SellCSVRow[]) {
          const normalizeDate = (date: string) => {
            if (!date) return '';
            if (date.includes('/')) {
              const [month, day, year] = date.split('/');
              return `${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`;
            }
            return date;
          };

          const match = openPositions.find(p =>
            p.ticker === row.ticker.toUpperCase() &&
            p.optionType === row.type.toUpperCase() &&
            p.strike === Number(row.strike) &&
            normalizeDate(p.expiry) === normalizeDate(row.expiry)
          );
          if (match && match.id) {
            await closePosition(
              match.id,
              row.sell_date,
              Number(row.sell_price),
              Number(row.contracts_sold),
              match.contracts
            );
          }
        }
      }
      setSaved(true);
      setPreview([]);
    } catch (err) {
      console.error(err);
    }
    setSaving(false);
  };

  return (
    <div>
      <h2 style={styles.heading}>Import CSV</h2>

      {/* Mode Toggle */}
      <div style={styles.toggle}>
        <button
          style={{ ...styles.toggleBtn, backgroundColor: mode === 'buy' ? '#00d4ff' : '#2a2a3e', color: mode === 'buy' ? '#000' : '#fff' }}
          onClick={() => { setMode('buy'); setPreview([]); setErrors([]); }}
        >Buy / Open Positions</button>
        <button
          style={{ ...styles.toggleBtn, backgroundColor: mode === 'sell' ? '#00d4ff' : '#2a2a3e', color: mode === 'sell' ? '#000' : '#fff' }}
          onClick={() => { setMode('sell'); setPreview([]); setErrors([]); }}
        >Sell / Close Positions</button>
      </div>

      {/* CSV Format Reference */}
      <div style={styles.formatBox}>
        <p style={styles.formatTitle}>Expected CSV columns:</p>
        <code style={styles.code}>
          {mode === 'buy'
            ? 'ticker, type, strike, expiry, contracts, cost_basis, buy_date, account'
            : 'ticker, type, strike, expiry, contracts_sold, sell_date, sell_price, account'}
        </code>
      </div>

      {/* File Upload */}
      <div style={styles.uploadBox}>
        <input type="file" accept=".csv" onChange={handleFile} style={styles.fileInput} />
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div style={styles.errorBox}>
          <p style={styles.errorTitle}>⚠️ {errors.length} row(s) with errors (will be skipped):</p>
          {errors.map((e, i) => (
            <p key={i} style={styles.errorRow}>Row {e.row}: {e.message}</p>
          ))}
        </div>
      )}

      {/* Preview Table */}
      {preview.length > 0 && (
        <div>
          <h3 style={styles.previewTitle}>Preview — {preview.length} row(s) ready to import</h3>
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {mode === 'buy'
                    ? ['Ticker','Type','Strike','Expiry','Contracts','Cost Basis','Buy Date','Account'].map(h => (
                        <th key={h} style={styles.th}>{h}</th>
                      ))
                    : ['Ticker','Type','Strike','Expiry','Contracts Sold','Sell Date','Sell Price','Account'].map(h => (
                        <th key={h} style={styles.th}>{h}</th>
                      ))
                  }
                </tr>
              </thead>
              <tbody>
                {mode === 'buy'
                  ? (preview as Position[]).map((p, i) => (
                      <tr key={i} style={styles.tr}>
                        <td style={styles.td}>{p.ticker}</td>
                        <td style={styles.td}>{p.optionType}</td>
                        <td style={styles.td}>${p.strike}</td>
                        <td style={styles.td}>{p.expiry}</td>
                        <td style={styles.td}>{p.contracts}</td>
                        <td style={styles.td}>{formatCurrency(p.costBasis)}</td>
                        <td style={styles.td}>{p.buyDate}</td>
                        <td style={styles.td}>{p.account}</td>
                      </tr>
                    ))
                  : (preview as SellCSVRow[]).map((p, i) => (
                      <tr key={i} style={styles.tr}>
                        <td style={styles.td}>{p.ticker}</td>
                        <td style={styles.td}>{p.type}</td>
                        <td style={styles.td}>${p.strike}</td>
                        <td style={styles.td}>{p.expiry}</td>
                        <td style={styles.td}>{p.contracts_sold}</td>
                        <td style={styles.td}>{p.sell_date}</td>
                        <td style={styles.td}>{formatCurrency(Number(p.sell_price))}</td>
                        <td style={styles.td}>{p.account}</td>
                      </tr>
                    ))
                }
              </tbody>
            </table>
          </div>

          <button style={styles.confirmBtn} onClick={handleConfirm} disabled={saving}>
            {saving ? 'Saving...' : `✅ Confirm Import (${preview.length} rows)`}
          </button>
        </div>
      )}

      {saved && <p style={styles.success}>✅ Import successful!</p>}
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  heading: { color: '#fff', marginBottom: '20px' },
  toggle: { display: 'flex', gap: '12px', marginBottom: '20px' },
  toggleBtn: { padding: '10px 20px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' },
  formatBox: { backgroundColor: '#1a1a2e', padding: '16px', borderRadius: '8px', marginBottom: '20px' },
  formatTitle: { color: '#aaa', margin: '0 0 8px 0', fontSize: '14px' },
  code: { color: '#00d4ff', fontSize: '13px' },
  uploadBox: { backgroundColor: '#1a1a2e', padding: '24px', borderRadius: '8px', marginBottom: '20px' },
  fileInput: { color: '#fff' },
  errorBox: { backgroundColor: '#2a0000', padding: '16px', borderRadius: '8px', marginBottom: '20px' },
  errorTitle: { color: '#ff4444', margin: '0 0 8px 0', fontWeight: 'bold' },
  errorRow: { color: '#ff8888', margin: '4px 0', fontSize: '13px' },
  previewTitle: { color: '#fff', marginBottom: '12px' },
  tableWrapper: { overflowX: 'auto', marginBottom: '16px' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { backgroundColor: '#1a1a2e', color: '#aaa', padding: '12px', textAlign: 'left', borderBottom: '1px solid #333' },
  td: { padding: '12px', color: '#fff', borderBottom: '1px solid #222' },
  tr: { backgroundColor: '#0f0f1a' },
  confirmBtn: { padding: '12px 24px', backgroundColor: '#00ff88', color: '#000', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' },
  success: { color: '#00ff88', fontSize: '18px', marginTop: '16px' }
};

export default ImportCSV;
