import { useCallback, useEffect, useMemo, useState } from 'react';
import SharedServicesSidebar from './SharedServicesSidebar';
import PortPicker from './PortPicker';
import type {
  Application,
  AppPresence,
  DedupMatch,
  DestinationEntityKind,
  Environment,
  PhysicalRuleExpansion,
  RuleExpansionPreview,
  RuleRequestRecord,
  SharedService,
  SharedServicePresence,
} from '@/types';
import type { PresenceKey } from '@/lib/api';
import * as api from '@/lib/api';
import { useTeam } from '@/contexts/TeamContext';

const presenceKey = (dc: string, nh: string, sz: string) => `${dc}|${nh}|${sz}`;
const fromKey = (k: string): PresenceKey => {
  const [dc_id, nh_id, sz_code] = k.split('|');
  return { dc_id, nh_id, sz_code };
};
/** Legacy Shared Services (seeded before presences had a stable nh_id)
 *  can still have app-style (nh_id, sz_code); we derive egress group name. */
const appEgressGroupName = (app: string, nh: string, sz: string) =>
  `grp-${app}-${nh}-${sz}`;
const appIngressGroupName = (app: string, nh: string, sz: string) =>
  `grp-${app}-${nh}-${sz}-Ingress`;
const sharedServiceGroupName = (sid: string, nh: string, sz: string) =>
  `grp-${sid}-${nh}-${sz}`;

interface RuleRequestBuilderProps {
  applications: Application[];
  onSubmitted?: (requestId?: string) => void;
}

const ENVIRONMENTS: Environment[] = ['Production', 'Non-Production', 'Pre-Production'];
const ACTIONS: ('ACCEPT' | 'DROP')[] = ['ACCEPT', 'DROP'];

interface DestRef {
  kind: DestinationEntityKind;
  ref: string;
  label: string;
  hint?: string;
}

type SrcKind = 'app' | 'shared_service';

