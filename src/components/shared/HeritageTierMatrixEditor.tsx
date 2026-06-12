import { useEffect, useMemo, useState } from 'react';
import { getLegacyDatacenters } from '@/lib/api';
import type { HeritageTierSpec } from '@/types';

interface Props {
  tiers: HeritageTierSpec[];
  onChange: (next: HeritageTierSpec[]) => void;
  /** When true, the has_ingress checkbox is hidden (Shared Services
   *  default to ingress-on / destination-only). */
  hideIngress?: boolean;
  className?: string;
  title?: string;
  subtitle?: string;
}

/**
 * Heritage tier editor — one row per Heritage DC the app/service
 * still serves traffic from. Heritage DCs are flat (no NH/SZ
 * segmentation), so the only knob is the DC itself + an optional
 * has_ingress flag. Each row materialises into a flat presence and a
 * `grp-<APP>-HERITAGE-<DC>` group at save time. Pulls the DC list
 * from `/api/reference/legacy-datacenters` (the historical name of
 * the heritage DC catalog).
 */
export default function HeritageTierMatrixEditor({
  tiers,
  onChange,
  hideIngress,
  className,
  title = 'Heritage DCs',
  subtitle = 'Each row materialises a flat presence (no NH/SZ) on the chosen Heritage DC. Group naming switches to `grp-<APP>-HERITAGE-<DC>` automatically.',
}: Props) {
  const rows = useMemo(() => tiers || [], [tiers]);
  const [dcs, setDcs] = useState<{ code: string; name: string }[]>([]);

  useEffect(() => {
    getLegacyDatacenters()
      .then((d) => {
        setDcs((d || []).map((row: Record<string, unknown>) => ({
          code: String(row.code || row.dc_id || ''),
          name: String(row.name || row.code || row.dc_id || ''),
        })).filter((r) => r.code));
      })
      .catch(() => setDcs([]));
  }, []);

  const update = (idx: number, patch: Partial<HeritageTierSpec>) => {
    onChange(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const remove = (idx: number) => onChange(rows.filter((_, i) => i !== idx));
  const add = () => onChange([...rows, { dc_id: '', has_ingress: false }]);

  return (
    <div className={`p-3 border border-amber-200 rounded-lg bg-amber-50/40 space-y-2 ${className ?? ''}`}>
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <h4 className="text-xs font-semibold text-amber-800">{title}</h4>
          <p className="text-[11px] text-gray-500">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={add}
          className="text-[11px] px-2 py-1 rounded bg-amber-600 text-white hover:bg-amber-700"
        >
          + Add Heritage DC
        </button>
      </div>
      {rows.length === 0 ? (
        <div className="text-[11px] text-gray-500 italic px-2 py-3 text-center">
          No Heritage DCs added — click "Add Heritage DC" if this app/service still serves traffic from a non-NGDC DC.
        </div>
      ) : (
        <table className="w-full text-xs">
          <thead className="text-[11px] text-gray-500">
            <tr>
              <th className="text-left font-medium pb-1">Heritage DC</th>
              <th className="text-left font-medium pb-1">Label (optional)</th>
              {!hideIngress && <th className="text-left font-medium pb-1">Has Ingress?</th>}
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((tier, i) => (
              <tr key={i} className="border-t border-amber-100">
                <td className="py-1 pr-2">
                  <input
                    list={`heritage-dc-list-${i}`}
                    value={tier.dc_id || ''}
                    onChange={(e) => update(i, { dc_id: e.target.value.toUpperCase() })}
                    placeholder="e.g. DC0"
                    className="w-full border rounded px-2 py-1 text-xs"
                  />
                  <datalist id={`heritage-dc-list-${i}`}>
                    {dcs.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
                  </datalist>
                </td>
                <td className="py-1 pr-2">
                  <input
                    value={tier.label || ''}
                    onChange={(e) => update(i, { label: e.target.value })}
                    placeholder="e.g. Mainframe tier"
                    className="w-full border rounded px-2 py-1 text-xs"
                  />
                </td>
                {!hideIngress && (
                  <td className="py-1 pr-2">
                    <label className="inline-flex items-center gap-1 text-[11px] text-gray-700">
                      <input
                        type="checkbox"
                        checked={!!tier.has_ingress}
                        onChange={(e) => update(i, { has_ingress: e.target.checked })}
                      />
                      Ingress
                    </label>
                  </td>
                )}
                <td className="py-1 text-right">
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    className="text-[11px] text-red-600 hover:text-red-800"
                  >
                    remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
