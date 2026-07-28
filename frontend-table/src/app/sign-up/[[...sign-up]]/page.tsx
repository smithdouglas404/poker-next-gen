import { SignUp } from '@clerk/nextjs';

import { SignupConsentGate } from '@/features/auth/SignupConsentGate';

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black p-6">
      <SignupConsentGate>
        <SignUp />
      </SignupConsentGate>
    </div>
  );
}

