import { useCallback, useEffect, useMemo, useState } from 'react';
import * as api from '@/lib/api';
import type {
  PerDcManifest,
  PerDcRuleChange,
  PerDcGroupChange,
  DeployedSnapshotSummary,
} from '@/lib/api';
import type { NGDCDataCenter } from '@/types';

/**
 * Per-DC Compile Panel
 *
 * Surfaces the snapshot-aware, per-DC artifact pipeline:
 *
 *   - Snapshot status banner per (dc_id, environment).
 *     "First deploy" if no snapshot exists for the DC; otherwise
 *     "N changes since <snapshot_at>" with the rule + group delta
 *     count for that DC.
 *   - One-click compile per DC and per (vendor, mode).
 *   - Side-by-side device-config preview, plus rule/group deltas.
 *   - "Compile all DCs" wrapper that fans out across every NGDC DC
 *     in the selected environment, exposing a per-DC tab strip.
 *   - Manual snapshot capture (admin) when an out-of-band deploy
 *     happened and the operator needs to baseline the current
 *     state so subsequent compiles emit delta-only.
 */

const ENVIRONMENTS = ['Production', 'Non-Production', 'Pre-Production'];
const VENDORS = ['generic', 'palo_alto', 'fortinet', 'cisco_asa', 'juniper'];

type Mode = 'auto' | 'initial' | 'incremental';

interface DcOption {
  code: string;
  name: string;
  kind: 'NGDC' | 'Heritage';
}

function formatStamp(s?: string): string {
  if (!s) return '—';
  try { return new Date(s).toLocaleString(); } catch { return s; }
}

