'use client';

import { ClerkProvider } from '@clerk/nextjs';
import { ReactNode } from 'react';

import { ClerkNakamaBridge } from '@/features/auth/ClerkNakamaBridge';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up">
      {/* Turns a Clerk sign-in into a real Nakama session (backend verifies). */}
      <ClerkNakamaBridge />
      {children}
    </ClerkProvider>
  );
}

