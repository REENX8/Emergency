import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import BuildingManager from './pages/BuildingManager';
import FloorEditor     from './pages/FloorEditor';
import SimulationPage  from './pages/SimulationPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"                               element={<BuildingManager />} />
        <Route path="/buildings/:buildingId/edit"     element={<FloorEditor />} />
        <Route path="/buildings/:buildingId/simulate" element={<SimulationPage />} />
        <Route path="*"                               element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
