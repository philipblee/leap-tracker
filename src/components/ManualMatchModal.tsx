import { useState } from 'react';
import { deletePendingClose } from '../services/pendingCloseService';
import type { PendingClose, PositionSummary } from '../types';
import { formatCurrency } from '../utils/calculations';
import ClosePositionModal from './ClosePositionModal';

interface ManualMatchModalProps {
  pending: PendingClose;
  summaries: PositionSummary[];
  onClose: () => void;
  onSaved: () => void;
}

function ManualMatchModal({ pending, summaries, onClose, onSaved }: ManualMatchModalProps) {
  const [selected, setSelected] = useState<PositionSummary | null>(null);
  const [confirming, setConfirming] = useState(false);

  const matches = summaries.filter(
    s => s.position.ticker.toLowerCase() === pending.ticker.toLowerCase()
  );

  const handleNotALeap = async () => {
    await deletePendingClose(pending.id!);
    onSaved();
  };

  if (confirming && selected) {
    return (
      <ClosePositionModal
        summary={selected}
        prefill={{
          sellDate: pending.sellDate,
          sellPrice: String(pending.sellPrice),
          contractsSold: String(pending.contractsToClose)
        }}
        onClose={onClose}
        onSaved={async () => {
          await deletePendingClose(pending.id!);
          onSaved();
        }}
      />
    );
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <h3 style={styles.title}>Match Pending Close</h3>

        <div style={styles.section}>
          <div style={styles.sectionLabel}>Sell Details</div>
          <div style={styles.details}>
            <span style={styles.detailItem}><span style={styles.detailKey}>Ticker:</span> {pending.ticker}</span>
            <span style={styles.detailItem}><span style={styles.detailKey}>Strike:</span> ${pending.strike}</span>
            <span style={styles.detailItem}><span style={styles.detailKey}>Expiry:</span> {pending.expiry}</span>
            <span style={styles.detailItem}><span style={styles.detailKey}>Account:</span> {pending.account}</span>
            <span style={styles.detailItem}><span style={styles.detailKey}>Contracts:</span> {pending.contractsToClose}</span>
            <span style={styles.detailItem}><span style={styles.detailKey}>Sell Price:</span> {formatCurrency(pending.sellPrice)}</span>
            <span style={styles.detailItem}><span style={styles.detailKey}>Sell Date:</span> {pending.sellDate}</span>
          </div>
        </div>

        <div style={styles.section}>
          <div style={styles.sectionLabel}>Open Positions for {pending.ticker}</div>
          {matches.length === 0 ? (
            <p style={styles.noMatches}>No open positions found for {pending.ticker}</p>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  {['Ticker', 'Type', 'Strike', 'Expiry', 'Account', 'Contracts'].map(h => (
                    <th key={h} style={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matches.map(s => {
                  const isSelected = selected?.position.id === s.position.id;
                  return (
                    <tr
                      key={s.position.id}
                      style={{ ...styles.tr, ...(isSelected ? styles.trSelected : {}) }}
                      onClick={() => setSelected(s)}
                    >
                      <td style={styles.td}>{s.position.ticker}</td>
                      <td style={styles.td}>{s.position.optionType}</td>
                      <td style={styles.td}>${s.position.strike}</td>
                      <td style={styles.td}>{s.position.expiry}</td>
                      <td style={styles.td}>{s.position.account}</td>
                      <td style={styles.td}>{s.openContracts}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div style={styles.buttons}>
          <button style={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={styles.notLeapBtn} onClick={handleNotALeap}>Not a LEAP</button>
          <button
            style={{ ...styles.confirmBtn, ...(selected ? {} : styles.confirmBtnDisabled) }}
            disabled={!selected}
            onClick={() => setConfirming(true)}
          >
            Confirm Close
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
    width: '700px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto'
  },
  title: { color: '#fff', margin: '0 0 20px 0' },
  section: { marginBottom: '24px' },
  sectionLabel: { color: '#aaa', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' },
  details: {
    display: 'flex', flexWrap: 'wrap', gap: '12px',
    backgroundColor: '#0f0f1a', padding: '12px', borderRadius: '8px'
  },
  detailItem: { color: '#ccc', fontSize: '13px' },
  detailKey: { color: '#aaa' },
  noMatches: { color: '#ff4444', fontSize: '14px', margin: '8px 0' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { backgroundColor: '#0f0f1a', color: '#aaa', padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid #333', fontSize: '13px', whiteSpace: 'nowrap' },
  td: { padding: '10px 12px', color: '#fff', borderBottom: '1px solid #1a1a2e', fontSize: '14px', whiteSpace: 'nowrap' },
  tr: { backgroundColor: '#0f0f1a', cursor: 'pointer' },
  trSelected: { backgroundColor: '#1e3a2f', outline: '1px solid #00ff88' },
  buttons: { display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' },
  cancelBtn: { padding: '10px 20px', backgroundColor: '#333', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' },
  notLeapBtn: { padding: '10px 20px', backgroundColor: '#333', color: '#ff8c00', border: '1px solid #ff8c00', borderRadius: '6px', cursor: 'pointer' },
  confirmBtn: { padding: '10px 20px', backgroundColor: '#00ff88', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
  confirmBtnDisabled: { backgroundColor: '#2a4a3a', color: '#555', cursor: 'not-allowed' }
};

export default ManualMatchModal;