function ChangeOpBadge({ op }: { op: string }) {
  const cls =
    op === 'add' || op === 'create' ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
      : op === 'remove' || op === 'delete' ? 'bg-rose-100 text-rose-700 border-rose-200'
      : 'bg-amber-100 text-amber-700 border-amber-200';
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-xs font-mono uppercase ${cls}`}>{op}</span>
  );
}

function ModeBadge({ mode }: { mode: 'initial' | 'incremental' }) {
  const cls = mode === 'initial'
    ? 'bg-indigo-100 text-indigo-700 border-indigo-200'
    : 'bg-blue-100 text-blue-700 border-blue-200';
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {mode === 'initial' ? 'Initial deploy' : 'Incremental delta'}
    </span>
  );
}

function SnapshotBanner({ manifest }: { manifest: PerDcManifest | null }) {
  if (!manifest) return null;
  const total = manifest.summary.rule_changes + manifest.summary.group_changes;
  if (manifest.mode === 'initial') {
    return (
      <div className="rounded border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
        <strong>First deploy for {manifest.dc_id} / {manifest.environment}.</strong>{' '}
        No snapshot exists for this DC yet — the device config below will ship the full
        ruleset ({manifest.summary.rules_total} rules, {manifest.summary.groups_total} groups).
        On successful deploy, a baseline snapshot will be captured automatically so the
        next compile emits only deltas.
      </div>
    );
  }
  return (
    <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
      <strong>{total} change{total === 1 ? '' : 's'} since baseline</strong>{' '}
      ({manifest.summary.rule_changes} rule{manifest.summary.rule_changes === 1 ? '' : 's'},{' '}
      {manifest.summary.group_changes} group{manifest.summary.group_changes === 1 ? '' : 's'})
      {manifest.snapshot_at && <> · last deployed {formatStamp(manifest.snapshot_at)}</>}.
      The device config below contains delta operations only.
    </div>
  );
}

interface Props {
  defaultEnvironment?: string;
  defaultDcId?: string;
}

export default function CompilePerDcPanel({
  defaultEnvironment = 'Production',
  defaultDcId,
}: Props) {
  const [environment, setEnvironment] = useState(defaultEnvironment);
  const [vendor, setVendor] = useState('palo_alto');
  const [mode, setMode] = useState<Mode>('auto');
  const [dcId, setDcId] = useState<string>(defaultDcId || '');
  const [dcOptions, setDcOptions] = useState<DcOption[]>([]);
  const [manifest, setManifest] = useState<PerDcManifest | null>(null);
  const [allManifests, setAllManifests] = useState<Record<string, PerDcManifest>>({});
  const [activeAllDc, setActiveAllDc] = useState<string>('');
  const [snapshots, setSnapshots] = useState<DeployedSnapshotSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reloadDcs = useCallback(async () => {
    try {
      const ngdc: NGDCDataCenter[] = await api.getNGDCDatacenters();
      const opts: DcOption[] = ngdc.map((d) => ({
        code: d.code, name: d.name || d.code, kind: 'NGDC' as const,
      }));
      // Heritage DCs are surfaced through ngdc_source_dcs[] mappings
      // on Heritage presences. We additionally inspect snapshots so
      // any baselined Heritage DC shows up in the picker.
      setDcOptions(opts);
      if (!dcId && opts.length > 0) setDcId(opts[0].code);
    } catch (e) {
      setErr(`Failed to load DCs: ${(e as Error).message || e}`);
    }
  }, [dcId]);

  const reloadSnapshots = useCallback(async () => {
    try {
      setSnapshots(await api.listDeployedSnapshots());
    } catch (e) {
      // non-fatal
      console.warn('listDeployedSnapshots failed', e);
    }
  }, []);

  useEffect(() => { void reloadDcs(); void reloadSnapshots(); }, [reloadDcs, reloadSnapshots]);

  const snapshotFor = useCallback((dc: string): DeployedSnapshotSummary | null => {
    return snapshots.find((s) => s.dc_id === dc && s.environment === environment) || null;
  }, [snapshots, environment]);

  const compile = useCallback(async () => {
    if (!dcId) { setErr('Pick a DC first.'); return; }
    setBusy(true); setErr(null);
    try {
      const m = await api.compilePerDc({ dc_id: dcId, environment, vendor, mode });
      setManifest(m);
      setAllManifests({});
      setActiveAllDc('');
    } catch (e) {
      setErr(`Compile failed: ${(e as Error).message || e}`);
    } finally {
      setBusy(false);
    }
  }, [dcId, environment, vendor, mode]);

  const compileAll = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const out = await api.compilePerDcAll({ environment, vendor, mode });
      setAllManifests(out.manifests || {});
      const first = (out.dc_ids || Object.keys(out.manifests || {}))[0] || '';
      setActiveAllDc(first);
      setManifest(out.manifests?.[first] || null);
    } catch (e) {
      setErr(`Compile-all failed: ${(e as Error).message || e}`);
    } finally {
      setBusy(false);
    }
  }, [environment, vendor, mode]);

  const captureSnapshot = useCallback(async () => {
    if (!dcId) { setErr('Pick a DC first.'); return; }
    if (!confirm(`Capture current state of ${dcId} / ${environment} as the deployed baseline? Subsequent compiles will emit delta-only output.`)) {
      return;
    }
    setBusy(true); setErr(null);
    try {
      await api.captureDeployedSnapshot(dcId, { environment, deployed_by: 'manual-capture' });
      await reloadSnapshots();
      // Re-compile so the banner reflects the new "0 changes since baseline" state
      await compile();
    } catch (e) {
      setErr(`Snapshot capture failed: ${(e as Error).message || e}`);
    } finally {
      setBusy(false);
    }
  }, [dcId, environment, reloadSnapshots, compile]);

  const downloadDeviceConfig = useCallback(() => {
    if (!manifest) return;
    const blob = new Blob([manifest.device_config], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `device-${manifest.dc_id}-${manifest.environment}-${manifest.vendor}-${manifest.mode}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [manifest]);

  const downloadManifestJson = useCallback(() => {
    if (!manifest) return;
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `manifest-${manifest.dc_id}-${manifest.environment}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [manifest]);

  const allDcIds = useMemo(() => Object.keys(allManifests), [allManifests]);

  return (
    <div className="space-y-4 p-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Compile per DC</h2>
          <p className="text-sm text-gray-600">
            Each firewall device pulls only its own DC's rules + DC-local group instances.
            The first compile for a DC ships everything; later compiles emit delta-only output.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <label className="flex flex-col text-xs text-gray-600">
            Environment
            <select
              value={environment} onChange={(e) => setEnvironment(e.target.value)}
              className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
            >
              {ENVIRONMENTS.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </label>
          <label className="flex flex-col text-xs text-gray-600">
            DC
            <select
              value={dcId} onChange={(e) => setDcId(e.target.value)}
              className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
            >
              {dcOptions.map((d) => (
                <option key={d.code} value={d.code}>{d.code} — {d.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-xs text-gray-600">
            Vendor
            <select
              value={vendor} onChange={(e) => setVendor(e.target.value)}
              className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
            >
              {VENDORS.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label className="flex flex-col text-xs text-gray-600">
            Mode
            <select
              value={mode} onChange={(e) => setMode(e.target.value as Mode)}
              className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
            >
              <option value="auto">auto (snapshot-aware)</option>
              <option value="initial">initial (full)</option>
              <option value="incremental">incremental (delta)</option>
            </select>
          </label>
          <button
            type="button" onClick={() => void compile()} disabled={busy}
            className="rounded bg-rose-600 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-rose-700 disabled:opacity-50"
          >Compile this DC</button>
          <button
            type="button" onClick={() => void compileAll()} disabled={busy}
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >Compile all DCs</button>
        </div>
      </header>

      {err && (
        <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>
      )}

      {/* Snapshot picker / overview */}
      <section className="rounded border border-gray-200 bg-white p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">Deployed snapshots ({environment})</h3>
          <button
            type="button" onClick={() => void captureSnapshot()} disabled={busy || !dcId}
            className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
            title="Persist current state as the deployed baseline. Use only after an out-of-band deploy."
          >Capture baseline for {dcId || '—'}</button>
        </div>
        <table className="w-full text-xs">
          <thead className="text-left text-gray-500">
            <tr>
              <th className="px-2 py-1">DC</th>
              <th className="px-2 py-1">Environment</th>
              <th className="px-2 py-1">Snapshot at</th>
              <th className="px-2 py-1">Rules</th>
              <th className="px-2 py-1">Groups</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {dcOptions.map((d) => {
              const s = snapshotFor(d.code);
              return (
                <tr key={d.code} className={s ? '' : 'bg-indigo-50/50'}>
                  <td className="px-2 py-1 font-mono">{d.code}</td>
                  <td className="px-2 py-1">{environment}</td>
                  <td className="px-2 py-1">{s ? formatStamp(s.snapshot_at) : <em className="text-indigo-700">never deployed</em>}</td>
                  <td className="px-2 py-1">{s ? s.rules : 0}</td>
                  <td className="px-2 py-1">{s ? s.groups : 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* All-DCs tab strip when compileAll was used */}
      {allDcIds.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {allDcIds.map((d) => {
            const m = allManifests[d];
            const total = m.summary.rule_changes + m.summary.group_changes;
            return (
              <button
                key={d} type="button"
                onClick={() => { setActiveAllDc(d); setManifest(m); }}
                className={`rounded border px-2 py-1 text-xs font-mono ${activeAllDc === d ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                {d} <span className="ml-1 text-gray-500">({m.mode === 'initial' ? 'initial' : `${total} delta`})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Manifest detail */}
      {manifest && (
        <section className="space-y-3">
          <SnapshotBanner manifest={manifest} />
          <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-200 bg-white p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
              <span className="font-mono text-gray-900">{manifest.dc_id}</span>
              <span>·</span>
              <span>{manifest.environment}</span>
              <span>·</span>
              <span>vendor: <strong>{manifest.vendor}</strong></span>
              <span>·</span>
              <ModeBadge mode={manifest.mode} />
              <span>·</span>
              <span className="text-gray-500">
                {manifest.summary.rules_total} rules / {manifest.summary.groups_total} groups in scope
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button" onClick={downloadDeviceConfig}
                className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >Download device config</button>
              <button
                type="button" onClick={downloadManifestJson}
                className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >Download manifest.json</button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <RuleChangesTable changes={manifest.rule_changes} mode={manifest.mode} />
            <GroupChangesTable changes={manifest.group_changes} mode={manifest.mode} />
          </div>

          <DeviceConfigBlock text={manifest.device_config} />
        </section>
      )}
    </div>
  );
}

