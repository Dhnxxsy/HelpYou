import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';

/** The hidden global cheat code. Typing it anywhere unlocks every vault item. Do not translate. */
export const MASTER_CHEAT = 'bukadong';

interface VaultMasterCtx {
  unlocked: boolean;
  activate: () => void;
  deactivate: () => void;
}

const Ctx = createContext<VaultMasterCtx>({
  unlocked: false,
  activate: () => {},
  deactivate: () => {},
});

export function VaultMasterProvider({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const activate = useCallback(() => setUnlocked(true), []);
  const deactivate = useCallback(() => setUnlocked(false), []);
  return <Ctx.Provider value={{ unlocked, activate, deactivate }}>{children}</Ctx.Provider>;
}

export function useVaultMaster(): VaultMasterCtx {
  return useContext(Ctx);
}