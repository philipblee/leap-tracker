import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getFunctions, httpsCallable } from 'firebase/functions';

function NavBar() {
  const location = useLocation();
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState('');

  const handleSnapshot = async () => {
    setRunning(true);
    setMsg('');
    try {
      const fn = httpsCallable(getFunctions(), 'runSnapshotManually');
      await fn({});
      setMsg('✓');
    } catch {
      setMsg('✗');
    } finally {
      setRunning(false);
    }
  };

  const navStyle = {};

  const innerStyle = {
    backgroundColor: '#1a1a2e',
    maxWidth: '1600px',
    margin: '0 auto',
    padding: '12px 20px',
    display: 'flex',
    gap: '24px',
    alignItems: 'center',
  };

  const linkStyle = (path: string) => ({
    color: location.pathname === path ? '#00d4ff' : '#ffffff',
    textDecoration: 'none',
    fontWeight: location.pathname === path ? 'bold' : 'normal',
    fontSize: '16px'
  });

  return (
    <nav style={navStyle}>
      <div style={innerStyle}>
        <span style={{ color: '#00d4ff', fontWeight: 'bold', fontSize: '20px', marginRight: '24px' }}>
          📈 LEAP Tracker
        </span>
        <Link to="/dashboard" style={linkStyle('/dashboard')}>Dashboard</Link>
        <button
          onClick={handleSnapshot}
          disabled={running}
          style={{ padding: '4px 10px', fontSize: '13px', cursor: running ? 'not-allowed' : 'pointer', opacity: running ? 0.6 : 1, backgroundColor: '#2a2a3e', color: '#fff', border: '1px solid #444', borderRadius: '4px' }}
        >
          {running ? '...' : '📸'}
        </button>
        {msg && <span style={{ fontSize: '13px', color: msg === '✓' ? '#00ff88' : '#ff4444' }}>{msg}</span>}
        <Link to="/positions" style={linkStyle('/positions')}>Open Positions</Link>
        <Link to="/closed" style={linkStyle('/closed')}>Closed Positions</Link>
        <Link to="/import" style={linkStyle('/import')}>Import CSV</Link>
        <Link to="/pending" style={linkStyle('/pending')}>Pending Closes</Link>
      </div>
    </nav>
  );
}

export default NavBar;
