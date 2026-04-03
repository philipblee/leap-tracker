import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState } from 'react';
import PinLock from './pages/PinLock';
import Dashboard from './pages/Dashboard';
import Positions from './pages/Positions';
import ClosedPositions from './pages/ClosedPositions';
import ImportCSV from './pages/ImportCSV';
import NavBar from './components/NavBar';

function App() {
  const [isUnlocked, setIsUnlocked] = useState(false);

  return (
    <Router>
      {!isUnlocked ? (
        <PinLock onUnlock={() => setIsUnlocked(true)} />
      ) : (
        <>
          <NavBar />
          <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
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
  );
}

export default App;
