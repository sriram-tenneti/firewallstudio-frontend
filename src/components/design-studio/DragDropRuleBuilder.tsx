import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Application, BirthrightValidation, NeighbourhoodRegistry, SecurityZone, NGDCDataCenter, FirewallGroup, FirewallRule, SharedService, SharedServicePresence, SharedServiceCategory, RuleExpansionPreview } from '@/types';
import * as api from '@/lib/api';
import { autoPrefix } from '@/lib/utils';

const SS_CAT_STYLES: Record<SharedServiceCategory, { grad: string; chip: string; ring: string }> = {
  Messaging:     { grad: 'from-blue-500 to-blue-700',    chip: 'bg-blue-50 text-blue-700 border-blue-200',       ring: 'ring-blue-200' },
  Database:      { grad: 'from-pink-500 to-pink-700',    chip: 'bg-pink-50 text-pink-700 border-pink-200',       ring: 'ring-pink-200' },
  Observability: { grad: 'from-orange-500 to-orange-700', chip: 'bg-orange-50 text-orange-700 border-orange-200', ring: 'ring-orange-200' },
  Identity:      { grad: 'from-violet-500 to-violet-700', chip: 'bg-violet-50 text-violet-700 border-violet-200', ring: 'ring-violet-200' },
  Cache:         { grad: 'from-red-500 to-red-700',      chip: 'bg-red-50 text-red-700 border-red-200',          ring: 'ring-red-200' },
  Other:         { grad: 'from-slate-500 to-slate-700',  chip: 'bg-slate-50 text-slate-700 border-slate-200',    ring: 'ring-slate-200' },
};

/* ------------------------------------------------------------------ */
/*  Props & Constants                                                  */
/* ------------------------------------------------------------------ */

interface DragDropRuleBuilderProps {
  applications: Application[];
  onRuleCreated: () => void;
  editRule?: FirewallRule | null;
  onEditComplete?: () => void;
}

const PROTOCOLS = ['TCP', 'UDP', 'ICMP', 'ANY'];

const COMMON_PORTS = [
  { value: '443', label: 'HTTPS (443)' },
  { value: '80', label: 'HTTP (80)' },
  { value: '8443', label: 'Alt HTTPS (8443)' },
  { value: '8080', label: 'Alt HTTP (8080)' },
  { value: '1433', label: 'MSSQL (1433)' },
  { value: '1521', label: 'Oracle (1521)' },
  { value: '3306', label: 'MySQL (3306)' },
  { value: '5432', label: 'PostgreSQL (5432)' },
  { value: '1414', label: 'MQ (1414)' },
  { value: '9092', label: 'Kafka (9092)' },
  { value: '22', label: 'SSH (22)' },
  { value: '3389', label: 'RDP (3389)' },
];

const FALLBACK_NHS = [
  { id: 'NH01', name: 'Technology Enablement Services' },
  { id: 'NH02', name: 'Core Banking' },
  { id: 'NH03', name: 'Digital Channels' },
  { id: 'NH04', name: 'Wealth Management' },
  { id: 'NH05', name: 'Enterprise Services' },
  { id: 'NH06', name: 'Wholesale Banking' },
  { id: 'NH07', name: 'Global Payments and Liquidity' },
  { id: 'NH08', name: 'Data and Analytics' },
  { id: 'NH09', name: 'Assisted Channels' },
  { id: 'NH10', name: 'Consumer Lending' },
  { id: 'NH14', name: 'DMZ' },
];

const FALLBACK_DCS = [
  { code: 'ALPHA_NGDC', name: 'Alpha NGDC' },
  { code: 'BETA_NGDC', name: 'Beta NGDC' },
  { code: 'GAMMA_NGDC', name: 'Gamma NGDC' },
];

interface DestTarget {
  kind: 'shared_service' | 'app_ingress';
  label: string;
  appDistId: string;   // for apps: app_distributed_id; for shared services: service_id
  hasIngress: boolean;
  szHint?: string;
  category?: SharedServiceCategory;
  dcs?: string[];
  nhHint?: string;
  owner?: string;
  description?: string;
}

