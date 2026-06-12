import { useEffect, useMemo, useState } from 'react';
import * as api from '@/lib/api';
import type { BirthrightRule } from '@/types';

const empty: BirthrightRule = {
  birthright_id: '',
  scope_dc: '*',
  scope_nh: '*',
  scope_sz: '*',
  destination_kind: 'shared_service',
  destination_ref: '',
  ports: '',
  description: '',
};

type PolicyMatrixRow = {
  id?: string;
  matrix_type?: string;
  source_zone?: string;
  source_nh?: string;
  source_dc?: string;
  dest_zone?: string;
  dest_nh?: string;
  dest_dc?: string;
  action?: string;
  firewall_traversal?: string;
  reason?: string;
};

type PolicyMatrixBundle = {
  ngdc_prod: PolicyMatrixRow[];
  nonprod: PolicyMatrixRow[];
  preprod?: PolicyMatrixRow[];
  heritage_dc: PolicyMatrixRow[];
};

const ENV_TABS: Array<{ key: keyof PolicyMatrixBundle; label: string }> = [
  { key: 'ngdc_prod', label: 'NGDC Prod' },
  { key: 'nonprod', label: 'Non-Prod' },
  { key: 'preprod', label: 'Pre-Prod' },
  { key: 'heritage_dc', label: 'Heritage ↔ NGDC' },
];

function actionTone(action: string): string {
  const a = (action || '').toLowerCase();
  if (a.includes('block')) return 'bg-rose-100 text-rose-700 border-rose-200';
  if (a.includes('exception')) return 'bg-amber-100 text-amber-700 border-amber-200';
  if (a.includes('firewall') || a.includes('rule')) return 'bg-indigo-100 text-indigo-700 border-indigo-200';
  if (a.includes('permit') || a.includes('allow')) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  return 'bg-gray-100 text-gray-700 border-gray-200';
}

