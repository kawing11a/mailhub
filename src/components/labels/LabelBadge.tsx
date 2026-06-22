import clsx from 'clsx';
import { Tag } from 'lucide-react';

interface LabelBadgeProps {
  label: {
    name: string;
    color: string;
  };
  className?: string;
  size?: 'sm' | 'md';
}

export function LabelBadge({ label, className, size = 'sm' }: LabelBadgeProps) {
  // Simple hex to rgba for light background
  const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16) || 59;
    const g = parseInt(hex.slice(3, 5), 16) || 130;
    const b = parseInt(hex.slice(5, 7), 16) || 246;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const bgColor = hexToRgba(label.color, 0.1);
  const textColor = label.color;

  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full font-medium whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
        className
      )}
      style={{ backgroundColor: bgColor, color: textColor }}
    >
      <Tag className={clsx('mr-1', size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5')} />
      {label.name}
    </span>
  );
}
