import { useState, useEffect } from 'react';
import { getOpenLots, closeLotsManual } from '../services/lotService';
import { updatePosition } from '../services/positionService';
import type { Lot, PositionSummary } from '../types';
import { formatCurrency } from '../utils/calculations';

interface Props {
  summary: PositionSummary;
  onClose: () => void;
  onSaved: () => void;
}

function ClosePositionModal({ summary, onClose, onSaved }: Props) {
  const { position } = summary;
  const [form, setForm] = useState({
    sellDate: new Date().toISOString().split('T')[0],
    sellPrice: '',
    contractsSold: String(summary.openContracts)
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [openLots, setOpenLots] = useState<Lot[]>([]);
  const [lotSelections, setLotSelections] = useState<Record<string, { selected: boolean; contractsToClose: number }>>({});

  useEffect(() => {
    getOpenLots(position.id!).then(lots => {
      const sorted = [...lots].sort((a, b) => new Date(a.buyDate).getTime() - new Date(b.buyDate).getTime());
      setOpenLots(sorted);
      const initial: Record<string, { selected: boolean; contractsToClose: number }> = {};
      sorted.forEach(lot => {
        initial[lot.id!] = { selected: true, contractsToClose: lot.contracts };
      });
      setLotSelections(initial);
    });
  }, [position.id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const toggleLot = (lotId: string, selected: boolean) => {
    setLotSelections(prev => ({ ...prev, [lotId]: { ...prev[lotId], selected } }));
  };

  const setLotContracts = (lotId: string, contractsToClose: number) => {
    setLotSelections(prev => ({ ...prev, [lotId]: { ...prev[lotId], contractsToClose } }));
  };

  const totalSelectedContracts = openLots.reduce((sum, lot) => {
    const sel = lotSelections[lot.id!];
    return sum + (sel?.selected ? sel.contractsToClose : 0);
  }, 0);

  const handleSubmit = async () => {
    if (!form.sellDate || !form.sellPrice || !form.contractsSold) {
      setError('All fields are required');
      return;
    }
    const contracts = Number(form.contractsSold);
    if (contracts > summary.openContracts) {
      setError(`Cannot sell more than ${summary.openContracts} open contracts`);
      return;
    }
    if (openLots.length > 0 && totalSelectedContracts !== contracts) {
      setError(`Selected lot total (${totalSelectedContracts}) must match contracts to sell (${contracts})`);
      return;
    }

    setSaving(true);
    try {
      const selections = openLots
        .filter(lot => lotSelections[lot.id!]?.selected && lotSelections[lot.id!].contractsToClose > 0)
        .map(lot => ({ lot, contractsToClose: lotSelections[lot.id!].contractsToClose }));
      await closeLotsManual(position.id!, selections, form.sellDate, Number(form.sellPrice));
      const remainingLots = await getOpenLots(position.id!);
      if (remainingLots.length === 0) {
        await updatePosition(position.id!, { isOpen: false });
      }
      onSaved();
    } catch (err) {
      setError('Error closing position');
    }
    setSaving(false);
  };

  const selectedCostBasis = openLots.reduce((sum, lot) => {
    const sel = lotSelections[lot.id!];
    if (!sel?.selected || lot.contracts === 0) return sum;
    return sum + (sel.contractsToClose / lot.contracts) * lot.costBasis;
  }, 0);

  const previewPnl = form.sellPrice && totalSelectedContracts > 0
    ? Number(form.sellPrice) - selectedCostBasis
    : null;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <h3 style={styles.title}>Close Position</h3>

        <div style={styles.summary}>
          <span style={styles.summaryItem}>{position.ticker}</span>
          <span style={styles.summaryItem}>{position.optionType}</span>
          <span style={styles.summaryItem}>Strike: ${position.strike}</span>
          <span style={styles.summaryItem}>Expiry: {position.expiry}</span>
          <span style={styles.summaryItem}>Open: {summary.openContracts} contracts</span>
          <span style={styles.summaryItem}>Cost Basis: {formatCurrency(summary.totalCostBasis)}</span>
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
            max={summary.openContracts}
          />
        </div>

        {openLots.length > 0 && (
          <div style={styles.lotsSection}>
            <div style={styles.lotsHeader}>
              <span style={styles.lotsSectionTitle}>Select Lots to Close</span>
              <span style={{ fontSize: '13px', color: totalSelectedContracts === Number(form.contractsSold) ? '#00ff88' : '#ff4444' }}>
                Total selected: {totalSelectedContracts}
              </span>
            </div>
            <div style={styles.lotsTableHeader}>
              <span />
              <span style={styles.lotColHeader}>Buy Date</span>
              <span style={styles.lotColHeader}>Buy Price</span>
              <span style={styles.lotColHeader}>Avail</span>
              <span style={styles.lotColHeader}>To Close</span>
            </div>
            {openLots.map(lot => {
              const sel = lotSelections[lot.id!];
              if (!sel) return null;
              const pricePerContract = lot.contracts > 0 ? lot.costBasis / lot.contracts : 0;
              return (
                <div key={lot.id} style={{ ...styles.lotRow, opacity: sel.selected ? 1 : 0.45 }}>
                  <input
                    type="checkbox"
                    checked={sel.selected}
                    onChange={e => toggleLot(lot.id!, e.target.checked)}
                    style={styles.checkbox}
                  />
                  <span style={styles.lotCell}>{lot.buyDate}</span>
                  <span style={styles.lotCell}>{formatCurrency(pricePerContract)}</span>
                  <span style={styles.lotCell}>{lot.contracts}</span>
                  <input
                    type="number"
                    min="0"
                    max={lot.contracts}
                    value={sel.contractsToClose}
                    onChange={e => setLotContracts(lot.id!, Number(e.target.value))}
                    disabled={!sel.selected}
                    style={styles.lotInput}
                  />
                </div>
              );
            })}
          </div>
        )}

        <div style={{ ...styles.grid, marginTop: '16px' }}>
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
    width: '640px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto'
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
    border: '1px solid #333', borderRadius: '6px', fontSize: '14px', width: '100%',
    boxSizing: 'border-box'
  },
  lotsSection: {
    backgroundColor: '#0f0f1a', borderRadius: '8px', padding: '12px', marginTop: '20px'
  },
  lotsHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px'
  },
  lotsSectionTitle: { color: '#aaa', fontSize: '13px', fontWeight: 'bold' },
  lotsTableHeader: {
    display: 'grid', gridTemplateColumns: '20px 1fr 1fr 50px 80px',
    gap: '8px', paddingBottom: '6px',
    borderBottom: '1px solid #2a2a3e', marginBottom: '6px'
  },
  lotColHeader: { color: '#555', fontSize: '11px', textTransform: 'uppercase' },
  lotRow: {
    display: 'grid', gridTemplateColumns: '20px 1fr 1fr 50px 80px',
    gap: '8px', alignItems: 'center', paddingBottom: '6px'
  },
  lotCell: { color: '#ccc', fontSize: '13px' },
  checkbox: { cursor: 'pointer', accentColor: '#00ff88' },
  lotInput: {
    padding: '4px 6px', backgroundColor: '#2a2a3e', color: '#fff',
    border: '1px solid #333', borderRadius: '4px', fontSize: '13px', width: '100%',
    boxSizing: 'border-box'
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
