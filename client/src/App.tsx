import { Route, Routes } from 'react-router-dom';
import RingkasanPlaceholderScreen from './screens/RingkasanPlaceholderScreen';
import ProfilePlaceholderScreen from './screens/ProfilePlaceholderScreen';

export default function App() {
  return (
    <Routes>
      <Route path="/t/:publicId/ringkasan" element={<RingkasanPlaceholderScreen />} />
      <Route path="/profil" element={<ProfilePlaceholderScreen />} />
    </Routes>
  );
}