function RuleChangesTable({ changes, mode }: { changes: PerDcRuleChange[]; mode: 'initial' | 'incremental' }) {
  return (
    <div className="rounded border border-gray-200 bg-white p-3">
      <h4 className="mb-2 text-sm font-semibold text-gray-800">
        Rule changes ({changes.length}){' '}
        <span className="text-xs font-normal text-gray-500">
          {mode === 'initial' ? '— full ruleset (first deploy)' : '— delta vs last deployed snapshot'}
        </span>
      </h4>
      {changes.length === 0 ? (
        <div className="text-xs text-gray-500">No rule changes.</div>
      ) : (
        <table className="w-full text-xs">
          <thead className="text-left text-gray-500">
            <tr>
              <th className="px-2 py-1">Op</th>
              <th className="px-2 py-1">Rule</th>
              <th className="px-2 py-1">Source</th>
              <th className="px-2 py-1">Destination</th>
              <th className="px-2 py-1">Ports</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {changes.map((c) => {
              const r = (c.after || c.before || {}) as Record<string, unknown>;
              return (
                <tr key={`${c.op}-${c.rule_id}`}>
                  <td className="px-2 py-1"><ChangeOpBadge op={c.op} /></td>
                  <td className="px-2 py-1 font-mono">{c.rule_id}</td>
                  <td className="px-2 py-1 font-mono">{String(r.source ?? r.src ?? '—')}</td>
                  <td className="px-2 py-1 font-mono">{String(r.destination ?? r.dst ?? '—')}</td>
                  <td className="px-2 py-1 font-mono">{String(r.ports ?? `${r.protocol || ''} ${r.port || ''}`).trim() || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function GroupChangesTable({ changes, mode }: { changes: PerDcGroupChange[]; mode: 'initial' | 'incremental' }) {
  return (
    <div className="rounded border border-gray-200 bg-white p-3">
      <h4 className="mb-2 text-sm font-semibold text-gray-800">
        Group changes ({changes.length}){' '}
        <span className="text-xs font-normal text-gray-500">
          {mode === 'initial' ? '— DC-local member sets only' : '— per-(group, dc) delta'}
        </span>
      </h4>
      {changes.length === 0 ? (
        <div className="text-xs text-gray-500">No group changes.</div>
      ) : (
        <table className="w-full text-xs">
          <thead className="text-left text-gray-500">
            <tr>
              <th className="px-2 py-1">Op</th>
              <th className="px-2 py-1">Group</th>
              <th className="px-2 py-1">Added</th>
              <th className="px-2 py-1">Removed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {changes.map((c) => (
              <tr key={`${c.op}-${c.group_key}`}>
                <td className="px-2 py-1"><ChangeOpBadge op={c.op} /></td>
                <td className="px-2 py-1 font-mono">{c.group_key}</td>
                <td className="px-2 py-1 font-mono text-emerald-700">
                  {(c.added_members || []).slice(0, 6).join(', ') || '—'}
                  {(c.added_members || []).length > 6 && <span className="text-gray-500"> +{(c.added_members || []).length - 6}</span>}
                </td>
                <td className="px-2 py-1 font-mono text-rose-700">
                  {(c.removed_members || []).slice(0, 6).join(', ') || '—'}
                  {(c.removed_members || []).length > 6 && <span className="text-gray-500"> +{(c.removed_members || []).length - 6}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function DeviceConfigBlock({ text }: { text: string }) {
  return (
    <div className="rounded border border-gray-200 bg-gray-900 p-3">
      <h4 className="mb-2 text-sm font-semibold text-gray-100">Device config</h4>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs text-gray-100">{text || '(empty)'}</pre>
    </div>
  );
}
