import { useState } from 'react';
import { findOrCreatePosition } from '../services/positionService';
import { addLot } from '../services/lotService';
import type { OptionType } from '../types';

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

function AddPositionModal({ onClose, onSaved }: Props) {
  const today = new Date().toISOString().split('T')[0];

  const [form, setForm] = useState({
    ticker: localStorage.getItem('defaultTicker') ?? '',
    optionType: 'CALL' as OptionType,
    strike: localStorage.getItem('defaultStrike') ?? '',
    expiry: localStorage.getItem('defaultExpiry') ?? '2027-01-15',
    contracts: localStorage.getItem('defaultContracts') ?? '1',
    costBasis: '',
    buyDate: today,
    account: localStorage.getItem('defaultAccount') ?? 'IRA'
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = e.target.name === 'ticker' ? e.target.value.toUpperCase() : e.target.value;
    setForm(prev => ({ ...prev, [e.target.name]: value }));
  };

  const handleSubmit = async () => {
    if (!form.ticker || !form.strike || !form.expiry || !form.contracts || !form.costBasis || !form.buyDate || !form.account) {
      setError('All fields are required');
      return;
    }
    setSaving(true);
    try {
      // Find existing position for this symbol+account, or create a new one
      const positionId = await findOrCreatePosition(
        form.ticker.toUpperCase(),
        form.optionType,
        Number(form.strike),
        form.expiry,
        form.account,
        form.buyDate,
        Number(form.costBasis)
      );
      await addLot({
        positionId,
        buyDate: form.buyDate,
        contracts: Number(form.contracts),
        costBasis: Number(form.costBasis),
        isOpen: true
      });
      onSaved();
    } catch (err) {
      setError('Error saving position');
    }
    setSaving(false);
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <h3 style={styles.title}>Add Position</h3>

        {error && <p style={styles.error}>{error}</p>}

        <div style={styles.grid}>
          <label style={styles.label}>Ticker</label>
          <div style={styles.fieldRow}>
            <input style={styles.inputFlex} name="ticker" value={form.ticker} onChange={handleChange} placeholder="AAPL" />
            <button style={styles.defaultBtn} onClick={() => localStorage.setItem('defaultTicker', form.ticker)}>Set default</button>
          </div>

          <label style={styles.label}>Type</label>
          <select style={styles.input} name="optionType" value={form.optionType} onChange={handleChange}>
            <option value="CALL">CALL</option>
            <option value="PUT">PUT</option>
          </select>

          <label style={styles.label}>Strike</label>
          <div style={styles.fieldRow}>
            <input style={styles.inputFlex} name="strike" value={form.strike} onChange={handleChange} placeholder="200" type="number" />
            <button style={styles.defaultBtn} onClick={() => localStorage.setItem('defaultStrike', form.strike)}>Set default</button>
          </div>

          <label style={styles.label}>Expiry</label>
          <div style={styles.fieldRow}>
            <input style={styles.inputFlex} name="expiry" value={form.expiry} onChange={handleChange} type="date" />
            <button style={styles.defaultBtn} onClick={() => localStorage.setItem('defaultExpiry', form.expiry)}>Set default</button>
          </div>

          <label style={styles.label}>Contracts</label>
          <div style={styles.fieldRow}>
            <input style={styles.inputFlex} name="contracts" value={form.contracts} onChange={handleChange} placeholder="2" type="number" />
            <button style={styles.defaultBtn} onClick={() => localStorage.setItem('defaultContracts', form.contracts)}>Set default</button>
          </div>

          <label style={styles.label}>Cost Basis ($)</label>
          <input style={styles.input} name="costBasis" value={form.costBasis} onChange={handleChange} placeholder="1500.00" type="number" />

          <label style={styles.label}>Buy Date</label>
          <input style={styles.input} name="buyDate" value={form.buyDate} onChange={handleChange} type="date" />

          <label style={styles.label}>Account</label>
          <div style={styles.fieldRow}>
            <input style={styles.inputFlex} name="account" value={form.account} onChange={handleChange} placeholder="IRA" />
            <button style={styles.defaultBtn} onClick={() => localStorage.setItem('defaultAccount', form.account)}>Set default</button>
          </div>
        </div>

        <div style={styles.buttons}>
          <button style={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={styles.saveBtn} onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving...' : 'Save Position'}
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
  error: { color: '#ff4444', marginBottom: '12px' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px', alignItems: 'center' },
  label: { color: '#aaa', fontSize: '14px' },
  input: {
    padding: '8px 12px', backgroundColor: '#2a2a3e', color: '#fff',
    border: '1px solid #333', borderRadius: '6px', fontSize: '14px', width: '100%'
  },
  fieldRow: { display: 'flex', gap: '8px', alignItems: 'center' },
  inputFlex: {
    flex: 1, padding: '8px 12px', backgroundColor: '#2a2a3e', color: '#fff',
    border: '1px solid #333', borderRadius: '6px', fontSize: '14px', minWidth: 0
  },
  defaultBtn: {
    padding: '5px 8px', backgroundColor: 'transparent', color: '#00d4ff',
    border: '1px solid #00d4ff', borderRadius: '5px', fontSize: '11px',
    cursor: 'pointer', whiteSpace: 'nowrap' as const, flexShrink: 0
  },
  buttons: { display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' },
  cancelBtn: { padding: '10px 20px', backgroundColor: '#333', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' },
  saveBtn: { padding: '10px 20px', backgroundColor: '#00d4ff', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }
};

export default AddPositionModal;
