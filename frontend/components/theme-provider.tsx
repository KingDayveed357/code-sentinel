// frontend/components/theme-provider.tsx
"use client"

import * as React from 'react'
import { useEffect } from 'react'
import {
  ThemeProvider as NextThemesProvider,
  type ThemeProviderProps,
} from 'next-themes'

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  useEffect(() => {
    console.log('ThemeProvider mounted');
  }, []);

  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
