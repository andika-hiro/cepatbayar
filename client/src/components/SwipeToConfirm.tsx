import { useRef, useState, useEffect } from 'react';

interface SwipeToConfirmProps {
  label?: string;
  confirmedLabel?: string;
  isSettled?: boolean;
  onConfirm: () => void;
  onReset?: () => void;
  className?: string;
}

export default function SwipeToConfirm({
  label = 'Geser ke kanan untuk tandai lunas 👉',
  confirmedLabel = '✓ Sudah Lunas',
  isSettled = false,
  onConfirm,
  onReset,
  className = '',
}: SwipeToConfirmProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const startXRef = useRef(0);
  const startDragXRef = useRef(0);

  useEffect(() => {
    if (!isSettled) {
      setDragX(0);
    }
  }, [isSettled]);

  const handleStart = (clientX: number) => {
    if (isSettled) return;
    setIsDragging(true);
    startXRef.current = clientX;
    startDragXRef.current = dragX;
  };

  const handleMove = (clientX: number) => {
    if (!isDragging || !containerRef.current || isSettled) return;
    const rect = containerRef.current.getBoundingClientRect();
    const handleWidth = 38;
    const maxDrag = Math.max(1, rect.width - handleWidth - 8);

    const deltaX = clientX - startXRef.current;
    const newX = Math.max(0, Math.min(startDragXRef.current + deltaX, maxDrag));
    setDragX(newX);
  };

  const handleEnd = () => {
    if (!isDragging || !containerRef.current || isSettled) return;
    setIsDragging(false);
    const rect = containerRef.current.getBoundingClientRect();
    const handleWidth = 38;
    const maxDrag = Math.max(1, rect.width - handleWidth - 8);

    if (dragX > maxDrag * 0.8) {
      setDragX(0);
      onConfirm();
    } else {
      setDragX(0);
    }
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX);
    const onMouseUp = () => handleEnd();

    if (isDragging) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging, dragX]);

  const onTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    handleStart(e.touches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    handleMove(e.touches[0].clientX);
  };

  const onTouchEnd = () => {
    handleEnd();
  };

  if (isSettled) {
    return (
      <div className={`flex items-center justify-between rounded-pill bg-pos/15 border border-pos/30 px-4 py-2 font-inter text-xs font-bold text-pos ${className}`}>
        <span>{confirmedLabel}</span>
        {onReset && (
          <button
            type="button"
            onClick={() => {
              setDragX(0);
              onReset();
            }}
            className="text-[11px] font-semibold text-sub hover:text-text underline"
          >
            Batalkan
          </button>
        )}
      </div>
    );
  }

  const handleWidth = 38;
  const maxDrag = containerRef.current ? Math.max(1, containerRef.current.clientWidth - handleWidth - 8) : 100;
  const progressPercent = Math.min(100, (dragX / maxDrag) * 100);

  return (
    <div
      ref={containerRef}
      className={`relative flex h-[44px] w-full select-none items-center overflow-hidden rounded-pill border border-accent/30 bg-surfaceAlt px-1 touch-none ${className}`}
    >
      {/* Background fill */}
      <div
        className={`absolute inset-y-0 left-0 bg-accent/20 ${isDragging ? '' : 'transition-all duration-200'}`}
        style={{ width: `${dragX + handleWidth}px` }}
      />

      {/* Label Text */}
      <div
        className="absolute inset-0 flex items-center justify-center font-inter text-[12px] font-semibold text-accent pointer-events-none transition-opacity duration-150"
        style={{ opacity: 1 - progressPercent / 60 }}
      >
        {label}
      </div>

      {/* Draggable Handle Knob ONLY */}
      <div
        data-testid="swipe-knob"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleStart(e.clientX);
        }}
        className={`relative z-10 flex h-[36px] w-[36px] flex-none items-center justify-center rounded-full bg-accent text-onAccent shadow-md cursor-grab active:cursor-grabbing ${
          isDragging ? '' : 'transition-transform duration-200'
        }`}
        style={{ transform: `translateX(${dragX}px)` }}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  );
}
