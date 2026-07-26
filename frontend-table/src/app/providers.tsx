'use client';

import { ClerkProvider } from '@clerk/nextjs';
import { MotionConfig } from "framer-motion";
import { ReactNode } from 'react';

import { ClerkNakamaBridge } from '@/features/auth/ClerkNakamaBridge';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up">
      {/* Turns a Clerk sign-in into a real Nakama session (backend verifies). */}
      <ClerkNakamaBridge />
      {/* reducedMotion="user" honours the OS setting for every framer-motion animation
          in the app, so motion never has to be gated component by component. */}
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </ClerkProvider>
  );
}

