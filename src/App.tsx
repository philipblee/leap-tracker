import React, { useState } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import PinLock from './pages/PinLock';
import Dashboard from './pages/Dashboard';
import Positions from './pages/Positions';
import ClosedPositions from './pages/ClosedPositions';
import ImportCSV from './pages/ImportCSV';
import NavBar from './components/NavBar';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Unhandled React error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: '#0a0a14', color: '#fff', padding: '40px', textAlign: 'center' }}>
          <h2 style={{ color: '#ff4444', marginBottom: '12px' }}>Something went wrong</h2>
          <p style={{ color: '#aaa', marginBottom: '8px', maxWidth: '480px' }}>{this.state.error.message}</p>
          <p style={{ color: '#555', fontSize: '13px', marginBottom: '24px' }}>Check the browser console for details.</p>
          <button
            style={{ padding: '10px 24px', backgroundColor: '#00d4ff', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const [isUnlocked, setIsUnlocked] = useState(false);

  return (
    <ErrorBoundary>
      <Router>
        {!isUnlocked ? (
          <PinLock onUnlock={() => setIsUnlocked(true)} />
        ) : (
          <>
            <NavBar />
            <div style={{ padding: '20px', maxWidth: '1600px', margin: '0 auto' }}>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/positions" element={<Positions />} />
                <Route path="/closed" element={<ClosedPositions />} />
                <Route path="/import" element={<ImportCSV />} />
              </Routes>
            </div>
          </>
        )}
      </Router>
    </ErrorBoundary>
  );
}

export default App;
