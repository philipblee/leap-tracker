import { Link, useLocation } from 'react-router-dom';

function NavBar() {
  const location = useLocation();

  const navStyle = {
    backgroundColor: '#1a1a2e',
    padding: '12px 24px',
    display: 'flex',
    gap: '24px',
    alignItems: 'center'
  };

  const linkStyle = (path: string) => ({
    color: location.pathname === path ? '#00d4ff' : '#ffffff',
    textDecoration: 'none',
    fontWeight: location.pathname === path ? 'bold' : 'normal',
    fontSize: '16px'
  });

  return (
    <nav style={navStyle}>
      <span style={{ color: '#00d4ff', fontWeight: 'bold', fontSize: '20px', marginRight: '24px' }}>
        📈 LEAP Tracker
      </span>
      <Link to="/dashboard" style={linkStyle('/dashboard')}>Dashboard</Link>
      <Link to="/positions" style={linkStyle('/positions')}>Open Positions</Link>
      <Link to="/closed" style={linkStyle('/closed')}>Closed Positions</Link>
      <Link to="/import" style={linkStyle('/import')}>Import CSV</Link>
    </nav>
  );
}

export default NavBar;
