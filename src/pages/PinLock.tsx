import { useState, useEffect } from 'react';
import { getConfig, saveConfig, hashPin, verifyPin } from '../services/configService';

interface Props {
  onUnlock: () => void;
}

function PinLock({ onUnlock }: Props) {
  const [pin, setPin] = useState('');
  const [isFirstRun, setIsFirstRun] = useState(false);
  const [confirmPin, setConfirmPin] = useState('');
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkConfig = async () => {
      const config = await getConfig();
      if (!config || !config.pinHash) {
        setIsFirstRun(true);
      }
      setLoading(false);
    };
    checkConfig();
  }, []);

  const handleNumber = (num: string) => {
    if (pin.length < 4) setPin(prev => prev + num);
  };

  const handleDelete = () => setPin(prev => prev.slice(0, -1));

  const handleSubmit = async () => {
    if (isFirstRun) {
      if (step === 'enter') {
        if (pin.length < 4) return setError('PIN must be 4 digits');
        setConfirmPin(pin);
        setPin('');
        setStep('confirm');
        setError('');
      } else {
        if (pin !== confirmPin) {
          setError('PINs do not match');
          setPin('');
          setStep('enter');
          return;
        }
        const pinHash = await hashPin(pin);
        await saveConfig({ pinHash, accounts: [] });
        onUnlock();
      }
    } else {
      const config = await getConfig();
      if (!config) return;
      const valid = await verifyPin(pin, config.pinHash);
      if (valid) {
        onUnlock();
      } else {
        setError('Incorrect PIN');
        setPin('');
      }
    }
  };

  if (loading) return <div style={styles.container}>Loading...</div>;

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>📈 LEAP Tracker</h1>
        <p style={styles.subtitle}>
          {isFirstRun
            ? step === 'enter' ? 'Set your 4-digit PIN' : 'Confirm your PIN'
            : 'Enter your PIN'}
        </p>

        {/* PIN dots */}
        <div style={styles.dots}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{
              ...styles.dot,
              backgroundColor: pin.length > i ? '#00d4ff' : '#333'
            }} />
          ))}
        </div>

        {error && <p style={styles.error}>{error}</p>}

        {/* Number pad */}
        <div style={styles.pad}>
          {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((num, i) => (
            <button
              key={i}
              style={styles.button}
              onClick={() => num === '⌫' ? handleDelete() : num ? handleNumber(num) : null}
            >
              {num}
            </button>
          ))}
        </div>

        <button
          style={styles.submitButton}
          onClick={handleSubmit}
          disabled={pin.length < 4}
        >
          {isFirstRun ? (step === 'enter' ? 'Next' : 'Set PIN') : 'Unlock'}
        </button>
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    backgroundColor: '#0f0f1a'
  },
  card: {
    backgroundColor: '#1a1a2e',
    padding: '40px',
    borderRadius: '16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '20px',
    width: '320px'
  },
  title: { color: '#00d4ff', margin: 0 },
  subtitle: { color: '#aaa', margin: 0 },
  dots: { display: 'flex', gap: '16px' },
  dot: { width: '16px', height: '16px', borderRadius: '50%', transition: 'background-color 0.2s' },
  error: { color: '#ff4444', margin: 0 },
  pad: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', width: '100%' },
  button: {
    padding: '16px',
    fontSize: '20px',
    backgroundColor: '#2a2a3e',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer'
  },
  submitButton: {
    width: '100%',
    padding: '14px',
    backgroundColor: '#00d4ff',
    color: '#000',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer'
  }
};

export default PinLock;
