import { Route, Routes } from 'react-router-dom';
import TripListScreen from './screens/TripListScreen';
import RingkasanPlaceholderScreen from './screens/RingkasanPlaceholderScreen';
import ProfilePlaceholderScreen from './screens/ProfilePlaceholderScreen';
import NewTripScreen from './screens/NewTripScreen';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<TripListScreen />} />
      <Route path="/trip/new" element={<NewTripScreen />} />
      <Route path="/t/:publicId/ringkasan" element={<RingkasanPlaceholderScreen />} />
      <Route path="/profil" element={<ProfilePlaceholderScreen />} />
    </Routes>
  );
}
