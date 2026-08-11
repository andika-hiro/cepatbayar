export default function AppLogo({ size = 32 }: { size?: number }) {
  return (
    <img
      src="/icon.svg"
      alt="Cepatkan Bayar Logo"
      style={{ width: size, height: size }}
      className="flex-none rounded-[8px] shadow-sm object-cover"
    />
  );
}