export default function BirthrightRulesTab() {
  const [items, setItems] = useState<BirthrightRule[]>([]);
  const [editing, setEditing] = useState<BirthrightRule | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [matrixBundle, setMatrixBundle] = useState<PolicyMatrixBundle | null>(null);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [activeMatrix, setActiveMatrix] = useState<keyof PolicyMatrixBundle>('ngdc_prod');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await api.listBirthrightRules());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  const loadMatrix = async () => {
    setMatrixLoading(true);
    try {
      // /api/reference/policy-matrix/all returns ngdc_prod + nonprod + heritage_dc + combined.
      // /api/reference/policy-matrix/preprod is separate (tracked outside `all`).
      const [bundle, preprod] = await Promise.all([
        api.getAllPolicyMatrices(),
        api.getPreprodMatrix().catch(() => [] as Record<string, unknown>[]),
      ]);
      setMatrixBundle({
        ngdc_prod: (bundle.ngdc_prod || []) as PolicyMatrixRow[],
        nonprod: (bundle.nonprod || []) as PolicyMatrixRow[],
        preprod: (preprod || []) as PolicyMatrixRow[],
        heritage_dc: (bundle.heritage_dc || []) as PolicyMatrixRow[],
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMatrixLoading(false);
    }
  };
  useEffect(() => { void load(); void loadMatrix(); }, []);

  const save = async () => {
    if (!editing) return;
    try {
      await api.upsertBirthrightRule(editing);
      setEditing(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async (id?: string) => {
    if (!id) return;
    if (!confirm(`Delete birthright service overlay ${id}?`)) return;
    try {
      await api.deleteBirthrightRule(id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const activeRows = useMemo<PolicyMatrixRow[]>(() => {
    if (!matrixBundle) return [];
    return (matrixBundle[activeMatrix] || []) as PolicyMatrixRow[];
  }, [matrixBundle, activeMatrix]);

  const matrixCounts = useMemo(() => {
    const c = { permitted: 0, rule: 0, blocked: 0 };
    if (!matrixBundle) return c;
    Object.values(matrixBundle).forEach((rows) => {
      (rows as PolicyMatrixRow[] | undefined)?.forEach((r) => {
        const a = (r.action || '').toLowerCase();
        if (a.includes('block')) c.blocked++;
        else if (a.includes('firewall') || a.includes('rule') || a.includes('exception')) c.rule++;
        else if (a.includes('permit') || a.includes('allow')) c.permitted++;
      });
    });
    return c;
  }, [matrixBundle]);

  return (
    <div className="space-y-5">
      {/* ---- INTRO ---- */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-[11px] text-emerald-900 space-y-1.5">
        <div className="font-semibold text-sm">Birthright = what every workload already gets, no rule request needed</div>
        <p>
          The <strong>Policy Matrix</strong> below is the architectural source of truth for birthright access at the
          zone-pair level — it defines for each (Source SZ, Destination SZ, Environment) whether traffic is{' '}
          <span className="px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200">
            Permitted (implicit allow)
          </span>
          ,{' '}
          <span className="px-1 py-0.5 rounded bg-indigo-100 text-indigo-700 border border-indigo-200">
            Firewall Request Required
          </span>
          , or{' '}
          <span className="px-1 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200">
            Blocked
          </span>
          . Cross-SZ / cross-NH / cross-DC semantics live here.
        </p>
        <p>
          The <strong>Service Overlay</strong> at the bottom layers <em>service-level</em> birthrights (DNS, NTP, Splunk,
          AppD, PKI, AD/Kerberos) on top — they only kick in for cells where the matrix says "Firewall Request Required"
          but the destination/port is on the universal-services list. Validation runs Policy Matrix first, then the overlay.
        </p>
        <p className="text-emerald-700">
          Edit the matrix in <strong>Settings → Standardization → Policy Matrices</strong>. This tab shows it read-only.
        </p>
      </div>

      {error && <div className="rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">{error}</div>}

      {/* ---- POLICY MATRIX ---- */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Policy Matrix (zone-pair birthright)</h3>
            <p className="text-[11px] text-gray-500">
              {matrixCounts.permitted} permitted · {matrixCounts.rule} rule-required · {matrixCounts.blocked} blocked across all environments.
            </p>
          </div>
          <div className="flex items-center gap-1">
            {ENV_TABS.map(t => (
              <button key={t.key} onClick={() => setActiveMatrix(t.key)}
                className={`text-[11px] px-2.5 py-1 rounded border ${
                  activeMatrix === t.key
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}>
                {t.label}
                <span className="ml-1.5 text-[10px] opacity-70">
                  {(matrixBundle?.[t.key]?.length ?? 0)}
                </span>
              </button>
            ))}
          </div>
        </div>

        {matrixLoading ? (
          <div className="text-xs text-gray-400 italic">Loading policy matrix…</div>
        ) : activeRows.length === 0 ? (
          <div className="text-xs text-gray-400 italic">No matrix entries for this environment.</div>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left p-2 w-16">ID</th>
                  <th className="text-left p-2">Source (SZ · NH · DC)</th>
                  <th className="text-left p-2">Destination (SZ · NH · DC)</th>
                  <th className="text-left p-2 w-44">Action</th>
                  <th className="text-left p-2">Firewall Traversal</th>
                  <th className="text-left p-2">Reason</th>
                </tr>
              </thead>
              <tbody>
                {activeRows.map((r, idx) => (
                  <tr key={r.id || idx} className="border-t border-gray-100 align-top">
                    <td className="p-2 font-mono text-[10px] text-gray-500">{r.id || '—'}</td>
                    <td className="p-2 font-mono text-[10px]">
                      <div>SZ: <span className="text-gray-900">{r.source_zone || '—'}</span></div>
                      <div className="text-gray-500">NH: {r.source_nh || '—'} · DC: {r.source_dc || '—'}</div>
                    </td>
                    <td className="p-2 font-mono text-[10px]">
                      <div>SZ: <span className="text-gray-900">{r.dest_zone || '—'}</span></div>
                      <div className="text-gray-500">NH: {r.dest_nh || '—'} · DC: {r.dest_dc || '—'}</div>
                    </td>
                    <td className="p-2">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${actionTone(r.action || '')}`}>
                        {r.action || '—'}
                      </span>
                    </td>
                    <td className="p-2 text-[10px] text-gray-700">{r.firewall_traversal || '—'}</td>
                    <td className="p-2 text-[10px] text-gray-600">{r.reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---- SERVICE OVERLAY ---- */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Service Overlay <span className="font-normal text-gray-500">— universal services on top of the matrix</span></h3>
            <p className="text-[11px] text-gray-500">
              DNS, NTP, Splunk forwarder, AppDynamics, PKI/OCSP, AD/Kerberos — the boilerplate flows every server depends on.
              Only consulted for matrix cells that say "Firewall Request Required".
            </p>
          </div>
          <button onClick={() => setEditing({ ...empty })}
            className="text-xs px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700">
            + New service overlay
          </button>
        </div>

        {loading ? (
          <div className="text-xs text-gray-400 italic">Loading…</div>
        ) : items.length === 0 ? (
          <div className="text-xs text-gray-400 italic">No service overlays defined.</div>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left p-2">ID</th>
                  <th className="text-left p-2">Scope (DC · NH · SZ)</th>
                  <th className="text-left p-2">Destination</th>
                  <th className="text-left p-2">Ports</th>
                  <th className="text-left p-2">Description</th>
                  <th className="text-right p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((b) => (
                  <tr key={b.birthright_id} className="border-t border-gray-100">
                    <td className="p-2 font-mono">{b.birthright_id}</td>
                    <td className="p-2 font-mono text-[10px]">
                      {b.scope_dc} · {b.scope_nh} · {b.scope_sz}
                    </td>
                    <td className="p-2">{b.destination_kind}: <span className="font-mono">{b.destination_ref}</span></td>
                    <td className="p-2 font-mono text-[10px]">{b.ports}</td>
                    <td className="p-2 text-gray-600">{b.description}</td>
                    <td className="p-2 text-right">
                      <button onClick={() => setEditing({ ...b })}
                        className="text-[11px] px-2 py-1 rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100 mr-1">
                        Edit
                      </button>
                      <button onClick={() => void remove(b.birthright_id)}
                        className="text-[11px] px-2 py-1 rounded bg-rose-50 text-rose-700 hover:bg-rose-100">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---- EDITOR ---- */}
      {editing && (
        <div className="border border-emerald-200 bg-emerald-50/60 rounded-lg p-3 space-y-2">
          <div className="text-xs font-semibold text-emerald-900">
            {editing.birthright_id ? 'Edit' : 'New'} service overlay
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <label className="space-y-0.5">
              <span className="text-gray-600">ID</span>
              <input className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                value={editing.birthright_id || ''}
                onChange={(e) => setEditing({ ...editing, birthright_id: e.target.value })}
                placeholder="e.g. BR-DNS-PROD" />
            </label>
            <label className="space-y-0.5">
              <span className="text-gray-600">Destination kind</span>
              <select className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                value={editing.destination_kind}
                onChange={(e) => setEditing({ ...editing, destination_kind: e.target.value as BirthrightRule['destination_kind'] })}>
                <option value="shared_service">shared_service</option>
                <option value="app_ingress">app_ingress</option>
              </select>
            </label>
            <label className="space-y-0.5">
              <span className="text-gray-600">Destination ref</span>
              <input className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                value={editing.destination_ref || ''}
                onChange={(e) => setEditing({ ...editing, destination_ref: e.target.value })}
                placeholder="e.g. SS-DNS / 10.0.0.0/24" />
            </label>
            <label className="space-y-0.5">
              <span className="text-gray-600">Ports</span>
              <input className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                value={editing.ports || ''}
                onChange={(e) => setEditing({ ...editing, ports: e.target.value })}
                placeholder="e.g. UDP 53, TCP 53" />
            </label>
            <label className="space-y-0.5">
              <span className="text-gray-600">Scope DC</span>
              <input className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                value={editing.scope_dc || '*'}
                onChange={(e) => setEditing({ ...editing, scope_dc: e.target.value })} />
            </label>
            <label className="space-y-0.5">
              <span className="text-gray-600">Scope NH</span>
              <input className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                value={editing.scope_nh || '*'}
                onChange={(e) => setEditing({ ...editing, scope_nh: e.target.value })} />
            </label>
            <label className="space-y-0.5">
              <span className="text-gray-600">Scope SZ</span>
              <input className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                value={editing.scope_sz || '*'}
                onChange={(e) => setEditing({ ...editing, scope_sz: e.target.value })} />
            </label>
            <label className="space-y-0.5 col-span-2">
              <span className="text-gray-600">Description</span>
              <input className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                value={editing.description || ''}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setEditing(null)}
              className="text-xs px-3 py-1.5 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button onClick={() => void save()}
              className="text-xs px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700">
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
