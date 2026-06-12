import { useEffect, useState } from 'react';
import { useTeam } from '@/contexts/TeamContext';
import * as api from '@/lib/api';

/**
 * Top-bar "View as" team selector. Stores the active team in the
 * TeamContext (and localStorage). The literal "SNS" team is the
 * global reviewer/approver and sees every app/service/rule. Any
 * other selection scopes the lists to apps/services owned by that
 * team.
 */
export function TeamSelector() {
  const { team, setTeam } = useTeam();
  const [teams, setTeams] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [apps, svcs] = await Promise.all([
          api.getApplications().catch(() => []),
          api.getSharedServices().catch(() => []),
        ]);
        const set = new Set<string>(['SNS']);
        for (const a of apps) {
          const t = (a as { owner_team?: string }).owner_team;
          if (t && t.trim()) set.add(t.trim());
        }
        for (const s of svcs) {
          const t = (s as { owner_team?: string }).owner_team;
          if (t && t.trim()) set.add(t.trim());
        }
        if (!cancelled) {
          setTeams(Array.from(set).sort((a, b) => {
            // SNS pinned first.
            if (a.toUpperCase() === 'SNS') return -1;
            if (b.toUpperCase() === 'SNS') return 1;
            return a.localeCompare(b);
          }));
        }
      } catch {
        if (!cancelled) setTeams(['SNS']);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <label className="flex items-center gap-2 text-[11px] font-medium text-white/80">
      <span className="text-white/50">View as:</span>
      <select
        value={team}
        onChange={(e) => setTeam(e.target.value)}
        className="bg-white/10 border border-white/20 rounded px-2 py-1 text-[11px] text-white hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/40 max-w-[160px]"
        title="Filters apps, services, and rule requests by owning team. SNS sees everything (global reviewer)."
      >
        {teams.map((t) => (
          <option key={t} value={t} className="text-gray-900">{t}</option>
        ))}
      </select>
    </label>
  );
}