type MemberType = 'ip' | 'subnet' | 'cidr' | 'group' | 'range';

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function DragDropRuleBuilder({ applications, onRuleCreated, editRule, onEditComplete }: DragDropRuleBuilderProps) {
  const isEditMode = !!editRule;

  /* ---------- Form State ---------- */
  const buildDefaultForm = () => ({
    application: '', dst_application: '', environment: 'Production', datacenter: '',
    src_nh: '', src_sz: '', dst_nh: '', dst_sz: '',
    src_group: '', dst_group: '',
    port: '443', customPort: '', protocol: 'TCP', action: 'Allow', description: '',
  });

  const [form, setForm] = useState(buildDefaultForm);
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [draftCreatedMsg, setDraftCreatedMsg] = useState('');
  const [birthrightResult, setBirthrightResult] = useState<BirthrightValidation | null>(null);
  const [, setValidatingBR] = useState(false);
  const [fanOutPreview, setFanOutPreview] = useState<RuleExpansionPreview | null>(null);

  /* ---------- Group creation modal ---------- */
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupMemberEntries, setNewGroupMemberEntries] = useState<{ type: string; value: string }[]>([]);
  const [newMemberType, setNewMemberType] = useState('ip');
  const [newMemberValue, setNewMemberValue] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupCompileVendor, setGroupCompileVendor] = useState('fortigate');
  const [groupCompiledPolicy, setGroupCompiledPolicy] = useState<string | null>(null);
  const [groupPolicyResult, setGroupPolicyResult] = useState<string | null>(null);

  /* ---------- Drag-drop destination sidebar ---------- */
  const [destSearch, setDestSearch] = useState('');
  const [destCategory, setDestCategory] = useState<'all' | SharedServiceCategory>('all');
  const [sharedServices, setSharedServices] = useState<SharedService[]>([]);
  const [ssPresences, setSsPresences] = useState<Record<string, SharedServicePresence[]>>({});

  /* ---------- Reference data ---------- */
  const [appDcMappings, setAppDcMappings] = useState<Record<string, unknown>[]>([]);
  const [srcNHs, setSrcNHs] = useState<NeighbourhoodRegistry[]>([]);
  const [srcSZs, setSrcSZs] = useState<SecurityZone[]>([]);
  const [srcDCs, setSrcDCs] = useState<NGDCDataCenter[]>([]);
  const [dstNHs, setDstNHs] = useState<NeighbourhoodRegistry[]>([]);
  const [dstSZs, setDstSZs] = useState<SecurityZone[]>([]);
  const [dstDCs, setDstDCs] = useState<NGDCDataCenter[]>([]);
  const [srcAppGroups, setSrcAppGroups] = useState<FirewallGroup[]>([]);
  const [dstAppGroups, setDstAppGroups] = useState<FirewallGroup[]>([]);

  const upd = (field: string, value: string) => setForm(p => ({ ...p, [field]: value }));
  const sel = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors';
  const lbl = 'block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5';

  /* ------------------------------------------------------------------ */
  /*  Data Loading                                                       */
  /* ------------------------------------------------------------------ */

  useEffect(() => { api.getAppDCMappings().then(m => setAppDcMappings(m)).catch(() => setAppDcMappings([])); }, []);

  // Load Shared Services (drag-drop preferred destinations)
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const svcs = await api.getSharedServices();
        if (cancelled) return;
        setSharedServices(svcs);
        const entries = await Promise.all(
          svcs.map(async (s) => [s.service_id, await api.getSharedServicePresences(s.service_id)] as const),
        );
        if (cancelled) return;
        const m: Record<string, SharedServicePresence[]> = {};
        for (const [k, v] of entries) m[k] = v;
        setSsPresences(m);
      } catch {
        /* silent */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const mappingMatchesApp = useCallback((mr: Record<string, string>, appId: string): boolean => {
    if (!appId) return false;
    if (mr.app_distributed_id === appId || mr.app_id === appId) return true;
    const appObj = applications.find(a => (a.app_distributed_id || a.app_id) === appId);
    if (appObj && mr.app_id === appObj.app_id) return true;
    return false;
  }, [applications]);

  const collectMappingNHs = useCallback((appId: string) => {
    const s = new Set<string>();
    for (const m of appDcMappings) { const mr = m as Record<string, string>; if (mappingMatchesApp(mr, appId) && mr.nh) s.add(mr.nh); }
    return s;
  }, [appDcMappings, mappingMatchesApp]);

  const collectMappingSZs = useCallback((appId: string) => {
    const s = new Set<string>();
    for (const m of appDcMappings) { const mr = m as Record<string, string>; if (mappingMatchesApp(mr, appId) && mr.sz) s.add(mr.sz); }
    return s;
  }, [appDcMappings, mappingMatchesApp]);

  const collectMappingDCs = useCallback((appId: string) => {
    const s = new Set<string>();
    for (const m of appDcMappings) { const mr = m as Record<string, string>; if (mappingMatchesApp(mr, appId) && mr.dc) s.add(mr.dc); }
    return s;
  }, [appDcMappings, mappingMatchesApp]);

  const loadSrcData = useCallback(async (env: string, appId: string) => {
    if (!env) return;
    try { const d = await api.getFilteredNhSzDc(env, appId || undefined); setSrcNHs(d.neighbourhoods || []); setSrcSZs(d.security_zones || []); setSrcDCs(d.datacenters || []); }
    catch { setSrcNHs([]); setSrcSZs([]); setSrcDCs([]); }
  }, []);

  const loadDstData = useCallback(async (env: string, appId?: string) => {
    if (!env) return;
    try { const d = await api.getFilteredNhSzDc(env, appId); setDstNHs(d.neighbourhoods || []); setDstSZs(d.security_zones || []); setDstDCs(d.datacenters || []); }
    catch { setDstNHs([]); setDstSZs([]); setDstDCs([]); }
  }, []);

  useEffect(() => { loadSrcData(form.environment, form.application); }, [form.environment, form.application, loadSrcData]);

  useEffect(() => {
    const app = form.dst_application || form.application;
    if (app) loadDstData(form.environment, app);
    else { setDstNHs([]); setDstSZs([]); setDstDCs([]); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.environment, form.dst_application, form.application, loadDstData]);

  /* Load source egress groups (no -Ingress suffix) */
  useEffect(() => {
    if (!form.application) { setSrcAppGroups([]); return; }
    api.getGroups(form.application)
      .then(groups => setSrcAppGroups(groups.filter(g => !g.name.toLowerCase().includes('-ingress'))))
      .catch(() => setSrcAppGroups([]));
  }, [form.application]);

  /* Load destination ingress groups (with -Ingress suffix) */
  useEffect(() => {
    const dstApp = form.dst_application || form.application;
    if (!dstApp) { setDstAppGroups([]); return; }
    api.getGroups(dstApp)
      .then(groups => setDstAppGroups(groups.filter(g => g.name.toLowerCase().includes('-ingress'))))
      .catch(() => setDstAppGroups([]));
  }, [form.dst_application, form.application]);

  /* ------------------------------------------------------------------ */
  /*  Derived NH / SZ / DC from app_dc_mappings                         */
  /* ------------------------------------------------------------------ */

  const srcNeighbourhoods = useMemo(() => {
    if (form.application) {
      const nhSet = collectMappingNHs(form.application);
      if (nhSet.size > 0) {
        const f = srcNHs.filter(nh => nhSet.has(nh.nh_id));
        if (f.length > 0) return f.map(nh => ({ id: nh.nh_id, name: nh.name }));
        return FALLBACK_NHS.filter(nh => nhSet.has(nh.id));
      }
    }
    return srcNHs.length > 0 ? srcNHs.map(nh => ({ id: nh.nh_id, name: nh.name })) : FALLBACK_NHS;
  }, [srcNHs, form.application, collectMappingNHs]);

  const srcZones = useMemo(() => {
    if (form.application) {
      const szSet = collectMappingSZs(form.application);
      if (szSet.size > 0) {
        const f = srcSZs.filter(sz => szSet.has(sz.code));
        if (f.length > 0) return f.map(sz => ({ code: sz.code, name: sz.name }));
        return Array.from(szSet).map(code => ({ code, name: code }));
      }
    }
    return srcSZs.length > 0 ? srcSZs.map(sz => ({ code: sz.code, name: sz.name })) : [];
  }, [srcSZs, form.application, collectMappingSZs]);

  const dstNeighbourhoods = useMemo(() => {
    const dstApp = form.dst_application || form.application;
    if (dstApp) {
      const nhSet = collectMappingNHs(dstApp);
      if (nhSet.size > 0) {
        const f = dstNHs.filter(nh => nhSet.has(nh.nh_id));
        if (f.length > 0) return f.map(nh => ({ id: nh.nh_id, name: nh.name }));
        return FALLBACK_NHS.filter(nh => nhSet.has(nh.id));
      }
    }
    const r = dstNHs.length > 0 ? dstNHs.map(nh => ({ id: nh.nh_id, name: nh.name })) : FALLBACK_NHS;
    if (form.dst_nh && !r.find(n => n.id === form.dst_nh)) return [{ id: form.dst_nh, name: form.dst_nh }, ...r];
    return r;
  }, [dstNHs, form.dst_application, form.application, form.dst_nh, collectMappingNHs]);

  const dstZones = useMemo(() => {
    const dstApp = form.dst_application || form.application;
    if (dstApp) {
      const szSet = collectMappingSZs(dstApp);
      if (szSet.size > 0) {
        const f = dstSZs.filter(sz => szSet.has(sz.code));
        if (f.length > 0) return f.map(sz => ({ code: sz.code, name: sz.name }));
        return Array.from(szSet).map(code => ({ code, name: code }));
      }
    }
    const r = dstSZs.length > 0 ? dstSZs.map(sz => ({ code: sz.code, name: sz.name })) : [];
    if (form.dst_sz && !r.find(s => s.code === form.dst_sz)) return [{ code: form.dst_sz, name: form.dst_sz }, ...r];
    return r;
  }, [dstSZs, form.dst_application, form.application, form.dst_sz, collectMappingSZs]);

  const datacenters = useMemo(() => {
    const dcSet = new Set<string>();
    const items: { code: string; name: string }[] = [];
    for (const appId of [form.application, form.dst_application]) {
      if (!appId) continue;
      for (const dc of Array.from(collectMappingDCs(appId))) {
        if (!dcSet.has(dc)) { dcSet.add(dc); items.push({ code: dc, name: dc }); }
      }
    }
    if (items.length > 0) return items;
    const all = [...srcDCs, ...dstDCs];
    const seen = new Set<string>();
    const u: { code: string; name: string }[] = [];
    for (const dc of all) { if (!seen.has(dc.code)) { seen.add(dc.code); u.push({ code: dc.code, name: dc.name }); } }
    return u.length > 0 ? u : FALLBACK_DCS;
  }, [form.application, form.dst_application, collectMappingDCs, srcDCs, dstDCs]);

  /* ------------------------------------------------------------------ */
  /*  Auto-populate NH/SZ when app has single mapping                    */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    if (!form.application) return;
    const nhSet = collectMappingNHs(form.application);
    const szSet = collectMappingSZs(form.application);
    if (nhSet.size === 1 && !form.src_nh) setForm(p => ({ ...p, src_nh: Array.from(nhSet)[0] }));
    if (szSet.size === 1 && !form.src_sz) setForm(p => ({ ...p, src_sz: Array.from(szSet)[0] }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.application, collectMappingNHs, collectMappingSZs]);

  useEffect(() => {
    const dstApp = form.dst_application || form.application;
    if (!dstApp) return;
    const nhSet = collectMappingNHs(dstApp);
    const szSet = collectMappingSZs(dstApp);
    if (nhSet.size === 1 && !form.dst_nh) setForm(p => ({ ...p, dst_nh: Array.from(nhSet)[0] }));
    if (szSet.size === 1 && !form.dst_sz) setForm(p => ({ ...p, dst_sz: Array.from(szSet)[0] }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.dst_application, form.application, collectMappingNHs, collectMappingSZs]);

  /* ------------------------------------------------------------------ */
  /*  Auto-select source egress group when NH/SZ selected                */
  /* ------------------------------------------------------------------ */

  const srcEgressGroup = useMemo(() => {
    if (!form.application || !form.src_nh || !form.src_sz) return null;
    const expected = `grp-${form.application}-${form.src_nh}-${form.src_sz}`.toLowerCase();
    return srcAppGroups.find(g => g.name.toLowerCase() === expected) || null;
  }, [form.application, form.src_nh, form.src_sz, srcAppGroups]);

  useEffect(() => {
    if (srcEgressGroup && !form.src_group) setForm(p => ({ ...p, src_group: srcEgressGroup.name }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcEgressGroup]);

  /* Filter destination ingress groups by NH/SZ */
  const dstFilteredGroups = useMemo(() => {
    if (!form.dst_nh && !form.dst_sz) return dstAppGroups;
    return dstAppGroups.filter(g => {
      const n = g.name.toLowerCase();
      return (!form.dst_nh || n.includes(form.dst_nh.toLowerCase())) &&
             (!form.dst_sz || n.includes(form.dst_sz.toLowerCase()));
    });
  }, [dstAppGroups, form.dst_nh, form.dst_sz]);

  const srcSuggestedName = useMemo(() => {
    if (!form.application || !form.src_nh || !form.src_sz) return '';
    return `grp-${form.application}-${form.src_nh}-${form.src_sz}`;
  }, [form.application, form.src_nh, form.src_sz]);

  /* ------------------------------------------------------------------ */
  /*  Drag-and-drop destination targets                                  */
  /* ------------------------------------------------------------------ */

  const commonDestinations = useMemo((): DestTarget[] => {
    const targets: DestTarget[] = [];

    // Shared Services (preferred) — filtered by env and DC
    for (const svc of sharedServices) {
      if (form.environment && svc.environments && svc.environments.length &&
          !svc.environments.includes(form.environment as typeof svc.environments[number])) continue;
      const pres = (ssPresences[svc.service_id] || []).filter(p =>
        (!form.environment || p.environment === form.environment) &&
        (!form.datacenter || p.dc_id === form.datacenter)
      );
      if (form.datacenter && pres.length === 0) continue;
      const allPres = ssPresences[svc.service_id] || [];
      const dcs = [...new Set((pres.length ? pres : allPres).map(p => p.dc_id))];
      const szHint = (pres[0] || allPres[0])?.sz_code || '';
      const nhHint = (pres[0] || allPres[0])?.nh_id || '';
      targets.push({
        kind: 'shared_service',
        label: svc.name,
        appDistId: svc.service_id,
        hasIngress: true,
        szHint,
        category: svc.category,
        dcs,
        nhHint,
        owner: svc.owner,
        description: svc.description,
      });
    }

    // Apps-with-Ingress as a secondary pool
    const srcApp = form.application;
    for (const app of applications) {
      const id = app.app_distributed_id || app.app_id;
      if (id === srcApp) continue;
      const hasIngress = !!app.has_ingress;
      if (!hasIngress) continue;
      const szHint = (app.sz || app.szs || '') as string;
      targets.push({
        kind: 'app_ingress',
        label: app.app_name || id,
        appDistId: id,
        hasIngress,
        szHint: szHint.split(',')[0]?.trim() || '',
      });
    }

    targets.sort((a, b) => {
      if (a.kind === 'shared_service' && b.kind !== 'shared_service') return -1;
      if (a.kind !== 'shared_service' && b.kind === 'shared_service') return 1;
      return a.label.localeCompare(b.label);
    });
    return targets;
  }, [sharedServices, ssPresences, applications, form.application, form.environment, form.datacenter]);

  const filteredDestinations = useMemo(() => {
    let list = commonDestinations;
    if (destCategory !== 'all') {
      list = list.filter(d => d.kind === 'shared_service' && d.category === destCategory);
    }
    if (destSearch) {
      const q = destSearch.toLowerCase();
      list = list.filter(d =>
        d.label.toLowerCase().includes(q) ||
        d.appDistId.toLowerCase().includes(q) ||
        (d.category || '').toLowerCase().includes(q) ||
        (d.owner || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [commonDestinations, destSearch, destCategory]);

  const destSharedCount = useMemo(() => commonDestinations.filter(d => d.kind === 'shared_service').length, [commonDestinations]);
  const destAppCount = useMemo(() => commonDestinations.filter(d => d.kind === 'app_ingress').length, [commonDestinations]);

  /* ------------------------------------------------------------------ */
  /*  Edit mode pre-populate                                             */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    if (!editRule) return;
    const src = editRule.source;
    const dst = editRule.destination;
    const srcGroup = (src?.group_name || src?.ip_address || src?.cidr || '') as string;
    const dstGroup = typeof dst === 'string' ? dst : (dst?.name || dst?.dest_ip || '') as string;
    const ruleAny = editRule as unknown as Record<string, string>;
    setForm({
      application: editRule.application || '',
      dst_application: ruleAny.dst_application || '',
      environment: editRule.environment || 'Production',
      datacenter: editRule.datacenter || '',
      src_nh: (src?.neighbourhood || ruleAny.source_nh || '') as string,
      src_sz: (src?.security_zone || '') as string,
      dst_nh: ruleAny.destination_nh || '',
      dst_sz: ruleAny.destination_zone || (typeof dst === 'object' ? (dst?.security_zone || '') as string : ''),
      src_group: srcGroup,
      dst_group: dstGroup,
      port: (src?.ports || (typeof dst === 'object' ? dst?.ports : '') || '443') as string,
      customPort: '',
      protocol: 'TCP',
      action: ruleAny.action || 'Allow',
      description: (editRule as unknown as Record<string, string>).description || '',
    });
  }, [editRule]);

  /* ------------------------------------------------------------------ */
  /*  Birthright validation (auto-runs when zones change)                */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    if (!form.src_sz || !form.dst_sz) { setBirthrightResult(null); return; }
    const timer = setTimeout(async () => {
      setValidatingBR(true);
      try {
        const r = await api.validateBirthright({
          source_zone: form.src_sz, destination_zone: form.dst_sz,
          source_sz: form.src_sz, destination_sz: form.dst_sz,
          source_nh: form.src_nh, destination_nh: form.dst_nh,
          source_dc: form.datacenter, destination_dc: form.datacenter,
          environment: form.environment,
        });
        setBirthrightResult(r);
      } catch { setBirthrightResult(null); }
      setValidatingBR(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [form.src_sz, form.dst_sz, form.src_nh, form.dst_nh, form.datacenter, form.environment]);

  const isBirthrightPermitted = birthrightResult && birthrightResult.compliant && !birthrightResult.firewall_request_required;

  /* ------------------------------------------------------------------ */
  /*  Step gating                                                        */
  /* ------------------------------------------------------------------ */

  const canStep1 = form.application && form.environment && form.datacenter;
  const srcGroupSelected = !!form.src_group;
  const dstGroupSelected = !!form.dst_group;
  const canStep2 = form.src_nh && form.src_sz && form.dst_nh && form.dst_sz && srcGroupSelected && dstGroupSelected;
  const effectivePort = form.port === 'custom' ? form.customPort : form.port;
  const canStep3 = effectivePort && form.protocol;
  const canSubmit = canStep1 && canStep2 && canStep3 && !isBirthrightPermitted;

  /* ------------------------------------------------------------------ */
  /*  Multi-DC fan-out preview (Step 3)                                   */
  /*                                                                     */
  /*  Calls the backend `preview_rule_expansion` so the user sees, before
   *  they click Submit, how many R-#### physical rules will materialise
   *  under one parent RR-####. NGDC↔NGDC pairs are STRICTLY same-DC
   *  (ALPHA→ALPHA, BETA→BETA, …) — every app lives in all 4 NGDC DCs,
   *  so cross-DC reasoning inside NGDC is meaningless. Cross-DC only
   *  applies to NGDC↔Heritage flows, governed by the Heritage
   *  presence's `ngdc_source_dcs[]` mapping declared on the editor.   */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    if (step !== 3 || !form.application || !form.dst_application
        || !form.environment || !effectivePort) {
      setFanOutPreview(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const p = await api.previewRuleExpansion({
          source_kind: 'app',
          source_ref: form.application,
          application_ref: form.application,
          destination_kind: 'app_ingress',
          destination_ref: form.dst_application,
          environment: form.environment as 'Production' | 'Non-Production' | 'Pre-Production',
          ports: effectivePort,
          action: form.action === 'Allow' ? 'ACCEPT' : 'DROP',
        });
        if (!cancelled) setFanOutPreview(p);
      } catch (e) {
        if (!cancelled) {
          setFanOutPreview({
            physical_rules: [],
            warnings: [`Preview failed: ${(e as Error).message}`],
          });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [step, form.application, form.dst_application, form.environment,
      effectivePort, form.action]);

  /* ------------------------------------------------------------------ */
  /*  Submit handler                                                     */
  /* ------------------------------------------------------------------ */

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setDraftCreatedMsg('');
    try {
      const finalSrc = form.src_group ? autoPrefix(form.src_group.trim(), 'group') : '';
      const finalDst = form.dst_group ? autoPrefix(form.dst_group.trim(), 'group') : '';
      if (isEditMode && editRule) {
        await api.updateRule(editRule.rule_id, {
          application: form.application, environment: form.environment, datacenter: form.datacenter,
          source: { source_type: 'Group', ip_address: null, cidr: null, group_name: finalSrc, ports: effectivePort, neighbourhood: form.src_nh, security_zone: form.src_sz },
          destination: { name: finalDst, security_zone: form.dst_sz, dest_ip: null, ports: effectivePort, is_predefined: false },
          description: form.description, source_nh: form.src_nh, destination_nh: form.dst_nh,
          source_zone: form.src_sz,
          dst_application: form.dst_application || undefined,
        } as Record<string, unknown>);
        onRuleCreated();
        if (onEditComplete) onEditComplete();
      } else {
        await api.createRule({
          application: form.application, environment: form.environment, datacenter: form.datacenter,
          source: finalSrc, source_zone: form.src_sz, destination: finalDst, destination_zone: form.dst_sz,
          port: effectivePort, protocol: form.protocol, action: form.action, description: form.description,
          is_group_to_group: true, source_nh: form.src_nh, destination_nh: form.dst_nh,
          dst_application: form.dst_application || undefined,
        });
        onRuleCreated();
        setDraftCreatedMsg('Rule created successfully! Status: DRAFT. Submit for review to activate.');
        setStep(1);
        setForm(buildDefaultForm());
        setBirthrightResult(null);
      }
    } catch { /* handled by parent */ }
    setSubmitting(false);
  };

  const handleDropDestination = (target: DestTarget) => {
    if (target.kind === 'shared_service') {
      // Pre-populate NH/SZ from the service's presence in the currently-selected DC (or first)
      const svcPres = ssPresences[target.appDistId] || [];
      const match = svcPres.find(p =>
        (!form.environment || p.environment === form.environment) &&
        (!form.datacenter || p.dc_id === form.datacenter)
      ) || svcPres[0];
      const suggestedGroup = match ? `grp-${target.label}-${match.nh_id}-${match.sz_code}` : '';
      setForm(p => ({
        ...p,
        dst_application: target.appDistId,
        dst_nh: match?.nh_id || '',
        dst_sz: match?.sz_code || '',
        dst_group: suggestedGroup,
      }));
      return;
    }
    setForm(p => ({ ...p, dst_application: target.appDistId, dst_nh: '', dst_sz: '', dst_group: '' }));
  };

  /* ------------------------------------------------------------------ */
  /*  Group compile helper                                               */
  /* ------------------------------------------------------------------ */

  const generateGroupCompile = (gName: string, members: { type: string; value: string }[], vendor: string): string => {
    const ts = new Date().toISOString();
    const vals = members.map(m => m.value);
    switch (vendor) {
      case 'palo_alto': {
        let p = `# Palo Alto PAN-OS\n# Group: ${gName}\n# ${ts}\n\n`;
        for (const m of vals) { const n = m.replace(/[./]/g, '_'); p += `set address ${n} ip-netmask ${m.includes('/') ? m : m + '/32'}\n`; }
        p += `\nset address-group ${gName} static [ ${vals.map(m => m.replace(/[./]/g, '_')).join(' ')} ]\n`;
        return p;
      }
      case 'checkpoint': {
        let p = `# Check Point SmartConsole\n# Group: ${gName}\n# ${ts}\n\n`;
        for (const m of vals) {
          const n = m.replace(/[./]/g, '_');
          p += m.includes('/') ? `add network name ${n} subnet ${m.split('/')[0]} mask-length ${m.split('/')[1]}\n` : `add host name ${n} ip-address ${m}\n`;
        }
        p += `\nadd group name ${gName}\n`;
        for (const m of vals) p += `set group name ${gName} members.add ${m.replace(/[./]/g, '_')}\n`;
        return p;
      }
      case 'fortigate': {
        let p = `# FortiGate CLI\n# Group: ${gName}\n# ${ts}\n\nconfig firewall address\n`;
        for (const m of vals) { const n = m.replace(/[./]/g, '_'); p += `  edit "${n}"\n    set subnet ${m.includes('/') ? m : m + '/32'}\n  next\n`; }
        p += `end\n\nconfig firewall addrgrp\n  edit "${gName}"\n    set member ${vals.map(m => `"${m.replace(/[./]/g, '_')}"`).join(' ')}\n  next\nend\n`;
        return p;
      }
      default: {
        let p = `# Generic\n# Group: ${gName}\n# ${ts}\n\n`;
        for (const m of members) p += `MEMBER type=${m.type} value=${m.value}\n`;
        return p;
      }
    }
  };

  /* ------------------------------------------------------------------ */
  /*  Step indicators                                                    */
  /* ------------------------------------------------------------------ */

  const stepClass = (s: number) =>
    s === step ? 'text-blue-700 font-bold border-b-2 border-blue-600' :
    s < step ? 'text-green-600 font-medium' : 'text-gray-400';
  const dotClass = (s: number) =>
    s === step ? 'bg-blue-600 text-white' :
    s < step ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500';

  /* ------------------------------------------------------------------ */
  /*  Sorted application list                                            */
  /* ------------------------------------------------------------------ */

  const sortedApps = useMemo(() =>
    [...applications].sort((a, b) => (a.app_distributed_id || a.app_id).localeCompare(b.app_distributed_id || b.app_id)),
  [applications]);

  /* ================================================================== */
  /*  RENDER                                                             */
  /* ================================================================== */

  return (
    <>
      {/* Group creation modal */}
      {showCreateGroupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-800">Create Source Group in App Groups</h3>
            <p className="text-sm text-gray-600">
              Create group <code className="font-mono text-blue-700 bg-blue-50 px-1 rounded">{newGroupName}</code> to proceed with rule creation.
            </p>
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs font-semibold text-amber-800">Policy Change Review Required</p>
              <p className="text-[10px] text-amber-600 mt-0.5">Creating this group will submit a policy change for review and approval.</p>
            </div>
            <div>
              <label className={lbl}>Group Name</label>
              <input className={sel} value={newGroupName} onChange={e => setNewGroupName(e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Members</label>
              <div className="flex gap-2 mb-2">
                <select className="px-2 py-1.5 border border-gray-300 rounded-lg text-xs bg-white" value={newMemberType} onChange={e => setNewMemberType(e.target.value)}>
                  <option value="ip">IP (svr-)</option>
                  <option value="subnet">Subnet (net-)</option>
                  <option value="range">Range (rng-)</option>
                  <option value="group">Group (grp-)</option>
                </select>
                <input className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-sm" placeholder="e.g. 10.0.1.5"
                  value={newMemberValue} onChange={e => setNewMemberValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newMemberValue.trim()) {
                      setNewGroupMemberEntries(p => [...p, { type: newMemberType, value: autoPrefix(newMemberValue.trim(), newMemberType as MemberType) }]);
                      setNewMemberValue('');
                    }
                  }} />
                <button onClick={() => {
                  if (newMemberValue.trim()) {
                    setNewGroupMemberEntries(p => [...p, { type: newMemberType, value: autoPrefix(newMemberValue.trim(), newMemberType as MemberType) }]);
                    setNewMemberValue('');
                  }
                }} className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">Add</button>
              </div>
              {newGroupMemberEntries.length > 0 && (
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {newGroupMemberEntries.map((m, i) => (
                    <div key={i} className="flex items-center justify-between px-2 py-1 bg-gray-50 rounded text-xs">
                      <span>
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold mr-1.5 ${
                          m.type === 'ip' ? 'bg-blue-100 text-blue-700' :
                          m.type === 'subnet' ? 'bg-purple-100 text-purple-700' :
                          m.type === 'range' ? 'bg-orange-100 text-orange-700' :
                          'bg-emerald-100 text-emerald-700'
                        }`}>{m.type.toUpperCase()}</span>
                        {m.value}
                      </span>
                      <button onClick={() => setNewGroupMemberEntries(p => p.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 text-xs">&times;</button>
                    </div>
                  ))}
                </div>
              )}
              {newGroupMemberEntries.length === 0 && <p className="text-xs text-red-500 mt-1">At least 1 member required</p>}
            </div>
            {/* Compile preview */}
            <div>
              <label className={lbl}>Compile Preview (Device)</label>
              <select className={sel} value={groupCompileVendor} onChange={e => { setGroupCompileVendor(e.target.value); setGroupCompiledPolicy(null); }}>
                <option value="fortigate">FortiGate CLI</option>
                <option value="palo_alto">Palo Alto PAN-OS</option>
                <option value="checkpoint">Check Point SmartConsole</option>
                <option value="generic">Generic</option>
              </select>
            </div>
            {newGroupMemberEntries.length > 0 && (
              <div>
                <button onClick={() => setGroupCompiledPolicy(generateGroupCompile(newGroupName, newGroupMemberEntries, groupCompileVendor))}
                  className="px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 mb-2">
                  Preview Compiled Policy
                </button>
                {groupCompiledPolicy && (
                  <pre className="bg-gray-900 text-green-400 text-[10px] font-mono p-3 rounded-lg overflow-x-auto max-h-[150px] overflow-y-auto whitespace-pre leading-relaxed">
                    {groupCompiledPolicy}
                  </pre>
                )}
              </div>
            )}
            {groupPolicyResult && (
              <div className={`p-2 rounded text-xs font-medium ${groupPolicyResult.includes('Failed') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                {groupPolicyResult}
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowCreateGroupModal(false); setGroupCompiledPolicy(null); setGroupPolicyResult(null); setNewGroupMemberEntries([]); }}
                className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">Cancel</button>
              <button disabled={creatingGroup || newGroupMemberEntries.length === 0 || !newGroupName.trim()} onClick={async () => {
                setCreatingGroup(true);
                try {
                  await api.createGroup({
                    name: newGroupName, app_id: form.application, nh: form.src_nh, sz: form.src_sz, subtype: '',
                    description: `Egress group for ${form.application} in ${form.src_nh}/${form.src_sz}`,
                    members: newGroupMemberEntries.map(m => ({ type: m.type as MemberType, value: m.value, description: '' })),
                  });
                  try {
                    const pr = await api.submitGroupPolicyChanges(newGroupName, 'group_created',
                      `Group ${newGroupName} created with ${newGroupMemberEntries.length} member(s)`,
                      { added: { [`group:${newGroupName}`]: newGroupMemberEntries.map(m => m.value) }, removed: {}, changed: {},
                        compile_vendor: groupCompileVendor, compiled_policy: generateGroupCompile(newGroupName, newGroupMemberEntries, groupCompileVendor) }
                    );
                    setGroupPolicyResult(`Policy change submitted - ${pr.affected_rules} affected rule(s)`);
                  } catch { setGroupPolicyResult('Group created but policy submission failed'); }
                  upd('src_group', newGroupName);
                  api.getGroups(form.application)
                    .then(groups => setSrcAppGroups(groups.filter(g => !g.name.toLowerCase().includes('-ingress'))))
                    .catch(() => {});
                  onRuleCreated();
                } catch { setGroupPolicyResult('Failed to create group'); }
                setCreatingGroup(false);
              }} className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {creatingGroup ? 'Creating...' : `Create Group with ${newGroupMemberEntries.length} members`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content: wizard + sidebar */}
      <div className="flex gap-6 bg-white min-h-[600px]">

        {/* Left: Rule builder wizard */}
        <div className="flex-1 max-w-3xl">

          {/* Draft success banner */}
          {draftCreatedMsg && (
            <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800 font-medium">{draftCreatedMsg}</div>
          )}

          {/* Step indicator */}
          <div className="flex items-center gap-6 mb-6 pb-3 border-b border-gray-100">
            {['Application & Environment', 'Source & Destination', 'Service & Review'].map((label, i) => (
              <button key={i} onClick={() => { if (i + 1 < step) setStep(i + 1); }}
                className={`flex items-center gap-2 pb-2 text-xs uppercase tracking-wider transition-colors ${stepClass(i + 1)}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${dotClass(i + 1)}`}>{i + 1}</span>
                {label}
              </button>
            ))}
          </div>

          {/* =========================================================== */}
          {/*  STEP 1: Application & Environment & DC                     */}
          {/* =========================================================== */}
          {step === 1 && (
            <div className="space-y-5">
              <h3 className="text-sm font-bold text-gray-800">Select Applications and Environment</h3>
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className={lbl}>Source Application (Egress)</label>
                  <select className={`${sel} border-blue-200 focus:ring-blue-500`} value={form.application}
                    onChange={e => { upd('application', e.target.value); upd('src_nh', ''); upd('src_sz', ''); upd('src_group', ''); }}>
                    <option value="">-- Select Source App --</option>
                    {sortedApps.map(app => {
                      const id = app.app_distributed_id || app.app_id;
                      return <option key={id} value={id}>{id}</option>;
                    })}
                  </select>
                  <p className="text-[10px] text-blue-500 mt-1">Egress group: grp-APP-NH-SZ</p>
                </div>
                <div>
                  <label className={lbl}>Destination Application (Ingress)</label>
                  <select className={`${sel} border-purple-200 focus:ring-purple-500`} value={form.dst_application}
                    onChange={e => { upd('dst_application', e.target.value); upd('dst_nh', ''); upd('dst_sz', ''); upd('dst_group', ''); }}>
                    <option value="">-- Select Destination App --</option>
                    {sortedApps.map(app => {
                      const id = app.app_distributed_id || app.app_id;
                      return <option key={id} value={id}>{id}</option>;
                    })}
                  </select>
                  <p className="text-[10px] text-purple-500 mt-1">Or drag from Common Destinations sidebar</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className={lbl}>Environment</label>
                  <select className={sel} value={form.environment} onChange={e => upd('environment', e.target.value)}>
                    <option value="Production">Production</option>
                    <option value="Non-Production">Non-Production</option>
                    <option value="Pre-Production">Pre-Production</option>
                  </select>
                </div>
                <div>
                  <label className={lbl}>Data Center</label>
                  <select className={sel} value={form.datacenter} onChange={e => upd('datacenter', e.target.value)}>
                    <option value="">-- Select DC --</option>
                    {datacenters.map(dc => <option key={dc.code} value={dc.code}>{dc.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex justify-end">
                <button onClick={() => setStep(2)} disabled={!canStep1}
                  className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">
                  Next: Source and Destination &rarr;
                </button>
              </div>
            </div>
          )}

          {/* =========================================================== */}
          {/*  STEP 2: Source (Egress) & Destination (Ingress)             */}
          {/* =========================================================== */}
          {step === 2 && (
            <div className="space-y-5">
              {/* Source card (blue) */}
              <div className="rounded-xl border-2 border-blue-200 bg-blue-50/30 p-5">
                <h4 className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-3">Source (Egress)</h4>
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div>
                    <label className={lbl}>Neighbourhood</label>
                    <select className={`${sel} border-blue-200`} value={form.src_nh}
                      onChange={e => { upd('src_nh', e.target.value); upd('src_group', ''); }}>
                      <option value="">-- Select NH --</option>
                      {srcNeighbourhoods.map(nh => <option key={nh.id} value={nh.id}>{nh.id} - {nh.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Security Zone</label>
                    <select className={`${sel} border-blue-200`} value={form.src_sz}
                      onChange={e => { upd('src_sz', e.target.value); upd('src_group', ''); }}>
                      <option value="">-- Select SZ --</option>
                      {srcZones.map(sz => <option key={sz.code} value={sz.code}>{sz.code} - {sz.name}</option>)}
                    </select>
                  </div>
                </div>
                {/* Source group auto-selection */}
                {form.src_nh && form.src_sz && (
                  <div className="mt-2">
                    <label className={lbl}>Source Egress Group</label>
                    {srcEgressGroup ? (
                      <div className="flex items-center gap-2 p-2 bg-blue-100 rounded-lg border border-blue-300">
                        <span className="px-2 py-0.5 bg-blue-600 text-white rounded text-[10px] font-bold">AUTO</span>
                        <code className="text-sm font-mono text-blue-800">{srcEgressGroup.name}</code>
                        <span className="text-[10px] text-blue-600 ml-auto">{srcEgressGroup.members?.length || 0} members</span>
                      </div>
                    ) : srcAppGroups.length > 0 ? (
                      <select className={`${sel} border-blue-200`} value={form.src_group} onChange={e => upd('src_group', e.target.value)}>
                        <option value="">-- Select Egress Group --</option>
                        {srcAppGroups.filter(g => !g.name.toLowerCase().includes('-ingress')).map(g => (
                          <option key={g.name} value={g.name}>{g.name} ({g.members?.length || 0} members)</option>
                        ))}
                      </select>
                    ) : (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <p className="text-xs text-amber-800 font-semibold mb-2">No egress group found for {srcSuggestedName}</p>
                        <button onClick={() => {
                          setNewGroupName(srcSuggestedName);
                          setNewGroupMemberEntries([]);
                          setGroupCompiledPolicy(null);
                          setGroupPolicyResult(null);
                          setShowCreateGroupModal(true);
                        }}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                          Create {srcSuggestedName} in App Groups
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Destination card (purple) */}
              <div className="rounded-xl border-2 border-purple-200 bg-purple-50/30 p-5">
                <h4 className="text-xs font-bold text-purple-700 uppercase tracking-wider mb-3">Destination (Ingress)</h4>
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div>
                    <label className={lbl}>Neighbourhood</label>
                    <select className={`${sel} border-purple-200`} value={form.dst_nh}
                      onChange={e => { upd('dst_nh', e.target.value); upd('dst_group', ''); }}>
                      <option value="">-- Select NH --</option>
                      {dstNeighbourhoods.map(nh => <option key={nh.id} value={nh.id}>{nh.id} - {nh.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Security Zone</label>
                    <select className={`${sel} border-purple-200`} value={form.dst_sz}
                      onChange={e => { upd('dst_sz', e.target.value); upd('dst_group', ''); }}>
                      <option value="">-- Select SZ --</option>
                      {dstZones.map(sz => <option key={sz.code} value={sz.code}>{sz.code} - {sz.name}</option>)}
                    </select>
                  </div>
                </div>
                {/* Destination ingress group selection */}
                {form.dst_nh && form.dst_sz && (
                  <div className="mt-2">
                    <label className={lbl}>Destination Ingress Group</label>
                    {dstFilteredGroups.length > 0 ? (
                      <select className={`${sel} border-purple-200`} value={form.dst_group} onChange={e => upd('dst_group', e.target.value)}>
                        <option value="">-- Select Ingress Group --</option>
                        {dstFilteredGroups.map(g => (
                          <option key={g.name} value={g.name}>{g.name} ({g.members?.length || 0} members)</option>
                        ))}
                      </select>
                    ) : (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-xs text-red-700 font-semibold">No destination ingress group exists for {form.dst_nh}/{form.dst_sz}.</p>
                        <p className="text-[10px] text-red-600 mt-1">Please re-check your selections or contact the destination app team to create the ingress group.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Birthright validation results */}
              {birthrightResult && (
                <div className="space-y-3">
                  <div className={`p-3 rounded-lg border ${
                    birthrightResult.firewall_request_required ? 'border-amber-300 bg-amber-50' :
                    birthrightResult.compliant ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'
                  }`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        birthrightResult.firewall_request_required ? 'bg-amber-200 text-amber-800' :
                        birthrightResult.compliant ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'
                      }`}>
                        {birthrightResult.firewall_request_required ? 'FW REQUIRED' : birthrightResult.compliant ? 'PERMITTED' : 'BLOCKED'}
                      </span>
                      <span className={'font-bold text-xs ' + (birthrightResult.firewall_request_required ? 'text-amber-700' : birthrightResult.compliant ? 'text-green-700' : 'text-red-700')}>
                        Policy: {birthrightResult.matrix_used || ''}
                      </span>
                    </div>
                    {birthrightResult.permitted.length > 0 && (
                      <ul className="text-xs text-green-700 list-disc list-inside mt-1">
                        {birthrightResult.permitted.map((p, i) => <li key={i}>{p.rule} - {p.reason}</li>)}
                      </ul>
                    )}
                    {birthrightResult.warnings.length > 0 && (
                      <ul className="text-xs text-amber-700 list-disc list-inside mt-1">
                        {birthrightResult.warnings.map((w, i) => <li key={i}>{w.rule} - {w.reason}</li>)}
                      </ul>
                    )}
                  </div>

                  {/* Firewall device hops */}
                  {birthrightResult.firewall_devices_needed && birthrightResult.firewall_devices_needed.length > 0 && (
                    <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 text-sm">
                      <div className="font-bold text-xs text-amber-800 mb-1">
                        Firewall Rule Required - {birthrightResult.firewall_devices_needed.length} device{birthrightResult.firewall_devices_needed.length > 1 ? 's' : ''}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {birthrightResult.firewall_devices_needed.map((dev, i) => (
                          <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white border border-amber-300 text-xs font-mono text-amber-800">{dev}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Informational FW path */}
                  {birthrightResult.firewall_path_info && birthrightResult.firewall_path_info.length > 0 && !birthrightResult.firewall_request_required && (
                    <div className="p-3 rounded-lg border border-blue-200 bg-blue-50/50 text-sm">
                      <div className="font-bold text-xs text-blue-700 mb-1">Traffic Path (informational)</div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-1 rounded bg-blue-100 border border-blue-200 text-xs font-mono text-blue-800">{form.src_nh} {form.src_sz}</span>
                        {birthrightResult.firewall_path_info.map((fw, i) => (
                          <span key={i} className="inline-flex items-center gap-1">
                            <span className="text-gray-400">&rarr;</span>
                            <span className="px-2 py-1 rounded bg-white border border-blue-200 text-xs font-mono text-blue-700">{fw}</span>
                          </span>
                        ))}
                        <span className="text-gray-400">&rarr;</span>
                        <span className="px-2 py-1 rounded bg-purple-100 border border-purple-200 text-xs font-mono text-purple-800">{form.dst_nh} {form.dst_sz}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Source group required */}
              {form.src_nh && form.src_sz && !srcGroupSelected && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs font-semibold text-red-700">Source group is required. Select or create a source group above.</p>
                </div>
              )}

              <div className="flex justify-between">
                <button onClick={() => setStep(1)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">&larr; Back</button>
                <button onClick={() => setStep(3)} disabled={!canStep2}
                  className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">
                  Next: Service and Review &rarr;
                </button>
              </div>
            </div>
          )}

          {/* =========================================================== */}
          {/*  STEP 3: Service & Review                                    */}
          {/* =========================================================== */}
          {step === 3 && (
            <div className="space-y-5">
              <h3 className="text-sm font-bold text-gray-800">Connection Details and Review</h3>
              {/* Service chips */}
              <div>
                <label className={lbl}>Quick Select Service</label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {COMMON_PORTS.map(p => (
                    <button key={p.value} onClick={() => upd('port', p.value)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        form.port === p.value ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:bg-blue-50'
                      }`}>{p.label}</button>
                  ))}
                  <button onClick={() => upd('port', 'custom')}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      form.port === 'custom' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:bg-blue-50'
                    }`}>Custom...</button>
                </div>
                {form.port === 'custom' && (
                  <input className={sel + ' mt-2'} placeholder="e.g. 8443, 9090-9095" value={form.customPort} onChange={e => upd('customPort', e.target.value)} />
                )}
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className={lbl}>Protocol</label>
                  <select className={sel} value={form.protocol} onChange={e => upd('protocol', e.target.value)}>
                    {PROTOCOLS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Action</label>
                  <select className={sel} value={form.action} onChange={e => upd('action', e.target.value)}>
                    <option value="Allow">Allow</option>
                    <option value="Deny">Deny</option>
                  </select>
                </div>
              </div>

              <div>
                <label className={lbl}>Description (optional)</label>
                <textarea className={sel + ' h-16 resize-none'} placeholder="Brief description of this rule..." value={form.description} onChange={e => upd('description', e.target.value)} />
              </div>

              {/* Birthright block banner */}
              {isBirthrightPermitted && (
                <div className="p-4 rounded-lg border-2 border-green-400 bg-green-50">
                  <span className="font-bold text-green-800">Already Permitted - No Firewall Rule Needed</span>
                  <p className="text-sm text-green-700 mt-1">This traffic is already allowed by birthright policy. Rule creation is blocked.</p>
                </div>
              )}

              {/* Review summary */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Rule Summary</h4>
                <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Source App:</span><span className="font-medium text-gray-900">{form.application || '\u2014'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Dest App:</span><span className="font-medium text-gray-900">{form.dst_application || form.application || '\u2014'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Environment:</span><span className="font-medium text-gray-900">{form.environment}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Datacenter:</span><span className="font-medium text-gray-900">{datacenters.find(d => d.code === form.datacenter)?.name}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Protocol/Port:</span><span className="font-medium text-gray-900">{form.protocol}/{effectivePort}</span></div>
                  <div className="col-span-2 border-t border-gray-200 pt-2 mt-1">
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="text-[10px] text-blue-600 font-semibold uppercase">Source (Egress)</div>
                        <code className="text-xs font-mono text-blue-700">{form.src_group || '\u2014'}</code>
                        <div className="text-[10px] text-gray-400">{form.src_nh} / {form.src_sz}</div>
                      </div>
                      <span className="text-gray-400 text-lg font-bold">&rarr;</span>
                      <div className="flex-1 text-right">
                        <div className="text-[10px] text-purple-600 font-semibold uppercase">Destination (Ingress)</div>
                        <code className="text-xs font-mono text-purple-700">{form.dst_group || '\u2014'}</code>
                        <div className="text-[10px] text-gray-400">{form.dst_nh} / {form.dst_sz}</div>
                      </div>
                    </div>
                  </div>
                  {birthrightResult && (
                    <div className="col-span-2 mt-1 space-y-1">
                      <span className={'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ' + (
                        isBirthrightPermitted ? 'bg-green-100 text-green-700' :
                        birthrightResult.firewall_request_required ? 'bg-amber-100 text-amber-700' :
                        birthrightResult.compliant ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      )}>
                        {isBirthrightPermitted ? 'Already Permitted - No FW Rule Needed' :
                         birthrightResult.firewall_request_required ? 'Firewall Rule Required' :
                         birthrightResult.compliant ? 'Policy: Permitted' : 'Policy: Blocked'}
                      </span>
                      {birthrightResult.firewall_devices_needed && birthrightResult.firewall_devices_needed.length > 0 && (
                        <div className="text-[10px] text-blue-700 font-mono">{birthrightResult.firewall_devices_needed.join(' > ')}</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Multi-DC fan-out preview — shows how this single submit
                  will materialise as N R-#### rules under one RR-####
                  parent. NGDC↔NGDC is strictly same-DC (every app lives
                  in all 4 NGDC DCs, so cross-DC pairing inside NGDC is
                  meaningless). NGDC↔Heritage routing follows the
                  `ngdc_source_dcs[]` mapping declared on the Heritage
                  presence row. */}
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
                <div className="mb-2">
                  <h4 className="text-xs font-bold text-indigo-700 uppercase tracking-wider">
                    Step 4 &middot; Multi-DC Fan-out Preview
                  </h4>
                  <p className="text-[11px] text-gray-600 mt-0.5">
                    One submit auto-creates one rule request per (src DC &rarr; dst DC) pair.
                    NGDC&harr;NGDC is <strong>strictly same-DC</strong> (ALPHA&rarr;ALPHA,
                    BETA&rarr;BETA, &hellip;) since every app lives in all 4 NGDC DCs.
                    NGDC&harr;Heritage routing follows the Heritage presence&rsquo;s
                    {' '}<code className="font-mono text-[10px]">ngdc_source_dcs[]</code> mapping.
                  </p>
                </div>
                {!fanOutPreview && (
                  <div className="text-[11px] text-gray-500 italic">Computing fan-out&hellip;</div>
                )}
                {fanOutPreview && (
                  <>
                    <div className="text-xs text-indigo-900 font-bold mb-2">
                      Will materialise as {fanOutPreview.physical_rules.length} rule
                      request{fanOutPreview.physical_rules.length === 1 ? '' : 's'}
                      {' '}under one parent RR-####.
                    </div>
                    {fanOutPreview.physical_rules.length > 0 ? (
                      <div className="overflow-x-auto rounded-lg border border-indigo-100 bg-white">
                        <table className="w-full text-[11px]">
                          <thead className="bg-indigo-50">
                            <tr className="text-left">
                              <th className="px-2 py-1 font-semibold text-indigo-800">Src DC</th>
                              <th className="px-2 py-1 font-semibold text-indigo-800">Dst DC</th>
                              <th className="px-2 py-1 font-semibold text-indigo-800">Source Group</th>
                              <th className="px-2 py-1 font-semibold text-indigo-800">Dest Group</th>
                              <th className="px-2 py-1 font-semibold text-indigo-800">VRF</th>
                              <th className="px-2 py-1 font-semibold text-indigo-800">Ports</th>
                              <th className="px-2 py-1 font-semibold text-indigo-800">Path</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fanOutPreview.physical_rules.map((p, i) => {
                              const row = p as unknown as Record<string, unknown>;
                              const path = String(row.dc_to_dc_path || `${p.src_dc} \u2192 ${p.dst_dc}`);
                              const crossDc = p.cross_dc;
                              const heritage = p.src_is_heritage || p.dst_is_heritage;
                              return (
                                <tr key={`${p.src_dc}|${p.dst_dc}|${i}`}
                                  className={`border-t border-indigo-50 ${
                                    heritage ? 'bg-amber-50/40' :
                                    crossDc ? 'bg-fuchsia-50/40' : ''}`}>
                                  <td className="px-2 py-1 font-mono">{p.src_dc}</td>
                                  <td className="px-2 py-1 font-mono">
                                    {p.dst_dc}
                                    {heritage && (
                                      <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
                                        Heritage
                                      </span>
                                    )}
                                    {crossDc && !heritage && (
                                      <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-fuchsia-100 text-fuchsia-800 font-semibold">
                                        Cross-DC
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-2 py-1 font-mono text-blue-700">{p.src_group_ref || '\u2014'}</td>
                                  <td className="px-2 py-1 font-mono text-purple-700">{p.dst_group_ref || '\u2014'}</td>
                                  <td className="px-2 py-1 font-mono text-gray-600">{p.vrf || '\u2014'}</td>
                                  <td className="px-2 py-1 font-mono">{p.ports}</td>
                                  <td className="px-2 py-1 text-gray-600">{path}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                        No source/destination presences resolved &mdash; check that both apps have presence rows declared in App Management.
                      </div>
                    )}
                    {(fanOutPreview.warnings || []).length > 0 && (
                      <ul className="mt-2 space-y-0.5">
                        {(fanOutPreview.warnings || []).map((w, i) => (
                          <li key={i} className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                            {w}
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>

              <div className="flex justify-between">
                <button onClick={() => setStep(2)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">&larr; Back</button>
                <button onClick={handleSubmit} disabled={!canSubmit || submitting}
                  className="px-6 py-2.5 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm">
                  {submitting ? (isEditMode ? 'Updating...' : 'Creating...') :
                   isBirthrightPermitted ? 'Already Permitted (Cannot Create)' :
                   isEditMode ? 'Update Firewall Rule' : 'Create Firewall Rule'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar: Shared Services (preferred) + Apps-with-Ingress — only on Step 1 */}
        {step === 1 && (
          <div className="w-80 flex-shrink-0 border-l border-gray-200 pl-5">
            <div className="bg-gradient-to-b from-indigo-50 via-white to-white rounded-2xl border border-indigo-100 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-extrabold text-gray-900 tracking-tight flex items-center gap-1.5">
                  <span className="inline-flex w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 items-center justify-center shadow-sm">
                    <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M4 4a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V4zM12 4a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V4zM4 12a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM12 12a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
                  </span>
                  Destinations
                </h3>
                <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded-full">
                  {destSharedCount} SS · {destAppCount} App
                </span>
              </div>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-3">Drag or tap to pick</p>

              <input
                className="w-full px-3 py-2 border border-gray-200 rounded-full text-xs mb-3 bg-white placeholder-gray-400 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 shadow-inner"
                placeholder="Search services..."
                value={destSearch}
                onChange={e => setDestSearch(e.target.value)}
              />

              {/* Category chip filters */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {(['all', 'Messaging', 'Database', 'Observability', 'Identity', 'Cache', 'Other'] as const).map(cat => {
                  const active = destCategory === cat;
                  const style = cat === 'all' ? null : SS_CAT_STYLES[cat];
                  return (
                    <button
                      key={cat}
                      onClick={() => setDestCategory(cat)}
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-all ${
                        active
                          ? (cat === 'all' ? 'bg-indigo-600 text-white border-indigo-600' : `bg-gradient-to-r ${style!.grad} text-white border-transparent shadow-sm`)
                          : (cat === 'all' ? 'bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50' : `${style!.chip} hover:shadow-sm`)
                      }`}
                    >
                      {cat === 'all' ? 'All' : cat}
                    </button>
                  );
                })}
              </div>

              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1 -mr-1">
                {filteredDestinations.length === 0 && (
                  <div className="text-xs text-gray-400 italic text-center py-6 border border-dashed border-gray-200 rounded-lg bg-gray-50/50">
                    No destinations match.
                  </div>
                )}

                {filteredDestinations.map(d => {
                  const ss = d.kind === 'shared_service';
                  const style = ss ? SS_CAT_STYLES[d.category || 'Other'] : SS_CAT_STYLES.Other;
                  return (
                    <button
                      key={`${d.kind}-${d.appDistId}`}
                      onClick={() => handleDropDestination(d)}
                      draggable
                      onDragEnd={() => handleDropDestination(d)}
                      className={`w-full text-left rounded-xl border bg-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transform transition-all duration-150 group overflow-hidden ${
                        ss ? 'border-transparent hover:ring-2 hover:' + style.ring : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className={`flex items-stretch`}>
                        {/* Colored bar with icon */}
                        <div className={`w-11 flex-shrink-0 flex flex-col items-center justify-center py-2 ${ss ? `bg-gradient-to-br ${style.grad}` : 'bg-gradient-to-br from-gray-600 to-gray-800'}`}>
                          <span className="text-white text-base font-black tracking-tighter leading-none">
                            {d.label.charAt(0).toUpperCase()}
                          </span>
                          <span className="text-white/80 text-[8px] uppercase mt-0.5 font-bold tracking-widest">
                            {ss ? 'SS' : 'APP'}
                          </span>
                        </div>

                        <div className="min-w-0 flex-1 px-3 py-2">
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <div className="text-[13px] font-extrabold text-gray-900 truncate">{d.label}</div>
                            <svg className="w-3.5 h-3.5 text-gray-300 group-hover:text-indigo-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                          <div className="text-[10px] text-gray-500 font-mono truncate">{d.appDistId}</div>

                          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                            {ss && d.category && (
                              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${style.chip}`}>{d.category}</span>
                            )}
                            {!ss && (
                              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">+Ingress</span>
                            )}
                            {d.szHint && (
                              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full border bg-slate-50 text-slate-700 border-slate-200">{d.szHint}</span>
                            )}
                            {d.nhHint && (
                              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full border bg-slate-50 text-slate-700 border-slate-200">{d.nhHint}</span>
                            )}
                            {ss && d.dcs && d.dcs.length > 0 && (
                              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">
                                {d.dcs.length} DC{d.dcs.length > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Custom Destination section */}
              <div className="mt-4 pt-3 border-t border-indigo-100">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-2">Custom Destination</p>
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] text-gray-500 font-medium">Dest IP / CIDR:</label>
                    <input className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs bg-white mt-0.5" placeholder="e.g. 10.1.2.50/32" />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 font-medium">Ports:</label>
                    <input className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs bg-white mt-0.5" placeholder="e.g. TCP 1521" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
