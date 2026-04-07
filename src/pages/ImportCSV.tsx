import { useState } from 'react';
import {
  parseBuyCSV, parseSellCSV, parseFidelityCSV, parseFidelityClosedCSV, detectFormat
} from '../utils/csvParser';
import type { BuyImportRow, SellImportRow, ClosedImportRow } from '../utils/csvParser';
import { findOrCreatePosition, getOpenPositions } from '../services/positionService';
import { addLot, closeLotsFIFO } from '../services/lotService';
import { updatePosition } from '../services/positionService';
import { formatCurrency } from '../utils/calculations';

type ImportMode = 'buy' | 'sell';
type PreviewRow = BuyImportRow | SellImportRow | ClosedImportRow;

const normalizeDate = (date: string): string => {
  if (!date || !date.includes('/')) return date;
  const parts = date.split('/');
  return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
};

function ImportCSV() {
  const [mode, setMode] = useState<ImportMode>('buy');
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [errors, setErrors] = useState<{ row: number; message: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedResult, setSavedResult] = useState<{ positions: number; lots: number; skipped: number } | null>(null);
  const [showSkipped, setShowSkipped] = useState(false);
  const [detectedFormat, setDetectedFormat] = useState('');

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSavedResult(null);
    setShowSkipped(false);
    setPreview([]);
    setErrors([]);
    setDetectedFormat('');

    const text = await file.text();
    const headers = text.split('\n')[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const format = detectFormat(headers);
    setDetectedFormat(format);

    if (format === 'fidelity') {
      const result = await parseFidelityCSV(file);
      setPreview(result.valid);
      setErrors(result.errors);
    } else if (format === 'fidelity_closed') {
      const result = await parseFidelityClosedCSV(file);
      setPreview(result.valid);
      setErrors(result.errors);
    } else if (format === 'custom_buy' || mode === 'buy') {
      const result = await parseBuyCSV(file);
      setPreview(result.valid);
      setErrors(result.errors);
    } else {
      const result = await parseSellCSV(file);
      setPreview(result.valid as SellImportRow[]);
      setErrors(result.errors);
    }
  };

  const handleConfirm = async () => {
    setSaving(true);
    const skipped = errors.length;
    try {
      if (detectedFormat === 'fidelity_closed') {
        const rows = preview as ClosedImportRow[];
        const uniqueKeys = new Set(rows.map(r => `${r.ticker}|${r.optionType}|${r.strike}|${r.expiry}|${r.account}`));
        for (const row of rows) {
          const positionId = await findOrCreatePosition(
            row.ticker, row.optionType, row.strike, row.expiry, row.account
          );
          await addLot({
            positionId,
            buyDate: row.buyDate,
            contracts: row.contracts,
            costBasis: row.costBasis,
            isOpen: false,
            sellDate: row.sellDate,
            sellPrice: row.sellPrice,
            contractsSold: row.contractsSold,
            realizedPnl: row.realizedPnl
          });
          await updatePosition(positionId, { isOpen: false });
        }
        setSavedResult({ positions: uniqueKeys.size, lots: rows.length, skipped });
      } else if (detectedFormat === 'fidelity' || detectedFormat === 'custom_buy' || mode === 'buy') {
        const rows = preview as BuyImportRow[];
        const uniqueKeys = new Set(rows.map(r => `${r.ticker}|${r.optionType}|${r.strike}|${r.expiry}|${r.account}`));
        for (const row of rows) {
          const positionId = await findOrCreatePosition(
            row.ticker, row.optionType, row.strike, row.expiry, row.account
          );
          await addLot({
            positionId,
            buyDate: row.buyDate,
            contracts: row.contracts,
            costBasis: row.costBasis,
            isOpen: true
          });
          if (row.currentValue) {
            const perContract = row.contracts > 0 ? row.currentValue / row.contracts : 0;
            await updatePosition(positionId, { currentValue: perContract });
          }
        }
        setSavedResult({ positions: uniqueKeys.size, lots: rows.length, skipped });
      } else {
        const openPositions = await getOpenPositions();
        let closed = 0;
        for (const row of preview as SellImportRow[]) {
          const match = openPositions.find(p =>
            p.ticker === row.ticker &&
            p.optionType === row.optionType &&
            p.strike === row.strike &&
            normalizeDate(p.expiry) === normalizeDate(row.expiry)
          );
          if (!match?.id) continue;
          await closeLotsFIFO(match.id, row.contractsSold, row.sellDate, row.sellPrice);
          closed++;
        }
        setSavedResult({ positions: closed, lots: closed, skipped });
      }
      setPreview([]);
    } catch (err) {
      console.error(err);
    }
    setSaving(false);
  };

  const isFidelity = detectedFormat === 'fidelity' || detectedFormat === 'fidelity_closed';
  const isBuyMode = detectedFormat === 'fidelity' || detectedFormat === 'custom_buy' || (detectedFormat === '' && mode === 'buy');

  return (
    <div>
      <h2 style={styles.heading}>Import CSV</h2>

      {!isFidelity && (
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
      )}

      <div style={styles.formatBox}>
        <p style={styles.formatTitle}>
          {isFidelity
            ? '✅ Fidelity export detected — option positions will be imported automatically'
            : `Expected CSV columns (${mode} format):`}
        </p>
        {!isFidelity && (
          <code style={styles.code}>
            {mode === 'buy'
              ? 'ticker, type, strike, expiry, contracts, cost_basis, buy_date, account'
              : 'ticker, type, strike, expiry, contracts_sold, sell_date, sell_price, account'}
          </code>
        )}
      </div>

      <div style={styles.uploadBox}>
        <input type="file" accept=".csv" onChange={handleFile} style={styles.fileInput} />
      </div>

      {detectedFormat && (
        <div style={styles.formatBadge}>
          Detected format: <strong>{detectedFormat}</strong>
        </div>
      )}

      {errors.length > 0 && (
        <div style={styles.errorBox}>
          <p style={styles.errorTitle}>⚠️ {errors.length} row(s) with errors (will be skipped):</p>
          {errors.map((e, i) => (
            <p key={i} style={styles.errorRow}>Row {e.row}: {e.message}</p>
          ))}
        </div>
      )}

      {preview.length > 0 && (
        <div>
          <h3 style={styles.previewTitle}>
            Preview — {preview.length} row(s) ready to import
            {isFidelity && detectedFormat !== 'fidelity_closed' && (
              <span style={styles.warningBadge}> ⚠️ Buy dates set to placeholder — edit after import</span>
            )}
          </h3>
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              {detectedFormat === 'fidelity_closed' ? (
                <>
                  <thead><tr>
                    {['Ticker','Type','Strike','Expiry','Contracts','Account','Buy Date','Sell Date','Cost Basis','Proceeds','Realized P&L'].map(h => (
                      <th key={h} style={styles.th}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {(preview as ClosedImportRow[]).map((p, i) => (
                      <tr key={i} style={styles.tr}>
                        <td style={styles.td}>{p.ticker}</td>
                        <td style={styles.td}>{p.optionType}</td>
                        <td style={styles.td}>${p.strike}</td>
                        <td style={styles.td}>{p.expiry}</td>
                        <td style={styles.td}>{p.contracts}</td>
                        <td style={styles.td}>{p.account}</td>
                        <td style={{ ...styles.td, color: p.buyDate === '1900-01-01' ? '#ff9900' : '#fff' }}>
                          {p.buyDate === '1900-01-01' ? '⚠️ Not available' : p.buyDate}
                        </td>
                        <td style={styles.td}>{p.sellDate || '—'}</td>
                        <td style={styles.td}>{formatCurrency(p.costBasis)}</td>
                        <td style={styles.td}>{formatCurrency(p.sellPrice)}</td>
                        <td style={{ ...styles.td, color: p.realizedPnl >= 0 ? '#00ff88' : '#ff4444' }}>
                          {formatCurrency(p.realizedPnl)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </>
              ) : isBuyMode ? (
                <>
                  <thead><tr>
                    {['Ticker','Type','Strike','Expiry','Contracts','Cost Basis','Current Value','Account','Buy Date'].map(h => (
                      <th key={h} style={styles.th}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {(preview as BuyImportRow[]).map((p, i) => (
                      <tr key={i} style={{ ...styles.tr, backgroundColor: p.buyDate === '1900-01-01' ? '#2a1a00' : '#0f0f1a' }}>
                        <td style={styles.td}>{p.ticker}</td>
                        <td style={styles.td}>{p.optionType}</td>
                        <td style={styles.td}>${p.strike}</td>
                        <td style={styles.td}>{p.expiry}</td>
                        <td style={styles.td}>{p.contracts}</td>
                        <td style={styles.td}>{formatCurrency(p.costBasis)}</td>
                        <td style={styles.td}>{p.currentValue ? formatCurrency(p.currentValue) : '—'}</td>
                        <td style={styles.td}>{p.account}</td>
                        <td style={{ ...styles.td, color: p.buyDate === '1900-01-01' ? '#ff9900' : '#fff' }}>
                          {p.buyDate === '1900-01-01' ? '⚠️ Not available' : p.buyDate}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </>
              ) : (
                <>
                  <thead><tr>
                    {['Ticker','Type','Strike','Expiry','Contracts Sold','Sell Date','Sell Price','Account'].map(h => (
                      <th key={h} style={styles.th}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {(preview as SellImportRow[]).map((p, i) => (
                      <tr key={i} style={styles.tr}>
                        <td style={styles.td}>{p.ticker}</td>
                        <td style={styles.td}>{p.optionType}</td>
                        <td style={styles.td}>${p.strike}</td>
                        <td style={styles.td}>{p.expiry}</td>
                        <td style={styles.td}>{p.contractsSold}</td>
                        <td style={styles.td}>{p.sellDate}</td>
                        <td style={styles.td}>{formatCurrency(p.sellPrice)}</td>
                        <td style={styles.td}>{p.account}</td>
                      </tr>
                    ))}
                  </tbody>
                </>
              )}
            </table>
          </div>

          <button style={styles.confirmBtn} onClick={handleConfirm} disabled={saving}>
            {saving ? 'Saving...' : `✅ Confirm Import (${preview.length} rows)`}
          </button>
        </div>
      )}

      {savedResult && (
        <div style={styles.successBox}>
          <p style={styles.success}>
            ✅ Imported {savedResult.positions} position{savedResult.positions !== 1 ? 's' : ''}, {savedResult.lots} lot{savedResult.lots !== 1 ? 's' : ''} created.
            {savedResult.skipped > 0 && <span> {savedResult.skipped} row{savedResult.skipped !== 1 ? 's' : ''} skipped.</span>}
          </p>
          {savedResult.skipped > 0 && errors.length > 0 && (
            <div>
              <button style={styles.toggleSkippedBtn} onClick={() => setShowSkipped(v => !v)}>
                {showSkipped ? '▲ Hide skipped rows' : '▼ Show skipped rows'}
              </button>
              {showSkipped && (
                <div style={styles.skippedList}>
                  {errors.map((e, i) => (
                    <p key={i} style={styles.errorRow}>Row {e.row}: {e.message}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
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
  formatBadge: { color: '#00d4ff', marginBottom: '12px', fontSize: '14px' },
  errorBox: { backgroundColor: '#2a0000', padding: '16px', borderRadius: '8px', marginBottom: '20px' },
  errorTitle: { color: '#ff4444', margin: '0 0 8px 0', fontWeight: 'bold' },
  errorRow: { color: '#ff8888', margin: '4px 0', fontSize: '13px' },
  previewTitle: { color: '#fff', marginBottom: '12px' },
  warningBadge: { color: '#ff9900', fontSize: '13px', marginLeft: '8px' },
  tableWrapper: { overflowX: 'auto', marginBottom: '16px' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { backgroundColor: '#1a1a2e', color: '#aaa', padding: '12px', textAlign: 'left', borderBottom: '1px solid #333', whiteSpace: 'nowrap' },
  td: { padding: '12px', color: '#fff', borderBottom: '1px solid #222', whiteSpace: 'nowrap' },
  tr: { backgroundColor: '#0f0f1a' },
  confirmBtn: { padding: '12px 24px', backgroundColor: '#00ff88', color: '#000', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' },
  successBox: { marginTop: '16px' },
  success: { color: '#00ff88', fontSize: '16px', margin: '0 0 8px 0' },
  toggleSkippedBtn: { padding: '4px 10px', backgroundColor: '#2a2a3e', color: '#aaa', border: '1px solid #444', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' },
  skippedList: { backgroundColor: '#2a0000', padding: '12px', borderRadius: '6px', marginTop: '8px' }
};

export default ImportCSV;
