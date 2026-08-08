import BottomNavAppLevel from '../components/BottomNavAppLevel';

export default function ProfilePlaceholderScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-5 pb-[100px] text-center">
      <div className="font-manrope text-base font-bold text-text">Pengaturan segera hadir</div>
      <div className="font-inter text-[13px] text-sub">Fitur ini dibangun di tahap berikutnya.</div>
      <BottomNavAppLevel />
    </div>
  );
}