export default function RuleRequestBuilder({ applications, onSubmitted }: RuleRequestBuilderProps) {
  // Power-user toggles (cross-DC / destination-DC override) are SNS-only —
  // app teams must not see destination DC complexity (they don't think in
  // those terms). The TeamContext today defaults to SNS = god-view, so
  // until SSO/AD-group integration lands these stay visible to admins
  // only.
  const { isGodView } = useTeam();
  // Architectural choice: app users do NOT pick (DC · NH · SZ) presences.
  // The backend auto-derives the per-DC fan-out from App Management
  // (source = every DC's egress IPs/CIDRs for the source app, destination
  // = the shared service VIP/LB or the destination app's ingress per DC).
  // SNS / power users can still override via this Advanced toggle when
  // they need surgical scoping (DR cutover, pinned active-active, etc.).
  const [advancedMode, setAdvancedMode] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [environment, setEnvironment] = useState<Environment>('Production');
  // Source can now be either an Application or a Shared Service. Default
  // to 'app' for back-compat; switching to 'shared_service' lets ops raise
  // SS→App / SS→SS rules (Splunk→app APIs, Kerberos→LDAP, etc.).
  const [srcKind, setSrcKind] = useState<SrcKind>('app');
  const [srcApp, setSrcApp] = useState<string>('');
  const [dest, setDest] = useState<DestRef | null>(null);
  const [ports, setPorts] = useState('TCP 443');
  const [action, setAction] = useState<'ACCEPT' | 'DROP'>('ACCEPT');
  const [description, setDescription] = useState('');
  // Cross-DC pairing inside NGDC is intentionally not exposed: every
  // app/service lives in all 4 NGDC DCs, so traffic always pairs
  // same-DC (ALPHA→ALPHA, …). Cross-DC reasoning only applies to
  // NGDC↔Heritage, governed by the Heritage presence's
  // `ngdc_source_dcs[]` mapping declared on the editor.
  // Optional: explicit destination DC override (DR cutover / pinned active-active).
  // Empty string ⇒ use destination's primary_dc (default behaviour).
  const [destinationDcOverride, setDestinationDcOverride] = useState<string>('');

  const [services, setServices] = useState<SharedService[]>([]);
  const [ssPresences, setSsPresences] = useState<Record<string, SharedServicePresence[]>>({});
  const [appPresences, setAppPresences] = useState<AppPresence[]>([]);
  const [preview, setPreview] = useState<RuleExpansionPreview | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedRecord, setSubmittedRecord] = useState<RuleRequestRecord | null>(null);

  // Per-presence scoping selections. Empty set = use all presences.
  const [selectedSrcKeys, setSelectedSrcKeys] = useState<Set<string>>(new Set());
  const [selectedDstKeys, setSelectedDstKeys] = useState<Set<string>>(new Set());

  const loadRefs = useCallback(async () => {
    try {
      const [svcs, aps] = await Promise.all([
        api.getSharedServices(),
        api.getAppPresences(),
      ]);
      setServices(svcs);
      setAppPresences(aps);
      const entries = await Promise.all(
        svcs.map(async (s) => [s.service_id, await api.getSharedServicePresences(s.service_id)] as const),
      );
      const m: Record<string, SharedServicePresence[]> = {};
      for (const [k, v] of entries) m[k] = v;
      setSsPresences(m);
    } catch {
      /* handled inline */
    }
  }, []);

  useEffect(() => { void loadRefs(); }, [loadRefs]);

  // Apps that have at least one ingress-enabled presence → eligible as destination
  const appsWithIngress = useMemo(() => {
    const ids = new Set(
      appPresences
        .filter((p) => p.has_ingress && p.environment === environment)
        .map((p) => p.app_distributed_id),
    );
    return applications.filter((a) => a.app_distributed_id && ids.has(a.app_distributed_id));
  }, [appPresences, applications, environment]);

  const unifiedDestinations: DestRef[] = useMemo(() => {
    const svc = services
      .filter((s) => (s.environments || []).includes(environment))
      .map<DestRef>((s) => ({
        kind: 'shared_service',
        ref: s.service_id,
        label: `${s.icon ?? '🧩'} ${s.name}`,
        hint: `${s.category} · Shared Service`,
      }));
    const apps = appsWithIngress.map<DestRef>((a) => ({
      kind: 'app_ingress',
      ref: a.app_distributed_id || a.app_id,
      label: (() => {
        const id = a.app_distributed_id || a.app_id;
        const friendly = (a.app_name ?? '').trim();
        return friendly ? `🏢 ${id} — ${friendly}` : `🏢 ${id}`;
      })(),
      hint: 'Application (Ingress)',
    }));
    return [...svc, ...apps];
  }, [services, appsWithIngress, environment]);

  const srcOptions = useMemo(() => applications.filter((a) => a.app_distributed_id), [applications]);
  const srcServiceOptions = useMemo(
    () => services.filter((s) => (s.environments || []).includes(environment)),
    [services, environment],
  );

  // Per-app / per-service presence candidates for the current environment.
  // When either list has >1 entry we surface checkboxes so the user picks
  // the (NH, SZ) the rule should apply to — otherwise fan-out uses all.
  const srcPresenceCandidates = useMemo<PresenceKey[]>(() => {
    if (!srcApp) return [];
    if (srcKind === 'shared_service') {
      const list = ssPresences[srcApp] || [];
      return list
        .filter((p) => p.environment === environment)
        .map((p) => ({ dc_id: p.dc_id, nh_id: p.nh_id, sz_code: p.sz_code }));
    }
    return appPresences
      .filter((p) => p.app_distributed_id?.toUpperCase() === srcApp.toUpperCase()
                  && p.environment === environment)
      .map((p) => ({ dc_id: p.dc_id, nh_id: p.nh_id, sz_code: p.sz_code }));
  }, [srcApp, srcKind, environment, appPresences, ssPresences]);

  const dstPresenceCandidates = useMemo<PresenceKey[]>(() => {
    if (!dest?.ref) return [];
    if (dest.kind === 'shared_service') {
      const list = ssPresences[dest.ref] || [];
      return list
        .filter((p) => p.environment === environment)
        .map((p) => ({ dc_id: p.dc_id, nh_id: p.nh_id, sz_code: p.sz_code }));
    }
    if (dest.kind === 'app_ingress') {
      return appPresences
        .filter((p) => p.app_distributed_id?.toUpperCase() === dest.ref.toUpperCase()
                    && p.environment === environment
                    && p.has_ingress)
        .map((p) => ({ dc_id: p.dc_id, nh_id: p.nh_id, sz_code: p.sz_code }));
    }
    return [];
  }, [dest, environment, ssPresences, appPresences]);

  // When src/dst/env change, forget prior presence scoping (UI defaults back
  // to "all presences"). Avoids stale selections referencing a stale app.
  useEffect(() => { setSelectedSrcKeys(new Set()); }, [srcApp, srcKind, environment]);
  useEffect(() => { setSelectedDstKeys(new Set()); }, [dest?.ref, dest?.kind, environment]);

  const effectiveSrcPresences = useMemo<PresenceKey[] | undefined>(() => {
    if (selectedSrcKeys.size === 0) return undefined;
    return Array.from(selectedSrcKeys).map(fromKey);
  }, [selectedSrcKeys]);
  const effectiveDstPresences = useMemo<PresenceKey[] | undefined>(() => {
    if (selectedDstKeys.size === 0) return undefined;
    return Array.from(selectedDstKeys).map(fromKey);
  }, [selectedDstKeys]);

  // Resolved destination shared-service object (for default ports lookup)
  const destService = useMemo<SharedService | null>(() => {
    if (dest?.kind !== 'shared_service' || !dest.ref) return null;
    return services.find((s) => s.service_id === dest.ref) ?? null;
  }, [dest, services]);

  // Default ports to surface in the Port Picker's pinned strip based on
  // the chosen destination. Shared services contribute their standard
  // catalog ports + service-specific additional ports. Apps (ingress)
  // contribute the ingress_ports declared on the in-scope presences —
  // this is the "App Management owns its own ports" side of Option B.
  const portDefaults = useMemo<import('./PortPicker').PortPickerDefaults | null>(() => {
    if (dest?.kind === 'shared_service' && destService) {
      return {
        label: destService.name,
        standardPortIds: destService.standard_ports || [],
        additionalPorts: destService.additional_ports || [],
      };
    }
    if (dest?.kind === 'app_ingress' && dest.ref) {
      const candidates = effectiveDstPresences && effectiveDstPresences.length > 0
        ? appPresences.filter((p) => p.app_distributed_id?.toUpperCase() === dest.ref!.toUpperCase()
            && p.environment === environment
            && p.has_ingress
            && effectiveDstPresences.some((k) => k.dc_id === p.dc_id && k.nh_id === p.nh_id && k.sz_code === p.sz_code))
        : appPresences.filter((p) => p.app_distributed_id?.toUpperCase() === dest.ref!.toUpperCase()
            && p.environment === environment && p.has_ingress);
      const seenIds = new Set<string>();
      const standardIds: string[] = [];
      const addl: Array<NonNullable<AppPresence['ingress_ports']>[number]> = [];
      for (const p of candidates) {
        for (const b of p.ingress_ports || []) {
          if (b.port_id) {
            if (!seenIds.has(b.port_id)) { seenIds.add(b.port_id); standardIds.push(b.port_id); }
          } else if (b.port) {
            const key = `${b.protocol || 'TCP'}:${b.port}`;
            if (!seenIds.has(key)) { seenIds.add(key); addl.push(b); }
          }
        }
      }
      if (standardIds.length === 0 && addl.length === 0) return null;
      const hit = applications.find((a) => a.app_distributed_id === dest.ref);
      const appLabel = hit?.app_name || dest.ref;
      return { label: `${appLabel} (ingress)`, standardPortIds: standardIds, additionalPorts: addl };
    }
    return null;
  }, [dest, destService, effectiveDstPresences, appPresences, environment, applications]);

  // Preview fan-out when inputs change
  useEffect(() => {
    setPreview(null);
    if (!srcApp || !dest?.ref) return;
    let cancelled = false;
    void (async () => {
      try {
        const p = await api.previewRuleExpansion({
          source_kind: srcKind,
          source_ref: srcApp,
          application_ref: srcKind === 'app' ? srcApp : '',
          destination_kind: dest.kind,
          destination_ref: dest.ref,
          environment,
          ports,
          action,
          destination_dc_override: destinationDcOverride || undefined,
          source_presences: effectiveSrcPresences,
          destination_presences: effectiveDstPresences,
        });
        if (!cancelled) setPreview(p);
      } catch (e) {
        if (!cancelled) setPreview({ physical_rules: [], warnings: [`Preview failed: ${(e as Error).message}`] });
      }
    })();
    return () => { cancelled = true; };
  }, [srcApp, srcKind, dest, environment, ports, action,
      destinationDcOverride, effectiveSrcPresences, effectiveDstPresences]);

  const onDropDestination = (e: React.DragEvent) => {
    e.preventDefault();
    const sid = e.dataTransfer.getData('application/x-shared-service');
    if (!sid) return;
    const s = services.find((x) => x.service_id === sid);
    if (s) setDest({
      kind: 'shared_service',
      ref: s.service_id,
      label: `${s.icon ?? '🧩'} ${s.name}`,
      hint: `${s.category} · Shared Service`,
    });
  };

  const submit = async () => {
    if (!srcApp || !dest?.ref) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const r = await api.createRuleRequest({
        source_kind: srcKind,
        source_ref: srcApp,
        application_ref: srcKind === 'app' ? srcApp : '',
        destination_kind: dest.kind,
        destination_ref: dest.ref,
        environment,
        ports,
        action,
        description,
        destination_dc_override: destinationDcOverride || undefined,
        source_presences: effectiveSrcPresences,
        destination_presences: effectiveDstPresences,
      });
      // Backend returns ``request_id=null`` + ``block_submit=true`` when
      // the dedup engine refuses the submit. Surface that as a validation
      // banner instead of treating it as a successful submission.
      if (!r.request_id || r.block_submit) {
        setSubmitError(r.validation_message || 'Submit blocked by validation.');
      } else {
        setSubmittedRecord(r);
        onSubmitted?.(r.request_id ?? undefined);
      }
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setStep(1); setSrcKind('app'); setSrcApp(''); setDest(null); setPorts('TCP 443');
    setAction('ACCEPT'); setDescription('');
    setDestinationDcOverride('');
    setSelectedSrcKeys(new Set()); setSelectedDstKeys(new Set());
    setPreview(null); setSubmittedRecord(null); setSubmitError(null);
  };

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12 lg:col-span-3">
        <SharedServicesSidebar
          services={services}
          presences={ssPresences}
          environment={environment}
          selectedServiceId={dest?.kind === 'shared_service' ? dest.ref : null}
          onSelect={(s) => setDest({
            kind: 'shared_service',
            ref: s.service_id,
            label: `${s.icon ?? '🧩'} ${s.name}`,
            hint: `${s.category} · Shared Service`,
          })}
        />
      </div>

      <div className="col-span-12 lg:col-span-9 space-y-4">
        {/* Stepper */}
        <div className="flex items-center gap-2 text-sm">
          {[
            { n: 1, label: 'Source & Destination' },
            { n: 2, label: 'Ports & Action' },
            { n: 3, label: 'Fan-out Preview' },
          ].map((s, idx) => (
            <div key={s.n} className="flex items-center gap-2">
              <button
                onClick={() => setStep(s.n as 1 | 2 | 3)}
                className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center ${step === s.n ? 'bg-indigo-600 text-white' : step > s.n ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'}`}>
                {s.n}
              </button>
              <span className={`text-xs ${step === s.n ? 'text-indigo-700 font-semibold' : 'text-gray-600'}`}>{s.label}</span>
              {idx < 2 && <span className="text-gray-300">›</span>}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Environment</label>
                <select value={environment} onChange={(e) => setEnvironment(e.target.value as Environment)}
                  className="w-full border rounded px-2 py-1.5 text-sm">
                  {ENVIRONMENTS.map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Source (Application or Shared Service)</label>
                <select
                  value={srcKind === 'shared_service' ? `ss:${srcApp}` : `app:${srcApp}`}
                  onChange={(e) => {
                    const [k, ...rest] = e.target.value.split(':');
                    const ref = rest.join(':');
                    if (k === 'ss') { setSrcKind('shared_service'); setSrcApp(ref); }
                    else { setSrcKind('app'); setSrcApp(ref); }
                  }}
                  className="w-full border rounded px-2 py-1.5 text-sm">
                  <option value="app:">— select source —</option>
                  <optgroup label="Applications">
                    {srcOptions.map((a) => {
                      const id = a.app_distributed_id || a.app_id;
                      const friendly = (a.app_name ?? '').trim();
                      const label = friendly ? `${id} — ${friendly}` : id;
                      return (
                        <option key={`app-${id}`} value={`app:${id}`}>{label}</option>
                      );
                    })}
                  </optgroup>
                  <optgroup label="Shared Services (as source)">
                    {srcServiceOptions.map((s) => (
                      <option key={`ss-${s.service_id}`} value={`ss:${s.service_id}`}>
                        {s.icon ?? '🧩'} {s.name}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Destination (Apps with Ingress ∪ Shared Services)</label>
              <select value={dest?.ref ?? ''}
                onChange={(e) => {
                  const d = unifiedDestinations.find((x) => x.ref === e.target.value);
                  setDest(d ?? null);
                }}
                className="w-full border rounded px-2 py-1.5 text-sm">
                <option value="">— select destination —</option>
                <optgroup label="Shared Services">
                  {unifiedDestinations.filter((d) => d.kind === 'shared_service')
                    .map((d) => <option key={`ss-${d.ref}`} value={d.ref}>{d.label}</option>)}
                </optgroup>
                <optgroup label="Applications (with Ingress)">
                  {unifiedDestinations.filter((d) => d.kind === 'app_ingress')
                    .map((d) => <option key={`ai-${d.ref}`} value={d.ref}>{d.label}</option>)}
                </optgroup>
              </select>

              {/* DnD drop zone */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDropDestination}
                className={`mt-2 border-2 border-dashed rounded-xl p-4 text-center transition ${dest ? 'border-indigo-300 bg-indigo-50' : 'border-gray-300 bg-gray-50 hover:bg-indigo-50/60'}`}>
                {dest ? (
                  <div>
                    <div className="text-xs uppercase tracking-wider text-gray-500">Destination</div>
                    <div className="text-lg font-semibold text-gray-900">{dest.label}</div>
                    {dest.hint && <div className="text-xs text-gray-500 mt-0.5">{dest.hint}</div>}
                    <div className="mt-2">
                      <button onClick={() => setDest(null)}
                        className="text-xs text-rose-600 hover:text-rose-800">Clear</button>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-gray-500">
                    Drag a <span className="font-semibold text-indigo-600">Shared Service</span> from the sidebar,
                    or pick one above.
                  </div>
                )}
              </div>
            </div>

            {/* Per-presence scoping — gated behind Advanced (SNS only).
                App users never see this: the backend auto-derives per-DC
                fan-out from App Management (source = all DC egress IPs/
                CIDRs of source app; destination = shared service VIP/LB
                or destination app's ingress VIP per DC). */}
            {isGodView && (
              <div className="flex items-center justify-between p-2 rounded border border-amber-200 bg-amber-50">
                <div className="text-xs">
                  <span className="font-semibold text-amber-800">Advanced (SNS):</span>
                  <span className="text-amber-700 ml-2">
                    Manually scope which (DC · NH · SZ) presences this rule applies to.
                    Off = backend auto-derives the full fan-out from App Management.
                  </span>
                </div>
                <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={advancedMode}
                    onChange={(e) => {
                      setAdvancedMode(e.target.checked);
                      if (!e.target.checked) {
                        setSelectedSrcKeys(new Set());
                        setSelectedDstKeys(new Set());
                      }
                    }}
                  />
                  <span className="font-medium">Manual presence override</span>
                </label>
              </div>
            )}
            {isGodView && advancedMode && (<>
            <PresencePicker
              title={`Source presences — which (DC · NH · SZ) for ${srcApp || 'the source'}?`}
              subtitle={srcKind === 'shared_service'
                ? 'Each checked presence becomes one PhysicalRule with the matching grp-<Service>-<NH>-<SZ> source group. Leave all unchecked to fan out across every presence (default).'
                : 'Each checked presence becomes one PhysicalRule with the matching grp-<App>-<NH>-<SZ> source group. Leave all unchecked to fan out across every presence (default).'}
              emptyHint={srcApp
                ? `This ${srcKind === 'shared_service' ? 'service' : 'app'} has no presence in the selected environment.`
                : 'Pick a source first.'}
              makeGroupName={(p) => srcKind === 'shared_service'
                ? sharedServiceGroupName(srcApp || 'SVC', p.nh_id, p.sz_code)
                : appEgressGroupName(srcApp || 'APP', p.nh_id, p.sz_code)}
              candidates={srcPresenceCandidates}
              selected={selectedSrcKeys}
              onChange={setSelectedSrcKeys}
            />
            <PresencePicker
              title={`Destination presences — which (DC · NH · SZ) for ${dest?.label || 'the destination'}?`}
              subtitle={dest?.kind === 'app_ingress'
                ? 'Each checked presence becomes the destination grp-<App>-<NH>-<SZ>-Ingress group.'
                : 'Each checked presence becomes the destination grp-<Service>-<NH>-<SZ> group.'}
              emptyHint={dest ? 'This destination has no matching presence in the selected environment.' : 'Pick a destination first.'}
              makeGroupName={(p) => dest?.kind === 'app_ingress'
                ? appIngressGroupName(dest?.ref || 'APP', p.nh_id, p.sz_code)
                : sharedServiceGroupName(dest?.ref || 'SVC', p.nh_id, p.sz_code)}
              candidates={dstPresenceCandidates}
              selected={selectedDstKeys}
              onChange={setSelectedDstKeys}
            />
            </>)}
            {!isGodView && (
              <div className="text-xs text-gray-500 italic px-2">
                Per-DC fan-out is auto-derived from App Management — source presences map to
                every DC's egress IPs/CIDRs of the source app, and destination resolves to the
                shared service VIP/LB or the destination app's ingress VIP per DC.
              </div>
            )}

            <div className="flex justify-end">
              <button disabled={!srcApp || !dest} onClick={() => setStep(2)}
                className="px-4 py-1.5 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-300">
                Next: Ports & Action
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Ports</label>
                <PortPicker
                  value={ports}
                  onChange={setPorts}
                  placeholder="Search/pick ports (HTTPS, Oracle, Mongo, Kafka, …)"
                  defaults={portDefaults}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Action</label>
                <select value={action} onChange={(e) => setAction(e.target.value as 'ACCEPT' | 'DROP')}
                  className="w-full border rounded px-2 py-1.5 text-sm">
                  {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm"
                placeholder="Business justification / ticket / context" />
            </div>
            {isGodView ? (
              <details className="border border-amber-200 bg-amber-50/50 rounded-lg p-3 space-y-2">
                <summary className="text-[11px] font-semibold text-amber-800 cursor-pointer">Advanced (SNS only) — Power-user Overrides</summary>
                <p className="text-[11px] text-gray-600 mt-2">
                  Rules fan out automatically across <strong>all 4 NGDC DCs</strong> with strict
                  same-DC pairing (ALPHA→ALPHA, BETA→BETA, …). NGDC↔Heritage routing follows
                  the Heritage presence's <code className="font-mono">ngdc_source_dcs[]</code>
                  mapping. Use the override below only for DR cutover / pinned active-active.
                </p>
                <label className="flex items-center gap-2 text-xs text-gray-700">
                  <span className="min-w-[150px]"><strong>Destination DC override</strong></span>
                  <select value={destinationDcOverride}
                    onChange={(e) => setDestinationDcOverride(e.target.value)}
                    className="border rounded px-2 py-1 text-xs">
                    <option value="">Use destination's primary DC (default)</option>
                    <option value="ALPHA_NGDC">ALPHA_NGDC</option>
                    <option value="BETA_NGDC">BETA_NGDC</option>
                    <option value="GAMMA_NGDC">GAMMA_NGDC</option>
                    <option value="DELTA_NGDC">DELTA_NGDC</option>
                  </select>
                </label>
              </details>
            ) : (
              <div className="border border-emerald-200 bg-emerald-50/50 rounded-lg p-2 text-[11px] text-emerald-800">
                Your rule will originate from your app's primary DC. The destination team handles east-west routing across their other DCs — you don't need to think in DC terms.
              </div>
            )}
            <div className="flex justify-between">
              <button onClick={() => setStep(1)} className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50">Back</button>
              <button onClick={() => setStep(3)}
                className="px-4 py-1.5 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-700">
                Next: Preview fan-out
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-900">Multi-DC Fan-out Preview</div>
                <div className="text-xs text-gray-500">
                  {srcApp} → {dest?.label} · {environment} · {ports}
                </div>
              </div>
              <button onClick={() => void (async () => {
                const p = await api.previewRuleExpansion({
                  application_ref: srcApp,
                  destination_kind: dest!.kind,
                  destination_ref: dest!.ref,
                  environment, ports, action,
                  destination_dc_override: destinationDcOverride || undefined,
                });
                setPreview(p);
              })()}
                className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50">
                Recompute
              </button>
            </div>

            <ValidationStatus preview={preview} />

            {preview?.warnings?.length ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                <div className="font-semibold mb-1">Warnings</div>
                <ul className="list-disc pl-5 space-y-0.5">
                  {preview.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            ) : null}

            <FanOutTable rows={preview?.physical_rules || []} />

            {submittedRecord ? (
              <div className="rounded-xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-4 text-sm shadow-md">
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-600 text-white text-sm font-bold">✓</span>
                  <div className="flex-1">
                    <div className="text-sm font-bold text-emerald-900">Rule Request submitted — now in <span className="text-amber-700">Pending Review</span></div>
                    <div className="text-[11px] text-emerald-700">Scroll down to the <strong>Rule Requests</strong> panel to Approve / Reject / Deploy / Certify.</div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
                  <div className="bg-white border border-emerald-200 rounded-lg p-2">
                    <div className="text-[10px] uppercase font-bold text-emerald-700 mb-0.5">Rule Request ID</div>
                    <code className="font-mono text-sm text-emerald-900 font-bold">{submittedRecord.request_id}</code>
                  </div>
                  <div className="bg-white border border-indigo-200 rounded-lg p-2">
                    <div className="text-[10px] uppercase font-bold text-indigo-700 mb-0.5">Fan-out</div>
                    <div className="text-sm text-indigo-900 font-bold">{submittedRecord.expansion?.length ?? 0} PhysicalRule(s) across {new Set((submittedRecord.expansion||[]).map(p => p.src_dc)).size} DC(s)</div>
                  </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-2 py-1 bg-slate-50 text-[10px] uppercase font-bold text-gray-700 border-b border-gray-200">Generated Physical Rule IDs (per DC)</div>
                  <div className="max-h-40 overflow-y-auto">
                    {(submittedRecord.expansion || []).map((p) => (
                      <div key={p.rule_id} className="px-2 py-1 flex items-center gap-2 text-[11px] border-b border-gray-50">
                        <code className="font-mono text-indigo-700 font-bold">{p.rule_id}</code>
                        <span className="px-1.5 py-0.5 rounded-full border bg-orange-50 text-orange-700 border-orange-200 text-[9px] font-semibold">{p.src_dc}{p.cross_dc ? ` → ${p.dst_dc}` : ''}</span>
                        <span className="font-mono text-[10px] text-sky-700">{p.src_group_ref}</span>
                        <span className="text-gray-300">→</span>
                        <span className="font-mono text-[10px] text-rose-700">{p.dst_group_ref}</span>
                        <span className="ml-auto px-1.5 py-0.5 rounded border bg-white text-gray-600 border-gray-200 text-[9px] font-mono">{p.ports}</span>
                        <span className="px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200 text-[9px]">{p.lifecycle_status || 'Pending Review'}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={reset} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 cursor-pointer">
                    Submit another
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const el = document.getElementById('rule-requests-panel');
                      if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      } else {
                        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
                      }
                    }}
                    className="text-xs px-3 py-1.5 rounded-lg border border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-50 cursor-pointer"
                  >
                    Jump to Review queue ↓
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-500">
                  {preview ? `${preview.physical_rules.length} physical rule(s) will be generated.` : 'Computing…'}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setStep(2)} className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50">Back</button>
                  <button onClick={() => void submit()}
                    disabled={submitting || !preview || preview.physical_rules.length === 0 || preview.block_submit}
                    title={preview?.block_submit ? 'Submit blocked — see validation status above' : undefined}
                    className="px-4 py-1.5 text-sm rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-gray-300">
                    {submitting ? 'Submitting…' : (preview?.block_submit ? 'Blocked by validation' : 'Submit Rule Request')}
                  </button>
                </div>
              </div>
            )}
            {submitError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">{submitError}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ValidationStatus({ preview }: { preview: RuleExpansionPreview | null }) {
  if (!preview) return null;
  const dedup = preview.dedup;
  const birth = preview.birthright;
  const block = preview.block_submit;
  const overlap = (dedup?.matches ?? []).filter((m) => m.verdict === 'overlap');
  const hardMatches = (dedup?.matches ?? []).filter(
    (m) => m.verdict === 'identical' || m.verdict === 'subset' || m.verdict === 'conflict',
  );
  const birthMatches = birth?.matches ?? [];

  // Green: no matches.
  if (!block && hardMatches.length === 0 && overlap.length === 0 && birthMatches.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800 flex items-center gap-2">
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-white text-[11px] font-bold">✓</span>
        <span><strong>Validation passed</strong> — no overlap with existing rules; no birthright coverage. Safe to submit.</span>
      </div>
    );
  }
  return (
    <div className={`rounded-lg border p-3 text-xs space-y-2 ${block ? 'border-rose-300 bg-rose-50 text-rose-900' : 'border-amber-300 bg-amber-50 text-amber-900'}`}>
      <div className="flex items-center gap-2 font-semibold">
        <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-[11px] font-bold ${block ? 'bg-rose-600' : 'bg-amber-500'}`}>
          {block ? '✕' : '!'}
        </span>
        <span>{block ? 'Submit blocked by validation' : 'Submit allowed with warning'}</span>
      </div>
      {hardMatches.length > 0 && (
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wide font-semibold opacity-80">Hard-block — already exists</div>
          {hardMatches.map((m: DedupMatch, idx: number) => (
            <div key={`${m.rule_id}-${idx}`} className="bg-white/60 border border-rose-200 rounded p-2 flex flex-wrap items-center gap-2">
              <span className="px-1.5 py-0.5 rounded bg-rose-100 border border-rose-200 text-[10px] font-bold uppercase">{m.verdict}</span>
              <code className="font-mono text-[11px]">{m.rule_id}</code>
              <span className="font-mono text-[10px] text-indigo-700">{m.src_group} → {m.dst_group}</span>
              <span className="font-mono text-[10px]">{m.existing_ports}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-800">{m.lifecycle_status}</span>
              {m.match_kind === 'member' && (
                <span title={`src ${m.src_relation} · dst ${m.dst_relation}`} className="text-[10px] px-1.5 py-0.5 rounded border border-purple-200 bg-purple-50 text-purple-800 font-mono">
                  via members of {m.via_src_group}{m.via_dst_group && m.via_dst_group !== m.via_src_group ? ` / ${m.via_dst_group}` : ''}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {overlap.length > 0 && (
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wide font-semibold opacity-80">Overlap — proceed with care</div>
          {overlap.map((m: DedupMatch, idx: number) => (
            <div key={`${m.rule_id}-${idx}`} className="bg-white/60 border border-amber-200 rounded p-2 flex flex-wrap items-center gap-2">
              <span className="px-1.5 py-0.5 rounded bg-amber-100 border border-amber-200 text-[10px] font-bold uppercase">overlap</span>
              <code className="font-mono text-[11px]">{m.rule_id}</code>
              <span className="font-mono text-[10px] text-indigo-700">{m.src_group} → {m.dst_group}</span>
              <span className="font-mono text-[10px]">{m.existing_ports}</span>
              {m.match_kind === 'member' && (
                <span title={`src ${m.src_relation} · dst ${m.dst_relation}`} className="text-[10px] px-1.5 py-0.5 rounded border border-purple-200 bg-purple-50 text-purple-800 font-mono">
                  via members of {m.via_src_group}{m.via_dst_group && m.via_dst_group !== m.via_src_group ? ` / ${m.via_dst_group}` : ''}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {birthMatches.length > 0 && (
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wide font-semibold opacity-80">Birthright — already provided cluster-wide</div>
          {birthMatches.map((b) => (
            <div key={b.birthright_id} className="bg-white/60 border border-emerald-200 rounded p-2 flex flex-wrap items-center gap-2">
              <span className="px-1.5 py-0.5 rounded bg-emerald-100 border border-emerald-200 text-[10px] font-bold uppercase">{b.birthright_id}</span>
              <span className="font-mono text-[10px]">{b.destination_ref}</span>
              <span className="font-mono text-[10px]">{b.ports}</span>
              {b.description ? <span className="text-[10px] opacity-80">— {b.description}</span> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FanOutTable({ rows }: { rows: PhysicalRuleExpansion[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-xs text-gray-500">
        No physical rules — source and destination have no matching DC/environment presences.
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <table className="min-w-full text-xs">
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            <th className="px-2 py-1.5 text-left">Src DC</th>
            <th className="px-2 py-1.5 text-left">→</th>
            <th className="px-2 py-1.5 text-left">Dst DC</th>
            <th className="px-2 py-1.5 text-left">Src Group</th>
            <th className="px-2 py-1.5 text-left">Dst Group</th>
            <th className="px-2 py-1.5 text-left">Ports</th>
            <th className="px-2 py-1.5 text-left">Action</th>
            <th className="px-2 py-1.5 text-left">Flags</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
              <td className="px-2 py-1.5 font-mono">{r.src_dc}</td>
              <td className="px-2 py-1.5 text-gray-400">→</td>
              <td className="px-2 py-1.5 font-mono">{r.dst_dc}</td>
              <td className="px-2 py-1.5 font-mono text-indigo-700">{r.src_group_ref}</td>
              <td className="px-2 py-1.5 font-mono text-indigo-700">{r.dst_group_ref}</td>
              <td className="px-2 py-1.5 font-mono">{r.ports}</td>
              <td className="px-2 py-1.5">
                <span className={`px-1.5 py-0.5 rounded text-[10px] ${r.action === 'ACCEPT' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                  {r.action}
                </span>
              </td>
              <td className="px-2 py-1.5">
                {r.cross_dc && <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-50 text-amber-700 border border-amber-200">cross-DC</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface PresencePickerProps {
  title: string;
  subtitle?: string;
  emptyHint: string;
  candidates: PresenceKey[];
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
  makeGroupName: (p: PresenceKey) => string;
}

function PresencePicker({
  title, subtitle, emptyHint, candidates, selected, onChange, makeGroupName,
}: PresencePickerProps) {
  // Only render when there's something to pick. When the app has exactly
  // one presence, scoping is a no-op so we hide the UI entirely.
  if (candidates.length <= 1) return null;

  const byDc = new Map<string, PresenceKey[]>();
  for (const p of candidates) {
    const list = byDc.get(p.dc_id) || [];
    list.push(p);
    byDc.set(p.dc_id, list);
  }

  const allKeys = candidates.map((p) => presenceKey(p.dc_id, p.nh_id, p.sz_code));
  const allSelected = selected.size > 0 && allKeys.every((k) => selected.has(k));

  const toggle = (k: string) => {
    const next = new Set(selected);
    if (next.has(k)) next.delete(k); else next.add(k);
    onChange(next);
  };

  const useAll = () => onChange(new Set());

  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="text-xs font-semibold text-indigo-900">{title}</div>
          {subtitle && <div className="text-[11px] text-indigo-800/80 mt-0.5">{subtitle}</div>}
        </div>
        <button
          type="button"
          onClick={useAll}
          className={`text-[11px] px-2 py-1 rounded border ${selected.size === 0
            ? 'bg-indigo-600 text-white border-indigo-600'
            : 'bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-100'}`}
          title="Fan out across every presence"
        >
          {selected.size === 0 ? 'Using all presences' : 'Use all presences'}
        </button>
      </div>

      {candidates.length === 0 ? (
        <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">{emptyHint}</div>
      ) : (
        <div className="space-y-2">
          {Array.from(byDc.entries()).map(([dc, rows]) => (
            <div key={dc} className="rounded-lg border border-white bg-white p-2">
              <div className="text-[11px] font-mono text-gray-500 mb-1">{dc}</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                {rows.map((p) => {
                  const k = presenceKey(p.dc_id, p.nh_id, p.sz_code);
                  const checked = selected.has(k);
                  return (
                    <label
                      key={k}
                      className={`flex items-center gap-2 text-xs rounded px-2 py-1 cursor-pointer border ${checked
                        ? 'bg-indigo-50 border-indigo-300 text-indigo-900'
                        : 'border-gray-200 hover:bg-gray-50'}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(k)}
                      />
                      <span className="font-mono text-[11px]">{p.nh_id} / {p.sz_code}</span>
                      <span className="text-gray-400">→</span>
                      <span className="font-mono text-[11px] text-indigo-700 truncate">{makeGroupName(p)}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
          {allSelected && (
            <div className="text-[11px] text-gray-500">
              All presences checked — equivalent to "Using all presences".
            </div>
          )}
        </div>
      )}
    </div>
  );
}
