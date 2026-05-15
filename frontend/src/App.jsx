import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import BuildingManager from './pages/BuildingManager';
import FloorEditor     from './pages/FloorEditor';
import SimulationPage  from './pages/SimulationPage';
import Login           from './pages/Login';
import Register        from './pages/Register';
import RequireAuth     from './components/RequireAuth';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login"    element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Write-capable screens require auth */}
        <Route
          path="/"
          element={<RequireAuth><BuildingManager /></RequireAuth>}
        />
        <Route
          path="/buildings/:buildingId/edit"
          element={<RequireAuth><FloorEditor /></RequireAuth>}
        />

        {/* Read-only simulation stays public */}
        <Route path="/buildings/:buildingId/simulate" element={<SimulationPage />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
