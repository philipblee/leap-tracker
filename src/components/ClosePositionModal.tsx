import { useState } from 'react';
import { closePosition } from '../services/positionService';
import type { Position } from '../types';
import { formatCurrency } from '../utils/calculations';

interface Props {
  position: Position;
  onClose: () => void;
  onSaved: () => void;
}

function ClosePositionModal({ position, onClose, onSaved }: Props) {
  const [form, setForm] = useState({
    sellDate: '',
    sellPrice: '',
    contractsSold: String(position.contracts)
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async () => {
    if (!form.sellDate || !form.sellPrice || !form.contractsSold) {
      setError('All fields are required');
      return;
    }
    if (Number(form.contractsSold) > position.contracts) {
      setError(`Cannot sell more than ${position.contracts} contracts`);
      return;
    }
    setSaving(true);
    try {
      await closePosition(
        position.id!,
        form.sellDate,
        Number(form.sellPrice),
        Number(form.contractsSold),
        position.contracts
      );
      onSaved();
    } catch (err) {
      setError('Error closing position');
    }
    setSaving(false);
  };

  const previewPnl = form.sellPrice
    ? Number(form.sellPrice) - (position.costBasis / position.contracts) * Number(form.contractsSold)
    : null;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <h3 style={styles.title}>Close Position</h3>

        {/* Position Summary */}
        <div style={styles.summary}>
          <span style={styles.summaryItem}>{position.ticker}</span>
          <span style={styles.summaryItem}>{position.optionType}</span>
          <span style={styles.summaryItem}>Strike: ${position.strike}</span>
          <span style={styles.summaryItem}>Expiry: {position.expiry}</span>
          <span style={styles.summaryItem}>Cost Basis: {formatCurrency(position.costBasis)}</span>
        </div>

        {error && <p style={styles.error}>{error}</p>}

        <div style={styles.grid}>
          <label style={styles.label}>Contracts to Sell</label>
          <input
            style={styles.input}
            name="contractsSold"
            value={form.contractsSold}
            onChange={handleChange}
            type="number"
            min="1"
            max={position.contracts}
          />

          <label style={styles.label}>Sell Price ($)</label>
          <input
            style={styles.input}
            name="sellPrice"
            value={form.sellPrice}
            onChange={handleChange}
            type="number"
            placeholder="2200.00"
          />

          <label style={styles.label}>Sell Date</label>
          <input
            style={styles.input}
            name="sellDate"
            value={form.sellDate}
            onChange={handleChange}
            type="date"
          />
        </div>

        {/* P&L Preview */}
        {previewPnl !== null && (
          <div style={styles.pnlPreview}>
            <span style={styles.pnlLabel}>Estimated Realized P&L:</span>
            <span style={{ ...styles.pnlValue, color: previewPnl >= 0 ? '#00ff88' : '#ff4444' }}>
              {formatCurrency(previewPnl)}
            </span>
          </div>
        )}

        <div style={styles.buttons}>
          <button style={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={styles.saveBtn} onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving...' : 'Close Position'}
          </button>
        </div>
      </div>
    </div>
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
  title: { color: '#fff', margin: '0 0 20px 0' },
  summary: {
    display: 'flex', flexWrap: 'wrap', gap: '12px',
    backgroundColor: '#0f0f1a', padding: '12px', borderRadius: '8px', marginBottom: '20px'
  },
  summaryItem: { color: '#aaa', fontSize: '13px' },
  error: { color: '#ff4444', marginBottom: '12px' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px', alignItems: 'center' },
  label: { color: '#aaa', fontSize: '14px' },
  input: {
    padding: '8px 12px', backgroundColor: '#2a2a3e', color: '#fff',
    border: '1px solid #333', borderRadius: '6px', fontSize: '14px', width: '100%'
  },
  pnlPreview: {
    display: 'flex', gap: '12px', alignItems: 'center',
    backgroundColor: '#0f0f1a', padding: '12px', borderRadius: '8px', marginTop: '16px'
  },
  pnlLabel: { color: '#aaa', fontSize: '14px' },
  pnlValue: { fontSize: '20px', fontWeight: 'bold' },
  buttons: { display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' },
  cancelBtn: { padding: '10px 20px', backgroundColor: '#333', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' },
  saveBtn: { padding: '10px 20px', backgroundColor: '#00ff88', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }
};

export default ClosePositionModal;
