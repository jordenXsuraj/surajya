import { create } from 'zustand';

import type { SignupStep1Values } from '@/lib/validation';

// Step 1 of signup, kept in memory only (never persisted: it holds the password) until step 2
// sends everything in one POST /auth/signup.
type SignupDraftState = {
  step1: SignupStep1Values | null;
  setStep1: (values: SignupStep1Values) => void;
  clear: () => void;
};

export const useSignupDraft = create<SignupDraftState>()((set) => ({
  step1: null,
  setStep1: (values) => set({ step1: values }),
  clear: () => set({ step1: null }),
}));
