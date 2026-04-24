import React, { useState } from 'react';
import { updatePosition, deletePosition } from '../services/positionService';
import { formatCurrency, formatPct, formatDate } from '../utils/calculations';
import type { Lot, PositionSummary } from '../types';
import { updateLot, deleteLot } from '../services/lotService';

interface Props {
  summary: PositionSummary;
  onClose: () => void;
  onSaved: () => void;
}

const toInputDate = (date: string): string => {
  if (!date) return '';
  if (date.includes('/')) {
    const [month, day, year] = date.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return date;
};

interface LotForm {
  buyDate: string;
  contracts: string;
  costBasis: string;
}

const getPriceDateColor = (lastPriceDate?: string): string => {
  if (!lastPriceDate) return '#ff4444';
  const diffDays = Math.floor((Date.now() - new Date(lastPriceDate).getTime()) / 86400000);
  if (diffDays === 0) return '#00ff88';
  if (diffDays <= 7) return '#ffcc00';
  return '#ff4444';
};

function PositionDetailModal({ summary, onClose, onSaved }: Props) {
  const { position } = summary;

  // Local lot state so edits reflect immediately without closing the modal
  const [localLots, setLocalLots] = useState<Lot[]>(summary.lots);
  const openLots = localLots.filter(l => l.isOpen);
  const closedLots = localLots.filter(l => !l.isOpen);

  // Position edit state
  const [editingPosition, setEditingPosition] = useState(false);
  const [posForm, setPosForm] = useState({
    ticker: position.ticker,
    optionType: position.optionType,
    strike: String(position.strike),
    expiry: toInputDate(position.expiry),
    account: position.account
  });
  const [savingPosition, setSavingPosition] = useState(false);

  // Lot edit state — only one lot editable at a time
  const [editingLotId, setEditingLotId] = useState<string | null>(null);
  const [lotForm, setLotForm] = useState<LotForm>({ buyDate: '', contracts: '', costBasis: '' });
  const [savingLot, setSavingLot] = useState(false);

  const handlePosChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = e.target.name === 'ticker' ? e.target.value.toUpperCase() : e.target.value;
    setPosForm(prev => ({ ...prev, [e.target.name]: value }));
  };

  const handleSavePosition = async () => {
    setSavingPosition(true);
    await updatePosition(position.id!, {
      ticker: posForm.ticker.toUpperCase(),
      optionType: posForm.optionType as 'CALL' | 'PUT',
      strike: Number(posForm.strike),
      expiry: posForm.expiry,
      account: posForm.account
    });
    setSavingPosition(false);
    onSaved();
  };

  const startEditLot = (lot: Lot) => {
    setEditingLotId(lot.id!);
    setLotForm({
      buyDate: toInputDate(lot.buyDate),
      contracts: String(lot.isOpen ? lot.contracts : (lot.contractsSold ?? lot.contracts)),
      costBasis: String(lot.costBasis)
    });
  };

  const cancelEditLot = () => setEditingLotId(null);

  const handleLotFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLotForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const saveEditLot = async (lot: Lot) => {
    setSavingLot(true);
    const newContracts = Number(lotForm.contracts);
    const newCostBasis = Number(lotForm.costBasis);
    const updates: Partial<Lot> = {
      buyDate: lotForm.buyDate,
      costBasis: newCostBasis,
      ...(lot.isOpen
        ? { contracts: newContracts }
        : {
            contractsSold: newContracts,
            contracts: newContracts,
            // Recalculate realized P&L when cost basis changes on a closed lot
            ...(lot.sellPrice != null ? { realizedPnl: lot.sellPrice - newCostBasis } : {})
          }
      )
    };
    await updateLot(lot.id!, updates);
    setLocalLots(prev => prev.map(l => l.id === lot.id ? { ...l, ...updates } : l));
    setEditingLotId(null);
    setSavingLot(false);
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h3 style={styles.title}>{editingPosition ? 'Edit Position' : 'Position Detail'}</h3>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {!editingPosition ? (
          <>
            {/* Position identity summary */}
            <div style={styles.grid}>
              <DetailRow label="Ticker" value={position.ticker} />
              <DetailRow label="Type" value={position.optionType} />
              <DetailRow label="Strike" value={`$${position.strike}`} />
              <DetailRow label="Expiry" value={position.expiry} />
              <DetailRow label="Account" value={position.account} />
              <DetailRow label="Open Contracts" value={String(summary.openContracts)} />
              <DetailRow label="Cost Basis" value={formatCurrency(summary.totalCostBasis)} />
              {summary.currentValue != null && (
                <DetailRow label="Current Value" value={formatCurrency(summary.currentValue)} />
              )}
              {summary.unrealizedPnl != null && summary.unrealizedPct != null && (
                <DetailRow
                  label="Unrealized P&L"
                  value={`${formatCurrency(summary.unrealizedPnl)} (${formatPct(summary.unrealizedPct)})`}
                  color={summary.unrealizedPnl >= 0 ? '#00ff88' : '#ff4444'}
                />
              )}
              {summary.realizedPnl !== 0 && (
                <DetailRow
                  label="Realized P&L"
                  value={formatCurrency(summary.realizedPnl)}
                  color={summary.realizedPnl >= 0 ? '#00ff88' : '#ff4444'}
                />
              )}
              {position.lastPriceDate ? (
                <DetailRow
                  label="Price Last Updated"
                  value={position.lastPriceDate}
                  indicator={<span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: getPriceDateColor(position.lastPriceDate), flexShrink: 0 }} title="Price freshness" />}
                />
              ) : (
                <DetailRow label="Price Last Updated" value="Never" color="#ff4444" />
              )}
              {summary.currentValue == null && (
                <DetailRow label="Price Status" value="⚠️ Last fetch failed" color="#ff9900" />
              )}
              {position.lastPrice != null && (
                <DetailRow label="Last Price" value={formatCurrency(position.lastPrice)} />
              )}
              {position.bid != null && (
                <DetailRow label="Bid" value={formatCurrency(position.bid)} />
              )}
              {position.ask != null && (
                <DetailRow label="Ask" value={formatCurrency(position.ask)} />
              )}
              {position.price != null && (
                <DetailRow label="Price (used)" value={formatCurrency(position.price)} color="#00d4ff" />
              )}
            </div>

            {/* Open lots */}
            {openLots.length > 0 && (
              <div style={styles.lotsSection}>
                <p style={styles.lotsTitle}>Open Lots</p>
                <table style={styles.lotsTable}>
                  <thead>
                    <tr>
                      <th style={styles.lotTh}>Buy Date</th>
                      <th style={styles.lotTh}>Contracts</th>
                      <th style={styles.lotTh}>Cost Basis</th>
                      <th style={styles.lotTh}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {openLots.map(lot => (
                      editingLotId === lot.id ? (
                        <tr key={lot.id} style={{ backgroundColor: '#1e2a3a' }}>
                          <td style={styles.lotTd}>
                            <input style={styles.lotInput} name="buyDate" type="date" value={lotForm.buyDate} onChange={handleLotFormChange} />
                          </td>
                          <td style={styles.lotTd}>
                            <input style={styles.lotInput} name="contracts" type="number" value={lotForm.contracts} onChange={handleLotFormChange} />
                          </td>
                          <td style={styles.lotTd}>
                            <input style={styles.lotInput} name="costBasis" type="number" value={lotForm.costBasis} onChange={handleLotFormChange} />
                          </td>
                          <td style={styles.lotTd}>
                            <button style={styles.lotSaveBtn} onClick={() => saveEditLot(lot)} disabled={savingLot}>
                              {savingLot ? '…' : '✓'}
                            </button>
                            <button style={styles.lotCancelBtn} onClick={cancelEditLot}>✕</button>
                          </td>
                        </tr>
                      ) : (
                        <tr key={lot.id}>
                          <td style={styles.lotTd}>{lot.buyDate === '1900-01-01' ? '⚠️ Unknown' : formatDate(lot.buyDate)}</td>
                          <td style={styles.lotTd}>{lot.contracts}</td>
                          <td style={styles.lotTd}>{formatCurrency(lot.costBasis)}</td>
                          <td style={styles.lotTd}>
                            <button style={styles.lotEditBtn} onClick={() => startEditLot(lot)}>Edit</button>
                          </td>
                        </tr>
                      )
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Closed lots */}
            {closedLots.length > 0 && (
              <div style={styles.lotsSection}>
                <p style={styles.lotsTitle}>Closed Lots</p>
                <table style={styles.lotsTable}>
                  <thead>
                    <tr>
                      <th style={styles.lotTh}>Buy Date</th>
                      <th style={styles.lotTh}>Sell Date</th>
                      <th style={styles.lotTh}>Contracts</th>
                      <th style={styles.lotTh}>Cost Basis</th>
                      <th style={styles.lotTh}>Proceeds</th>
                      <th style={styles.lotTh}>Realized P&L</th>
                      <th style={styles.lotTh}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {closedLots.map(lot => (
                      editingLotId === lot.id ? (
                        <tr key={lot.id} style={{ backgroundColor: '#1e2a3a' }}>
                          <td style={styles.lotTd}>
                            <input style={styles.lotInput} name="buyDate" type="date" value={lotForm.buyDate} onChange={handleLotFormChange} />
                          </td>
                          <td style={styles.lotTd}>{lot.sellDate ? formatDate(lot.sellDate) : '—'}</td>
                          <td style={styles.lotTd}>
                            <input style={styles.lotInput} name="contracts" type="number" value={lotForm.contracts} onChange={handleLotFormChange} />
                          </td>
                          <td style={styles.lotTd}>
                            <input style={styles.lotInput} name="costBasis" type="number" value={lotForm.costBasis} onChange={handleLotFormChange} />
                          </td>
                          <td style={styles.lotTd}>{lot.sellPrice != null ? formatCurrency(lot.sellPrice) : '—'}</td>
                          <td style={styles.lotTd}>
                            {lot.sellPrice != null
                              ? formatCurrency(lot.sellPrice - Number(lotForm.costBasis))
                              : '—'}
                          </td>
                          <td style={styles.lotTd}>
                            <button style={styles.lotSaveBtn} onClick={() => saveEditLot(lot)} disabled={savingLot}>
                              {savingLot ? '…' : '✓'}
                            </button>
                            <button style={styles.lotCancelBtn} onClick={cancelEditLot}>✕</button>
                          </td>
                        </tr>
                      ) : (
                        <tr key={lot.id}>
                          <td style={styles.lotTd}>{lot.buyDate === '1900-01-01' ? '⚠️ Unknown' : formatDate(lot.buyDate)}</td>
                          <td style={styles.lotTd}>{lot.sellDate ? formatDate(lot.sellDate) : '—'}</td>
                          <td style={styles.lotTd}>{lot.contractsSold ?? lot.contracts}</td>
                          <td style={styles.lotTd}>{formatCurrency(lot.costBasis)}</td>
                          <td style={styles.lotTd}>{lot.sellPrice != null ? formatCurrency(lot.sellPrice) : '—'}</td>
                          <td style={{ ...styles.lotTd, color: (lot.realizedPnl ?? 0) >= 0 ? '#00ff88' : '#ff4444' }}>
                            {lot.realizedPnl != null ? formatCurrency(lot.realizedPnl) : '—'}
                          </td>
                          <td style={styles.lotTd}>
                            <button style={styles.lotEditBtn} onClick={() => startEditLot(lot)}>Edit</button>
                            <button style={{ ...styles.lotCancelBtn, marginLeft: '4px', backgroundColor: '#ff4444' }}
                              onClick={async () => {
                                if (confirm(`Delete this closed lot?`)) {
                                  await deleteLot(lot.id!);
                                  setLocalLots(prev => prev.filter(l => l.id !== lot.id));
                                  onSaved(); // add this line
                                }
                              }}>Delete</button>
                          </td>
                        </tr>
                      )
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={styles.buttons}>
              <button style={styles.editBtn} onClick={() => setEditingPosition(true)}>✏️ Edit Position</button>
              <button style={styles.cancelBtn} onClick={onClose}>Close</button>
              <button
                style={styles.deleteBtn}
                onClick={async () => {
                  if (confirm(`Delete ${position.ticker} ${position.optionType} $${position.strike}? This cannot be undone.`)) {
                    await deletePosition(position.id!);
                    onSaved();
                  }
                }}
              >
                🗑️ Delete
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={styles.formGrid}>
              <label style={styles.label}>Ticker</label>
              <input style={styles.input} name="ticker" value={posForm.ticker} onChange={handlePosChange} />

              <label style={styles.label}>Type</label>
              <select style={styles.input} name="optionType" value={posForm.optionType} onChange={handlePosChange}>
                <option value="CALL">CALL</option>
                <option value="PUT">PUT</option>
              </select>

              <label style={styles.label}>Strike</label>
              <input style={styles.input} name="strike" value={posForm.strike} onChange={handlePosChange} type="number" />

              <label style={styles.label}>Expiry</label>
              <input style={styles.input} name="expiry" value={posForm.expiry} onChange={handlePosChange} type="date" />

              <label style={styles.label}>Account</label>
              <input style={styles.input} name="account" value={posForm.account} onChange={handlePosChange} />
            </div>
            <div style={styles.buttons}>
              <button style={styles.cancelBtn} onClick={() => setEditingPosition(false)}>Cancel</button>
              <button style={styles.saveBtn} onClick={handleSavePosition} disabled={savingPosition}>
                {savingPosition ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value, color, indicator }: { label: string; value: string; color?: string; indicator?: React.ReactNode }) {
  return (
    <>
      <span style={{ color: '#aaa', fontSize: '14px' }}>{label}</span>
      <span style={{ color: color ?? '#fff', fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
        {indicator}
        {value}
      </span>
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
    width: '640px', maxWidth: '92vw', maxHeight: '85vh', overflowY: 'auto'
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' },
  title: { color: '#fff', margin: 0 },
  closeBtn: { background: 'none', border: 'none', color: '#aaa', fontSize: '20px', cursor: 'pointer' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px', alignItems: 'center', marginBottom: '24px' },
  label: { color: '#aaa', fontSize: '14px' },
  input: {
    padding: '8px 12px', backgroundColor: '#2a2a3e', color: '#fff',
    border: '1px solid #333', borderRadius: '6px', fontSize: '14px', width: '100%'
  },
  lotsSection: { marginBottom: '20px' },
  lotsTitle: { color: '#aaa', fontSize: '13px', margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '0.05em' },
  lotsTable: { width: '100%', borderCollapse: 'collapse' },
  lotTh: { color: '#888', fontSize: '12px', padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #333' },
  lotTd: { color: '#fff', fontSize: '13px', padding: '6px 8px', borderBottom: '1px solid #1a1a2e' },
  lotInput: {
    padding: '4px 6px', backgroundColor: '#2a2a3e', color: '#fff',
    border: '1px solid #444', borderRadius: '4px', fontSize: '12px', width: '100%'
  },
  lotEditBtn: {
    padding: '2px 8px', backgroundColor: '#ff9900', color: '#000',
    border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '12px'
  },
  lotSaveBtn: {
    padding: '2px 8px', backgroundColor: '#00ff88', color: '#000',
    border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '12px', marginRight: '4px'
  },
  lotCancelBtn: {
    padding: '2px 8px', backgroundColor: '#555', color: '#fff',
    border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '12px'
  },
  buttons: { display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' },
  editBtn: { padding: '10px 20px', backgroundColor: '#ff9900', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
  cancelBtn: { padding: '10px 20px', backgroundColor: '#333', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' },
  saveBtn: { padding: '10px 20px', backgroundColor: '#00d4ff', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
  deleteBtn: { padding: '10px 20px', backgroundColor: '#ff4444', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', marginLeft: 'auto' }
};

export default PositionDetailModal;
