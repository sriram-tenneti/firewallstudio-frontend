import { useEffect, useMemo, useState } from 'react';
import { getNGDCDatacenters, getLegacyDatacenters } from '@/lib/api';
import MemberChipList, { type MemberChip } from './MemberChipList';

/**
 * One presence row in the editor. Maps 1:1 to a backend AppPresence /
 * SharedServicePresence row. Heritage rows have empty NH/SZ — the form
 * + backend both honour that contract.
 *
 * ``uid`` is a client-only stable id used so that two freshly-added
 * rows that still share the same (DC, NH, SZ) values don't collide on
 * a derived key — without it, toggling Has Ingress / typing into one
 * row would leak into every duplicate-keyed sibling. The backend
 * ignores ``uid`` on submit; it's stripped at the SettingsPage layer.
 */
export interface PresenceRow {
  uid?: string;
  dc_id: string;
  nh_id: string;
  sz_code: string;
  has_ingress: boolean;
  is_heritage?: boolean;
  egress_members: MemberChip[];
  ingress_members: MemberChip[];
  environment?: string;
  /**
   * Heritage rows only. Lists which NGDC DCs route traffic into / out
   * of this Heritage DC (Ravi's 2-NGDC-→-1-Heritage-DC pattern). Empty
   * = fan-out across all NGDC DCs (a warning will surface in the rule
   * preview asking the SME to declare an explicit mapping).
   */
  ngdc_source_dcs?: string[];
}

let __presenceRowUidSeq = 0;
function _newUid(): string {
  __presenceRowUidSeq += 1;
  return `pr-${Date.now().toString(36)}-${__presenceRowUidSeq}`;
}

/** Public helper: callers (SettingsPage / SharedServicesTab) seed a
 *  fresh ``uid`` on every row they receive from the backend so the
 *  editor can use it as the React key + identity. */
export function withRowUids(rows: PresenceRow[]): PresenceRow[] {
  return (rows || []).map((r) => (r.uid ? r : { ...r, uid: _newUid() }));
}

interface DcOption {
  code: string;
  name?: string;
}

interface Props {
  rows: PresenceRow[];
  onChange: (next: PresenceRow[]) => void;
  /** Hide ingress chips (Shared Services historically destination-only). */
  hideIngress?: boolean;
  /** When the parent already knows the DC catalogue, pass it to skip an
   *  extra API roundtrip. */
  ngdcDcs?: DcOption[];
  heritageDcs?: DcOption[];
  className?: string;
  title?: string;
  subtitle?: string;
}

const DEFAULT_NHS = ['NH01', 'NH02', 'NH03', 'NH04', 'NH05', 'NH06', 'NH08', 'NH14'];
const DEFAULT_SZS = ['CCS', 'CDE', 'PAA', 'GEN', 'STD'];

function rowKey(r: PresenceRow): string {
  // Value-derived key is only used for the Quick-fan dedup check;
  // identity for updates / removes / React keys uses ``uid`` so two
  // rows that are still being edited (and may share a derived key)
  // don't get accidentally merged.
  return [r.is_heritage ? 'H' : 'N', r.dc_id, r.nh_id, r.sz_code].join('|');
}

function rowUid(r: PresenceRow): string {
  return r.uid || rowKey(r);
}

