'use client';

import { useEffect, useState } from 'react';
import { useUIStore } from '@/stores/uiStore';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme, density } = useUIStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    // Remove any existing theme and density classes
    const classes = document.body.className.split(' ');
    const newClasses = classes.filter(
      (c) => !c.startsWith('theme-') && !c.startsWith('density-')
    );

    // Add current theme and density
    newClasses.push(theme);
    newClasses.push(density);

    document.body.className = newClasses.join(' ').trim();
  }, [theme, density, mounted]);

  // Render children immediately to avoid hydration mismatch, but body class updates via useEffect
  return <>{children}</>;
}
