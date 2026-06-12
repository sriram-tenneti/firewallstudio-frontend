import { useMemo } from 'react';
import type { TierSpec } from '@/types';

interface Props {
  tiers: TierSpec[];
  onChange: (next: TierSpec[]) => void;
  /** When true, the has_ingress checkbox is hidden (e.g. shared services
   *  are typically destination-only and effectively always have ingress). */
  hideIngress?: boolean;
  className?: string;
  title?: string;
  subtitle?: string;
}

const DEFAULT_NHS = ['NH01', 'NH02', 'NH03', 'NH04', 'NH05', 'NH06', 'NH08', 'NH14'];
const DEFAULT_SZS = ['CCS', 'CDE', 'PAA', 'GEN', 'STD'];

/**
 * Compact tier editor used in the App + Shared Service modals. Tiers are
 * the cartesian inputs for the backend's auto-fan: one (NH, SZ, has_ingress)
 * row materialises into one presence per NGDC DC at save time.
 */
export default function TierMatrixEditor({
  tiers,
  onChange,
  hideIngress,
  className,
  title = 'Tier Matrix',
  subtitle = 'Each row materializes one presence per NGDC DC. (NH, SZ) must match the source\'s neighbourhood/security-zone hierarchy.',
}: Props) {
  const rows = useMemo(() => tiers || [], [tiers]);

  const update = (idx: number, patch: Partial<TierSpec>) => {
    const next = rows.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    onChange(next);
  };
  const remove = (idx: number) => onChange(rows.filter((_, i) => i !== idx));
  const add = () => onChange([...rows, { nh_id: '', sz_code: '', has_ingress: false }]);

  return (
    <div className={`p-3 border border-emerald-200 rounded-lg bg-emerald-50/40 space-y-2 ${className ?? ''}`}>
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <h4 className="text-xs font-semibold text-emerald-800">{title}</h4>
          <p className="text-[11px] text-gray-500">{subtitle}</p>
        </div>
        <button type="button"
          onClick={add}
          className="text-[11px] px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700">
          + Add tier
        </button>
      </div>
      {rows.length === 0 ? (
        <div className="text-[11px] text-gray-500 italic px-2 py-3 text-center">
          No tiers defined yet — click "Add tier" to define a (NH, SZ) pair that should be present in every NGDC DC.
        </div>
      ) : (
        <table className="w-full text-xs">
          <thead className="text-[11px] text-gray-500">
            <tr>
              <th className="text-left font-medium pb-1">Neighbourhood</th>
              <th className="text-left font-medium pb-1">Security Zone</th>
              {!hideIngress && <th className="text-left font-medium pb-1">Has Ingress?</th>}
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((tier, i) => (
              <tr key={i} className="border-t border-emerald-100">
                <td className="py-1 pr-2">
                  <input list={`nh-list-${i}`} value={tier.nh_id || ''}
                    onChange={(e) => update(i, { nh_id: e.target.value.toUpperCase() })}
                    placeholder="NH02"
                    className="w-full border rounded px-2 py-1 text-xs" />
                  <datalist id={`nh-list-${i}`}>
                    {DEFAULT_NHS.map((n) => <option key={n} value={n} />)}
                  </datalist>
                </td>
                <td className="py-1 pr-2">
                  <input list={`sz-list-${i}`} value={tier.sz_code || ''}
                    onChange={(e) => update(i, { sz_code: e.target.value.toUpperCase() })}
                    placeholder="CCS"
                    className="w-full border rounded px-2 py-1 text-xs" />
                  <datalist id={`sz-list-${i}`}>
                    {DEFAULT_SZS.map((s) => <option key={s} value={s} />)}
                  </datalist>
                </td>
                {!hideIngress && (
                  <td className="py-1 pr-2">
                    <label className="inline-flex items-center gap-1 text-[11px] text-gray-700">
                      <input type="checkbox" checked={!!tier.has_ingress}
                        onChange={(e) => update(i, { has_ingress: e.target.checked })} />
                      Ingress
                    </label>
                  </td>
                )}
                <td className="py-1 text-right">
                  <button type="button" onClick={() => remove(i)}
                    className="text-[11px] text-red-600 hover:text-red-800">remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