export default function PresencePerDcEditor({
  rows,
  onChange,
  hideIngress,
  ngdcDcs,
  heritageDcs,
  className,
  title = 'Per-DC Presences',
  subtitle = 'One row per (DC, NH, SZ) tuple. Egress / Ingress chips are saved into the matching `grp-<APP>-<NH>-<SZ>` group automatically. Heritage rows live below — flat per Heritage DC, no NH/SZ.',
}: Props) {
  const [resolvedNgdc, setResolvedNgdc] = useState<DcOption[]>(ngdcDcs ?? []);
  const [resolvedHeritage, setResolvedHeritage] = useState<DcOption[]>(heritageDcs ?? []);
  const [quickNh, setQuickNh] = useState('');
  const [quickSz, setQuickSz] = useState('');
  const [quickIngress, setQuickIngress] = useState(false);

  useEffect(() => {
    if (ngdcDcs && ngdcDcs.length > 0) return;
    getNGDCDatacenters()
      .then((d) =>
        setResolvedNgdc(
          (d || []).map((row) => {
            const r = row as unknown as Record<string, unknown>;
            return {
              code: String(r.dc_id || r.code || ''),
              name: String(r.name || r.code || r.dc_id || ''),
            };
          }).filter((r) => r.code),
        ),
      )
      .catch(() => setResolvedNgdc([]));
  }, [ngdcDcs]);

  useEffect(() => {
    if (heritageDcs && heritageDcs.length > 0) return;
    getLegacyDatacenters()
      .then((d) =>
        setResolvedHeritage(
          (d || []).map((row) => {
            const r = row as unknown as Record<string, unknown>;
            return {
              code: String(r.dc_id || r.code || ''),
              name: String(r.name || r.code || r.dc_id || ''),
            };
          }).filter((r) => r.code),
        ),
      )
      .catch(() => setResolvedHeritage([]));
  }, [heritageDcs]);

  const ngdcOptions = ngdcDcs && ngdcDcs.length > 0 ? ngdcDcs : resolvedNgdc;
  const heritageOptions = heritageDcs && heritageDcs.length > 0 ? heritageDcs : resolvedHeritage;

  const ngdcRows = useMemo(() => rows.filter((r) => !r.is_heritage), [rows]);
  const heritageRows = useMemo(() => rows.filter((r) => r.is_heritage), [rows]);

  // Ensure every row carries a stable uid before we render — this is
  // a no-op for rows already seeded via ``withRowUids`` but covers
  // legacy callers that pass raw backend payloads straight in.
  useEffect(() => {
    const needsSeed = rows.some((r) => !r.uid);
    if (!needsSeed) return;
    onChange(rows.map((r) => (r.uid ? r : { ...r, uid: _newUid() })));
    // We deliberately depend only on ``rows`` length-and-uid-presence
    // to avoid an infinite onChange loop when parents always allocate
    // a fresh array reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length, rows.map((r) => r.uid ? '1' : '0').join('')]);

  const updateRow = (target: PresenceRow, patch: Partial<PresenceRow>) => {
    const targetUid = rowUid(target);
    onChange(
      rows.map((r) => (rowUid(r) === targetUid ? { ...r, ...patch } : r)),
    );
  };
  const removeRow = (target: PresenceRow) => {
    const targetUid = rowUid(target);
    onChange(rows.filter((r) => rowUid(r) !== targetUid));
  };
  const addNgdcRow = () => {
    onChange([
      ...rows,
      {
        uid: _newUid(),
        dc_id: ngdcOptions[0]?.code || '',
        nh_id: '',
        sz_code: '',
        has_ingress: false,
        is_heritage: false,
        egress_members: [],
        ingress_members: [],
      },
    ]);
  };
  const addHeritageRow = () => {
    onChange([
      ...rows,
      {
        uid: _newUid(),
        dc_id: heritageOptions[0]?.code || '',
        nh_id: '',
        sz_code: '',
        has_ingress: false,
        is_heritage: true,
        egress_members: [],
        ingress_members: [],
        ngdc_source_dcs: [],
      },
    ]);
  };

  const quickFan = () => {
    const nh = quickNh.trim().toUpperCase();
    const sz = quickSz.trim().toUpperCase();
    if (!nh || !sz) return;
    const existingKeys = new Set(ngdcRows.map(rowKey));
    const additions: PresenceRow[] = [];
    for (const dc of ngdcOptions) {
      const candidate: PresenceRow = {
        uid: _newUid(),
        dc_id: dc.code,
        nh_id: nh,
        sz_code: sz,
        has_ingress: quickIngress,
        is_heritage: false,
        egress_members: [],
        ingress_members: [],
      };
      if (existingKeys.has(rowKey(candidate))) continue;
      additions.push(candidate);
    }
    if (additions.length === 0) return;
    onChange([...rows, ...additions]);
    setQuickNh('');
    setQuickSz('');
    setQuickIngress(false);
  };

  return (
    <div className={`p-3 border border-emerald-200 rounded-lg bg-emerald-50/40 space-y-3 ${className ?? ''}`}>
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <h4 className="text-xs font-semibold text-emerald-800">{title}</h4>
          <p className="text-[11px] text-gray-500">{subtitle}</p>
        </div>
      </div>

      {/* Quick-fan helper */}
      <div className="flex flex-wrap items-end gap-2 px-2 py-2 border border-dashed border-emerald-300 rounded bg-white/60">
        <div className="text-[11px] font-medium text-emerald-700 mr-1">Quick fan ⤵</div>
        <div className="flex flex-col">
          <label className="text-[10px] text-gray-500">NH</label>
          <input list="quick-nh-list" value={quickNh}
            onChange={(e) => setQuickNh(e.target.value)}
            placeholder="NH02"
            className="border rounded px-2 py-0.5 text-xs w-20" />
          <datalist id="quick-nh-list">
            {DEFAULT_NHS.map((n) => <option key={n} value={n} />)}
          </datalist>
        </div>
        <div className="flex flex-col">
          <label className="text-[10px] text-gray-500">SZ</label>
          <input list="quick-sz-list" value={quickSz}
            onChange={(e) => setQuickSz(e.target.value)}
            placeholder="CCS"
            className="border rounded px-2 py-0.5 text-xs w-20" />
          <datalist id="quick-sz-list">
            {DEFAULT_SZS.map((s) => <option key={s} value={s} />)}
          </datalist>
        </div>
        {!hideIngress && (
          <label className="inline-flex items-center gap-1 text-[11px] text-gray-700 mb-1">
            <input type="checkbox" checked={quickIngress}
              onChange={(e) => setQuickIngress(e.target.checked)} />
            Ingress
          </label>
        )}
        <button type="button"
          onClick={quickFan}
          disabled={!quickNh || !quickSz || ngdcOptions.length === 0}
          className="text-[11px] px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40">
          Apply to all {ngdcOptions.length} NGDC DCs
        </button>
        <span className="text-[10px] text-gray-500 ml-auto italic">
          Seeds one empty-member row per NGDC DC for this (NH, SZ). Fill chips per DC after.
        </span>
      </div>

      {/* NGDC rows */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <h5 className="text-[11px] font-semibold text-emerald-700">NGDC presences ({ngdcRows.length})</h5>
          <button type="button" onClick={addNgdcRow}
            className="text-[11px] px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700">
            + Add NGDC row
          </button>
        </div>
        {ngdcRows.length === 0 ? (
          <div className="text-[11px] text-gray-500 italic px-2 py-2">
            No NGDC presences — use Quick fan or "+ Add NGDC row" to declare one.
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-[11px] text-gray-500">
              <tr>
                <th className="text-left font-medium pb-1 w-32">DC</th>
                <th className="text-left font-medium pb-1 w-20">NH</th>
                <th className="text-left font-medium pb-1 w-20">SZ</th>
                {!hideIngress && <th className="text-left font-medium pb-1 w-20">Ingress?</th>}
                <th className="text-left font-medium pb-1">Egress members (IP / CIDR / range)</th>
                {!hideIngress && <th className="text-left font-medium pb-1">Ingress VIPs</th>}
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {ngdcRows.map((r) => (
                <tr key={rowUid(r)} className="border-t border-emerald-100 align-top">
                  <td className="py-1 pr-2">
                    <select value={r.dc_id}
                      onChange={(e) => updateRow(r, { dc_id: e.target.value })}
                      className="w-full border rounded px-1 py-1 text-xs">
                      {ngdcOptions.length === 0 && <option value="" disabled>— no NGDC DCs —</option>}
                      {ngdcOptions.map((d) => (
                        <option key={d.code} value={d.code}>{d.code}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1 pr-2">
                    <input list={`nh-list-${rowUid(r)}`} value={r.nh_id}
                      onChange={(e) => updateRow(r, { nh_id: e.target.value.toUpperCase() })}
                      placeholder="NH02"
                      className="w-full border rounded px-1 py-1 text-xs" />
                    <datalist id={`nh-list-${rowUid(r)}`}>
                      {DEFAULT_NHS.map((n) => <option key={n} value={n} />)}
                    </datalist>
                  </td>
                  <td className="py-1 pr-2">
                    <input list={`sz-list-${rowUid(r)}`} value={r.sz_code}
                      onChange={(e) => updateRow(r, { sz_code: e.target.value.toUpperCase() })}
                      placeholder="CCS"
                      className="w-full border rounded px-1 py-1 text-xs" />
                    <datalist id={`sz-list-${rowUid(r)}`}>
                      {DEFAULT_SZS.map((s) => <option key={s} value={s} />)}
                    </datalist>
                  </td>
                  {!hideIngress && (
                    <td className="py-1 pr-2">
                      <input type="checkbox" checked={r.has_ingress}
                        onChange={(e) => updateRow(r, { has_ingress: e.target.checked })} />
                    </td>
                  )}
                  <td className="py-1 pr-2">
                    <MemberChipList
                      chips={r.egress_members}
                      onChange={(c) => updateRow(r, { egress_members: c })}
                      accent="emerald"
                      compact
                      placeholder="10.50.1.10, 10.50.1.0/24, …"
                    />
                  </td>
                  {!hideIngress && (
                    <td className="py-1 pr-2">
                      <MemberChipList
                        chips={r.ingress_members}
                        onChange={(c) => updateRow(r, { ingress_members: c })}
                        accent="sky"
                        compact
                        disabled={!r.has_ingress}
                        placeholder={r.has_ingress ? 'VIPs / LBs' : '— enable ingress —'}
                      />
                    </td>
                  )}
                  <td className="py-1 text-right">
                    <button type="button" onClick={() => removeRow(r)}
                      className="text-[11px] text-red-600 hover:text-red-800">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Heritage rows */}
      <div className="space-y-1 pt-2 border-t border-emerald-200">
        <div className="flex items-center justify-between">
          <h5 className="text-[11px] font-semibold text-amber-700">
            Heritage presences ({heritageRows.length})
            <span className="ml-1 font-normal text-gray-500">— flat per DC, no NH/SZ. Group: <code>grp-&lt;APP&gt;-HERITAGE-&lt;DC&gt;</code></span>
          </h5>
          <button type="button" onClick={addHeritageRow}
            className="text-[11px] px-2 py-1 rounded bg-amber-600 text-white hover:bg-amber-700">
            + Add Heritage row
          </button>
        </div>
        {heritageRows.length === 0 ? (
          <div className="text-[11px] text-gray-500 italic px-2 py-2">
            No Heritage presences — add rows here for any DC where this app/service still serves traffic from non-NGDC infrastructure.
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-[11px] text-gray-500">
              <tr>
                <th className="text-left font-medium pb-1 w-32">Heritage DC</th>
                <th className="text-left font-medium pb-1 w-44" title="Which NGDC DCs route traffic into / out of this Heritage DC">
                  Source NGDC DCs
                </th>
                {!hideIngress && <th className="text-left font-medium pb-1 w-20">Ingress?</th>}
                <th className="text-left font-medium pb-1">Egress members</th>
                {!hideIngress && <th className="text-left font-medium pb-1">Ingress VIPs</th>}
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {heritageRows.map((r) => (
                <tr key={rowUid(r)} className="border-t border-amber-100 align-top">
                  <td className="py-1 pr-2">
                    <select value={r.dc_id}
                      onChange={(e) => updateRow(r, { dc_id: e.target.value })}
                      className="w-full border rounded px-1 py-1 text-xs">
                      {heritageOptions.length === 0 && <option value="" disabled>— no Heritage DCs —</option>}
                      {heritageOptions.map((d) => (
                        <option key={d.code} value={d.code}>{d.code}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1 pr-2">
                    <div className="flex flex-wrap gap-1 p-1 border rounded bg-white min-h-[28px]">
                      {ngdcOptions.map((d) => {
                        const code = d.code;
                        const checked = (r.ngdc_source_dcs || []).includes(code);
                        return (
                          <label key={code}
                            className={`inline-flex items-center gap-0.5 px-1 py-0.5 text-[10px] rounded cursor-pointer ${
                              checked
                                ? 'bg-emerald-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                            title={`${checked ? 'Disable' : 'Enable'} ${code} as a source for this Heritage DC`}>
                            <input type="checkbox" className="hidden"
                              checked={checked}
                              onChange={(e) => {
                                const cur = new Set(r.ngdc_source_dcs || []);
                                if (e.target.checked) cur.add(code);
                                else cur.delete(code);
                                updateRow(r, { ngdc_source_dcs: Array.from(cur) });
                              }} />
                            {code.replace(/_NGDC$/i, '')}
                          </label>
                        );
                      })}
                      {ngdcOptions.length === 0 && (
                        <span className="text-[10px] text-gray-400 italic">— no NGDC DCs registered —</span>
                      )}
                    </div>
                    {(r.ngdc_source_dcs || []).length === 0 && ngdcOptions.length > 0 && (
                      <p className="text-[10px] text-amber-700 mt-0.5">
                        None selected ⇒ fan-out across all NGDC DCs.
                      </p>
                    )}
                  </td>
                  {!hideIngress && (
                    <td className="py-1 pr-2">
                      <input type="checkbox" checked={r.has_ingress}
                        onChange={(e) => updateRow(r, { has_ingress: e.target.checked })} />
                    </td>
                  )}
                  <td className="py-1 pr-2">
                    <MemberChipList
                      chips={r.egress_members}
                      onChange={(c) => updateRow(r, { egress_members: c })}
                      accent="amber"
                      compact
                      placeholder="10.10.1.10, 10.10.1.0/24, …"
                    />
                  </td>
                  {!hideIngress && (
                    <td className="py-1 pr-2">
                      <MemberChipList
                        chips={r.ingress_members}
                        onChange={(c) => updateRow(r, { ingress_members: c })}
                        accent="sky"
                        compact
                        disabled={!r.has_ingress}
                        placeholder={r.has_ingress ? 'VIPs / LBs' : '— enable ingress —'}
                      />
                    </td>
                  )}
                  <td className="py-1 text-right">
                    <button type="button" onClick={() => removeRow(r)}
                      className="text-[11px] text-red-600 hover:text-red-800">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
