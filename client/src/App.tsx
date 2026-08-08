import { Route, Routes } from 'react-router-dom';
import TripListScreen from './screens/TripListScreen';
import RingkasanPlaceholderScreen from './screens/RingkasanPlaceholderScreen';
import ProfilePlaceholderScreen from './screens/ProfilePlaceholderScreen';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<TripListScreen />} />
      <Route path="/t/:publicId/ringkasan" element={<RingkasanPlaceholderScreen />} />
      <Route path="/profil" element={<ProfilePlaceholderScreen />} />
    </Routes>
  );
}
