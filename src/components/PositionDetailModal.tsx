import type { Position } from '../types';
import { useState } from 'react';
import { updatePosition } from '../services/positionService';
import { formatCurrency, formatPct } from '../utils/calculations';

interface Props {
  position: Position;
  currentValue?: number;
  onClose: () => void;
  onSaved: () => void;
}

const toInputDate = (date: string): string => {
  if (!date) return '';
  // Handle MM/DD/YYYY format
  if (date.includes('/')) {
    const [month, day, year] = date.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  // Already YYYY-MM-DD
  return date;
};

function PositionDetailModal({ position, currentValue, onClose, onSaved }: Props) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
      ticker: position.ticker,
      optionType: position.optionType,
      strike: String(position.strike),
      expiry: toInputDate(position.expiry),
      contracts: String(position.contracts),
      costBasis: String(position.costBasis),
      buyDate: toInputDate(position.buyDate),
      account: position.account
    });
  const [saving, setSaving] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSave = async () => {
    setSaving(true);
    await updatePosition(position.id!, {
      ticker: form.ticker.toUpperCase(),
      optionType: form.optionType,
      strike: Number(form.strike),
      expiry: form.expiry,
      contracts: Number(form.contracts),
      costBasis: Number(form.costBasis),
      buyDate: form.buyDate,
      account: form.account
    });
    setSaving(false);
    onSaved();
  };

  const pnl = currentValue ? currentValue - position.costBasis : null;
  const pnlPct = currentValue && position.costBasis > 0
    ? ((currentValue - position.costBasis) / position.costBasis) * 100
    : null;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h3 style={styles.title}>
            {editing ? 'Edit Position' : 'Position Detail'}
          </h3>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {!editing ? (
          <div>
            <div style={styles.grid}>
              <DetailRow label="Ticker" value={position.ticker} />
              <DetailRow label="Type" value={position.optionType} />
              <DetailRow label="Strike" value={`$${position.strike}`} />
              <DetailRow label="Expiry" value={position.expiry} />
              <DetailRow label="Contracts" value={String(position.contracts)} />
              <DetailRow label="Account" value={position.account} />
              <DetailRow label="Buy Date" value={position.buyDate} />
              <DetailRow label="Cost Basis" value={formatCurrency(position.costBasis)} />
              {currentValue && <DetailRow label="Current Value" value={formatCurrency(currentValue)} />}
              {pnl !== null && (
                <DetailRow
                  label="P&L $"
                  value={formatCurrency(pnl)}
                  color={pnl >= 0 ? '#00ff88' : '#ff4444'}
                />
              )}
              {pnlPct !== null && (
                <DetailRow
                  label="P&L %"
                  value={formatPct(pnlPct)}
                  color={pnlPct >= 0 ? '#00ff88' : '#ff4444'}
                />
              )}
              {position.lastPriceDate && (
                <DetailRow label="Price Last Updated" value={position.lastPriceDate} />
              )}
            </div>
            <div style={styles.buttons}>
              <button style={styles.editBtn} onClick={() => setEditing(true)}>✏️ Edit</button>
              <button style={styles.cancelBtn} onClick={onClose}>Close</button>
            </div>
          </div>
        ) : (
          <div>
            <div style={styles.formGrid}>
              <label style={styles.label}>Ticker</label>
              <input style={styles.input} name="ticker" value={form.ticker} onChange={handleChange} />

              <label style={styles.label}>Type</label>
              <select style={styles.input} name="optionType" value={form.optionType} onChange={handleChange}>
                <option value="CALL">CALL</option>
                <option value="PUT">PUT</option>
              </select>

              <label style={styles.label}>Strike</label>
              <input style={styles.input} name="strike" value={form.strike} onChange={handleChange} type="number" />

              <label style={styles.label}>Expiry</label>
              <input style={styles.input} name="expiry" value={form.expiry} onChange={handleChange} type="date" />

              <label style={styles.label}>Contracts</label>
              <input style={styles.input} name="contracts" value={form.contracts} onChange={handleChange} type="number" />

              <label style={styles.label}>Cost Basis ($)</label>
              <input style={styles.input} name="costBasis" value={form.costBasis} onChange={handleChange} type="number" />

              <label style={styles.label}>Buy Date</label>
              <input style={styles.input} name="buyDate" value={form.buyDate} onChange={handleChange} type="date" />

              <label style={styles.label}>Account</label>
              <input style={styles.input} name="account" value={form.account} onChange={handleChange} />
            </div>
            <div style={styles.buttons}>
              <button style={styles.cancelBtn} onClick={() => setEditing(false)}>Cancel</button>
              <button style={styles.saveBtn} onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <>
      <span style={{ color: '#aaa', fontSize: '14px' }}>{label}</span>
      <span style={{ color: color ?? '#fff', fontSize: '14px', fontWeight: 'bold' }}>{value}</span>
    </>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  overlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    zIndex: 1000
  },
  modal: {
    backgroundColor: '#1a1a2e', padding: '32px', borderRadius: '16px',
    width: '480px', maxWidth: '90vw'
  },
  header: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: '24px'
  },
  title: { color: '#fff', margin: 0 },
  closeBtn: {
    background: 'none', border: 'none', color: '#aaa',
    fontSize: '20px', cursor: 'pointer'
  },
  grid: {
    display: 'grid', gridTemplateColumns: '1fr 1fr',
    gap: '12px', marginBottom: '24px'
  },
  formGrid: {
    display: 'grid', gridTemplateColumns: '1fr 2fr',
    gap: '12px', alignItems: 'center', marginBottom: '24px'
  },
  label: { color: '#aaa', fontSize: '14px' },
  input: {
    padding: '8px 12px', backgroundColor: '#2a2a3e', color: '#fff',
    border: '1px solid #333', borderRadius: '6px', fontSize: '14px', width: '100%'
  },
  buttons: { display: 'flex', gap: '12px', justifyContent: 'flex-end' },
  editBtn: {
    padding: '10px 20px', backgroundColor: '#ff9900', color: '#000',
    border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'
  },
  cancelBtn: {
    padding: '10px 20px', backgroundColor: '#333', color: '#fff',
    border: 'none', borderRadius: '6px', cursor: 'pointer'
  },
  saveBtn: {
    padding: '10px 20px', backgroundColor: '#00d4ff', color: '#000',
    border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'
  }
};

export default PositionDetailModal;
