import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * Team-scoping context. Stores the "View as" team selection — the
 * portal filters apps, services, and rule requests to the chosen team.
 * The literal "SNS" team is the global reviewer/approver and sees
 * everything (god-view), so list endpoints skip the team filter when
 * the active team is "SNS".
 */
export interface TeamContextValue {
  team: string;
  setTeam: (t: string) => void;
  /** True when SNS (or any explicit god-view team) is selected. */
  isGodView: boolean;
}

const STORAGE_KEY = 'nfs.viewAsTeam';
const DEFAULT_TEAM = 'SNS';

const TeamContext = createContext<TeamContextValue | undefined>(undefined);

export function TeamProvider({ children }: { children: ReactNode }) {
  const [team, setTeamState] = useState<string>(() => {
    if (typeof window === 'undefined') return DEFAULT_TEAM;
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_TEAM;
  });
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, team);
    }
  }, [team]);
  const value = useMemo<TeamContextValue>(() => ({
    team,
    setTeam: (t: string) => setTeamState(t || DEFAULT_TEAM),
    isGodView: team.trim().toUpperCase() === 'SNS',
  }), [team]);
  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
}

export function useTeam(): TeamContextValue {
  const ctx = useContext(TeamContext);
  if (!ctx) {
    // Safe fallback so isolated tests / standalone screens still work.
    return { team: DEFAULT_TEAM, setTeam: () => undefined, isGodView: true };
  }
  return ctx;
}
