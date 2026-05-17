import { Navigate, Route, Routes } from 'react-router-dom';

import BuildingList from './routes/BuildingList';
import FloorPicker from './routes/FloorPicker';
import FloorMap from './routes/FloorMap';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<BuildingList />} />
      <Route path="/b/:buildingId" element={<FloorPicker />} />
      <Route path="/b/:buildingId/f/:floorNumber" element={<FloorMap />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
