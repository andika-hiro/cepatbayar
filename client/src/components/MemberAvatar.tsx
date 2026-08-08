interface MemberAvatarProps {
  name: string;
  size?: number;
}

export function initialFor(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}

export default function MemberAvatar({ name, size = 40 }: MemberAvatarProps) {
  return (
    <div
      className="flex flex-none items-center justify-center rounded-full bg-surfaceAlt font-manrope font-bold text-text"
      style={{ width: size, height: size, fontSize: size * 0.375 }}
    >
      {initialFor(name)}
    </div>
  );
}
