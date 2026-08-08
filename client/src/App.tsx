import { Route, Routes } from 'react-router-dom';
import TripListScreen from './screens/TripListScreen';
import NewTripScreen from './screens/NewTripScreen';
import IdentityPickerScreen from './screens/IdentityPickerScreen';
import RingkasanScreen from './screens/RingkasanScreen';
import RiwayatScreen from './screens/RiwayatScreen';
import SubTripDetailScreen from './screens/SubTripDetailScreen';
import SaldoScreen from './screens/SaldoScreen';
import RiwayatPelunasanScreen from './screens/RiwayatPelunasanScreen';
import PengaturanScreen from './screens/PengaturanScreen';
import KelolaAnggotaScreen from './screens/KelolaAnggotaScreen';
import RekeningDetailScreen from './screens/RekeningDetailScreen';
import ProfilePlaceholderScreen from './screens/ProfilePlaceholderScreen';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<TripListScreen />} />
      <Route path="/trip/new" element={<NewTripScreen />} />
      <Route path="/t/:publicId" element={<IdentityPickerScreen />} />
      <Route path="/t/:publicId/ringkasan" element={<RingkasanScreen />} />
      <Route path="/t/:publicId/riwayat" element={<RiwayatScreen />} />
      <Route path="/t/:publicId/subtrip/:subTripId" element={<SubTripDetailScreen />} />
      <Route path="/t/:publicId/saldo" element={<SaldoScreen />} />
      <Route path="/t/:publicId/riwayat-pelunasan" element={<RiwayatPelunasanScreen />} />
      <Route path="/t/:publicId/pengaturan" element={<PengaturanScreen />} />
      <Route path="/t/:publicId/pengaturan/anggota" element={<KelolaAnggotaScreen />} />
      <Route path="/t/:publicId/pengaturan/anggota/:memberId" element={<RekeningDetailScreen />} />
      <Route path="/profil" element={<ProfilePlaceholderScreen />} />
    </Routes>
  );
}

