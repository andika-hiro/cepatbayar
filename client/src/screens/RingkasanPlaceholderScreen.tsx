import { useParams } from 'react-router-dom';
import BottomNavTripLevel from '../components/BottomNavTripLevel';

export default function RingkasanPlaceholderScreen() {
  const { publicId } = useParams<{ publicId: string }>();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-5 pb-[100px] text-center">
      <div className="font-manrope text-base font-bold text-text">Ringkasan segera hadir</div>
      <div className="font-inter text-[13px] text-sub">Fitur ini dibangun di Tahap 2.</div>
      <BottomNavTripLevel publicId={publicId ?? ''} active="ringkasan" onAddClick={() => {}} />
    </div>
  );
}
