import { useState, useEffect, useMemo } from 'react';
import { Modal } from '../shared/Modal';
import type { FirewallRule, Application, BirthrightValidation, FirewallGroup } from '@/types';
import { validateBirthright, getGroups, getFilteredNhSzDc } from '@/lib/api';
import { autoPrefix, isNgdcGroupName } from '@/lib/utils';

interface RuleConflict {
  type: 'exact_duplicate' | 'birthright_ngdc' | 'legacy_passthrough' | 'port_overlap';
  severity: 'error' | 'warning';
  message: string;
  conflicting_rule_id?: string;
}

interface RuleFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Record<string, string | boolean>) => void;
  rule?: FirewallRule | null;
  applications: Application[];
  mode: 'create' | 'edit';
  existingRules?: FirewallRule[];
}

function expandPorts(portStr: string): number[] {
  if (!portStr || portStr.trim() === '' || portStr.toLowerCase() === 'any') return [];
  const ports: number[] = [];
  for (const part of portStr.split(',')) {
    const trimmed = part.trim();
    if (trimmed.includes('-')) {
      const [start, end] = trimmed.split('-').map(Number);
      if (!isNaN(start) && !isNaN(end)) {
        for (let p = start; p <= end && p < start + 1000; p++) ports.push(p);
      }
    } else {
      const n = Number(trimmed);
      if (!isNaN(n)) ports.push(n);
    }
  }
  return ports;
}

function portsOverlap(ports1: string, ports2: string): boolean {
  const set1 = expandPorts(ports1);
  const set2 = expandPorts(ports2);
  if (set1.length === 0 || set2.length === 0) return false;
  const s2 = new Set(set2);
  return set1.some(p => s2.has(p));
}

function getSourceId(rule: FirewallRule): string {
  if (!rule.source) return '';
  const s = rule.source;
  return (s.group_name || s.ip_address || s.cidr || '').toLowerCase();
}

function getDestId(rule: FirewallRule): string {
  if (!rule.destination) return '';
  const d = rule.destination;
  return (d.name || d.dest_ip || '').toLowerCase();
}

function getRulePorts(rule: FirewallRule): string {
  if (rule.source && rule.source.ports) return rule.source.ports;
  if (rule.destination && rule.destination.ports) return rule.destination.ports;
  return '';
}

function validateRuleConflicts(
  form: { source: string; destination: string; port: string; protocol: string; datacenter: string; environment: string },
  existingRules: FirewallRule[],
  editingRuleId?: string,
): RuleConflict[] {
  const conflicts: RuleConflict[] = [];
  const formSrc = form.source.toLowerCase().trim();
  const formDst = form.destination.toLowerCase().trim();
  const formPort = form.port.trim();
  if (!formSrc && !formDst && !formPort) return conflicts;

  for (const rule of existingRules) {
    if (rule.status === 'Deleted') continue;
    if (editingRuleId && rule.rule_id === editingRuleId) continue;
    const ruleSrc = getSourceId(rule);
    const ruleDst = getDestId(rule);
    const rulePorts = getRulePorts(rule);

    if (formSrc && formDst && formPort && ruleSrc === formSrc && ruleDst === formDst && formPort === rulePorts) {
      conflicts.push({ type: 'exact_duplicate', severity: 'error', message: `Exact duplicate of rule ${rule.rule_id} (${rule.application}) — same source, destination, and ports`, conflicting_rule_id: rule.rule_id });
      continue;
    }
    if (form.datacenter.includes('NGDC') && rule.datacenter?.includes('NGDC') && ruleSrc === formSrc && ruleDst === formDst && rule.policy_result === 'Permitted') {
      conflicts.push({ type: 'birthright_ngdc', severity: 'warning', message: `Birthright rule ${rule.rule_id} already permits this traffic in NGDC — no new rule needed`, conflicting_rule_id: rule.rule_id });
      continue;
    }
    if (ruleSrc === formSrc && ruleDst === formDst && formPort && rulePorts && portsOverlap(formPort, rulePorts)) {
      const isLegacy = !rule.datacenter?.includes('NGDC');
      conflicts.push({ type: isLegacy ? 'legacy_passthrough' : 'port_overlap', severity: 'warning', message: isLegacy ? `Legacy rule ${rule.rule_id} already has pass-through on overlapping ports (${rulePorts})` : `Rule ${rule.rule_id} has overlapping ports (${rulePorts}) on same source/destination`, conflicting_rule_id: rule.rule_id });
    }
  }
  return conflicts;
}

export function RuleFormModal({ isOpen, onClose, onSave, rule, applications, mode, existingRules = [] }: RuleFormModalProps) {
  const [form, setForm] = useState({
    application: '',
    source: '',
    source_zone: '',
    destination: '',
    destination_zone: '',
    port: '',
    protocol: 'TCP',
    action: 'Allow',
    description: '',
    environment: 'Production',
    datacenter: 'ALPHA_NGDC',
    is_group_to_group: true,
  });

  const [showConflicts, setShowConflicts] = useState(false);
  const [birthrightResult, setBirthrightResult] = useState<BirthrightValidation | null>(null);
  const [validatingBR, setValidatingBR] = useState(false);

  // App-filtered groups and SZs
  const [appGroups, setAppGroups] = useState<FirewallGroup[]>([]);
  const [appFilteredSZs, setAppFilteredSZs] = useState<string[]>([]);

  useEffect(() => {
    if (rule && mode === 'edit') {
      setForm({
        application: rule.application || '',
        source: typeof rule.source === 'string' ? rule.source : (rule.source as unknown as Record<string, string>)?.group_name || '',
        source_zone: typeof rule.source === 'object' ? (rule.source as unknown as Record<string, string>)?.security_zone || '' : '',
        destination: typeof rule.destination === 'string' ? rule.destination : (rule.destination as unknown as Record<string, string>)?.name || '',
        destination_zone: typeof rule.destination === 'object' ? (rule.destination as unknown as Record<string, string>)?.security_zone || '' : '',
        port: typeof rule.source === 'object' ? (rule.source as unknown as Record<string, string>)?.ports || '' : '',
        protocol: 'TCP',
        action: 'Allow',
        description: '',
        environment: rule.environment || 'Production',
        datacenter: rule.datacenter || 'ALPHA_NGDC',
        is_group_to_group: true,
      });
    } else if (mode === 'create') {
      setForm({
        application: '',
        source: '',
        source_zone: '',
        destination: '',
        destination_zone: '',
        port: '',
        protocol: 'TCP',
        action: 'Allow',
        description: '',
        environment: 'Production',
        datacenter: 'ALPHA_NGDC',
        is_group_to_group: true,
      });
    }
    setShowConflicts(false);
  }, [rule, mode, isOpen]);

  // Load NGDC groups for selected application (Studio only shows NGDC-standard groups)
  useEffect(() => {
    if (!form.application) {
      setAppGroups([]);
      return;
    }
    getGroups(form.application)
      .then(groups => setAppGroups(groups.filter(g => isNgdcGroupName(g.name))))
      .catch(() => setAppGroups([]));
  }, [form.application]);

  // Load app-filtered SZs when application or environment changes
  useEffect(() => {
    if (!form.application || !form.environment) {
      setAppFilteredSZs([]);
      return;
    }
    getFilteredNhSzDc(form.environment, form.application)
      .then(data => {
        setAppFilteredSZs(data.security_zones.map(sz => sz.code || sz.name));
      })
      .catch(() => setAppFilteredSZs([]));
  }, [form.application, form.environment]);

  const conflicts = useMemo(() => {
    if (existingRules.length === 0) return [];
    return validateRuleConflicts(form, existingRules, rule?.rule_id);
  }, [form.source, form.destination, form.port, form.protocol, form.datacenter, form.environment, existingRules, rule?.rule_id]);

  const hasErrors = conflicts.some(c => c.severity === 'error');

  // Auto-run birthright validation when source/destination zones or environment change
  useEffect(() => {
    if (!isOpen) return;
    if (!form.source_zone && !form.destination_zone) {
      setBirthrightResult(null);
      return;
    }
    const timer = setTimeout(async () => {
      setValidatingBR(true);
      try {
        const result = await validateBirthright({
          source_zone: form.source_zone,
          destination_zone: form.destination_zone,
          source_sz: form.source_zone,
          destination_sz: form.destination_zone,
          source_dc: form.datacenter,
          destination_dc: form.datacenter,
          environment: form.environment,
        });
        setBirthrightResult(result);
      } catch {
        setBirthrightResult(null);
      }
      setValidatingBR(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [form.source_zone, form.destination_zone, form.environment, form.datacenter, isOpen]);

  const handleSubmit = () => {
    if (conflicts.length > 0 && !showConflicts) {
      setShowConflicts(true);
      return;
    }
    if (hasErrors) return;
    // Block if birthright violations exist
    if (birthrightResult && !birthrightResult.compliant && birthrightResult.violations.length > 0) {
      setShowConflicts(true);
      return;
    }
    // Auto-prefix source and destination before saving
    const prefixedForm = {
      ...form,
      source: form.source ? autoPrefixFormValue(form.source) : form.source,
      destination: form.destination ? autoPrefixFormValue(form.destination) : form.destination,
    };
    onSave(prefixedForm);
    onClose();
  };

  /** Detect type and auto-prefix a form source/destination value */
  const autoPrefixFormValue = (val: string): string => {
    const v = val.trim();
    if (!v) return v;
    const vl = v.toLowerCase();
    // Already prefixed
    if (vl.startsWith('svr-') || vl.startsWith('grp-') || vl.startsWith('rng-') || vl.startsWith('sub-') || vl.startsWith('g-')) return v;
    // Detect type: CIDR -> rng-, plain IP -> svr-, otherwise grp-
    if (/\/\d{1,2}$/.test(v)) return autoPrefix(v, 'subnet');
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(v)) return autoPrefix(v, 'ip');
    return autoPrefix(v, 'group');
  };

  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white';
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={mode === 'create' ? 'Create New Firewall Rule' : 'Edit Firewall Rule'} size="lg">
      <div className="space-y-4 p-1">
        {/* Conflict alerts */}
        {showConflicts && conflicts.length > 0 && (
          <div className="space-y-2">
            {conflicts.map((c, i) => (
              <div key={i} className={`p-3 rounded-lg border text-sm ${c.severity === 'error' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                <div className="flex items-start gap-2">
                  <span className="font-bold text-xs mt-0.5 shrink-0">{c.severity === 'error' ? 'CONFLICT' : 'WARNING'}</span>
                  <span>{c.message}</span>
                </div>
              </div>
            ))}
            {!hasErrors && (
              <p className="text-xs text-gray-500 italic">Warnings found but you can still proceed. Click the button again to confirm.</p>
            )}
            {hasErrors && (
              <p className="text-xs text-red-600 font-medium">Cannot create rule — exact duplicate detected. Please modify source, destination, or ports.</p>
            )}
          </div>
        )}
        {!showConflicts && conflicts.length > 0 && (
          <div className={`px-3 py-2 rounded-lg text-xs font-medium ${hasErrors ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
            {conflicts.length} potential conflict{conflicts.length > 1 ? 's' : ''} detected — will be shown on submit
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Application</label>
            <select className={inputClass} value={form.application} onChange={e => setForm({ ...form, application: e.target.value })}>
              <option value="">Select Application</option>
              {applications.map(app => (
                <option key={app.app_id} value={app.app_id}>{app.app_distributed_id || app.app_id}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Environment</label>
            <select className={inputClass} value={form.environment} onChange={e => setForm({ ...form, environment: e.target.value })}>
              <option value="Production">Production</option>
              <option value="Non-Production">Non-Production</option>
              <option value="Pre-Production">Pre-Production</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Source (Group/IP)</label>
            {appGroups.length > 0 ? (
              <>
                <select className={inputClass} value={form.source} onChange={e => setForm({ ...form, source: e.target.value })}>
                  <option value="">Select Source Group</option>
                  {appGroups.map(g => (
                    <option key={g.name} value={g.name}>{g.name} ({g.members.length} members)</option>
                  ))}
                  {form.source && !appGroups.find(g => g.name === form.source) && (
                    <option value={form.source}>{form.source} (custom)</option>
                  )}
                </select>
                <input className={inputClass + ' mt-1'} placeholder="Or type custom source..." value={!appGroups.find(g => g.name === form.source) ? form.source : ''} onChange={e => setForm({ ...form, source: e.target.value })} />
              </>
            ) : (
              <input className={inputClass} placeholder="e.g. grp-APP01-NH01-STD-src" value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} />
            )}
          </div>
          <div>
            <label className={labelClass}>Source Zone</label>
            <select className={inputClass} value={form.source_zone} onChange={e => setForm({ ...form, source_zone: e.target.value })}>
              <option value="">Select Zone</option>
              {appFilteredSZs.length > 0 ? (
                appFilteredSZs.map(sz => (
                  <option key={sz} value={sz}>{sz}</option>
                ))
              ) : (
                <>
                  <option value="Standard">Standard</option>
                  <option value="CCS">CCS</option>
                  <option value="CDE">CDE</option>
                  <option value="CPA">CPA</option>
                  <option value="PSE">PSE</option>
                </>
              )}
              {form.source_zone && appFilteredSZs.length > 0 && !appFilteredSZs.includes(form.source_zone) && (
                <option value={form.source_zone}>{form.source_zone} (current)</option>
              )}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Destination Group</label>
            {appGroups.length > 0 ? (
              <>
                <select className={inputClass} value={form.destination} onChange={e => setForm({ ...form, destination: e.target.value })}>
                  <option value="">Select Destination Group</option>
                  {appGroups.map(g => (
                    <option key={g.name} value={g.name}>{g.name} ({g.members.length} members)</option>
                  ))}
                  {form.destination && !appGroups.find(g => g.name === form.destination) && (
                    <option value={form.destination}>{form.destination} (current)</option>
                  )}
                </select>
                <p className="text-[10px] text-gray-400 mt-0.5">Destination must be an existing NGDC group for this app</p>
              </>
            ) : (
              <>
                <select className={inputClass} value={form.destination} disabled>
                  <option value="">No NGDC groups available</option>
                </select>
                <p className="text-[10px] text-amber-500 mt-0.5">Create groups in App Groups (Manage Groups) first</p>
              </>
            )}
          </div>
          <div>
            <label className={labelClass}>Destination Zone</label>
            <select className={inputClass} value={form.destination_zone} onChange={e => setForm({ ...form, destination_zone: e.target.value })}>
              <option value="">Select Zone</option>
              {appFilteredSZs.length > 0 ? (
                appFilteredSZs.map(sz => (
                  <option key={sz} value={sz}>{sz}</option>
                ))
              ) : (
                <>
                  <option value="Standard">Standard</option>
                  <option value="CCS">CCS</option>
                  <option value="CDE">CDE</option>
                  <option value="CPA">CPA</option>
                  <option value="PSE">PSE</option>
                </>
              )}
              {form.destination_zone && appFilteredSZs.length > 0 && !appFilteredSZs.includes(form.destination_zone) && (
                <option value={form.destination_zone}>{form.destination_zone} (current)</option>
              )}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className={labelClass}>Service Preset</label>
            <select className={inputClass} onChange={e => {
              const presets: Record<string, { port: string; protocol: string }> = {
                'HTTPS': { port: '443', protocol: 'TCP' },
                'HTTP': { port: '80', protocol: 'TCP' },
                'SSH': { port: '22', protocol: 'TCP' },
                'RDP': { port: '3389', protocol: 'TCP' },
                'DNS': { port: '53', protocol: 'UDP' },
                'SMTP': { port: '25', protocol: 'TCP' },
                'LDAP': { port: '389', protocol: 'TCP' },
                'LDAPS': { port: '636', protocol: 'TCP' },
                'SQL': { port: '1433', protocol: 'TCP' },
                'Oracle': { port: '1521', protocol: 'TCP' },
                'MySQL': { port: '3306', protocol: 'TCP' },
                'PostgreSQL': { port: '5432', protocol: 'TCP' },
                'MQ': { port: '1414', protocol: 'TCP' },
                'Kafka': { port: '9092', protocol: 'TCP' },
              };
              const p = presets[e.target.value];
              if (p) setForm({ ...form, port: p.port, protocol: p.protocol });
            }}>
              <option value="">Custom</option>
              <option value="HTTPS">HTTPS (443)</option>
              <option value="HTTP">HTTP (80)</option>
              <option value="SSH">SSH (22)</option>
              <option value="RDP">RDP (3389)</option>
              <option value="DNS">DNS (53)</option>
              <option value="SMTP">SMTP (25)</option>
              <option value="LDAP">LDAP (389)</option>
              <option value="LDAPS">LDAPS (636)</option>
              <option value="SQL">SQL Server (1433)</option>
              <option value="Oracle">Oracle (1521)</option>
              <option value="MySQL">MySQL (3306)</option>
              <option value="PostgreSQL">PostgreSQL (5432)</option>
              <option value="MQ">MQ (1414)</option>
              <option value="Kafka">Kafka (9092)</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Port</label>
            <input className={inputClass} placeholder="e.g. 443, 8080-8090" value={form.port} onChange={e => setForm({ ...form, port: e.target.value })} />
          </div>
          <div>
            <label className={labelClass}>Protocol</label>
            <select className={inputClass} value={form.protocol} onChange={e => setForm({ ...form, protocol: e.target.value })}>
              <option value="TCP">TCP</option>
              <option value="UDP">UDP</option>
              <option value="ICMP">ICMP</option>
              <option value="ANY">ANY</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Action</label>
            <select className={inputClass} value={form.action} onChange={e => setForm({ ...form, action: e.target.value })}>
              <option value="Allow">Allow</option>
              <option value="Deny">Deny</option>
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>Description</label>
          <textarea className={inputClass + ' h-20 resize-none'} placeholder="Rule description..." value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
        </div>

        {/* Birthright Validation Result - auto-enforced */}
        {validatingBR && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
            Validating birthright rules...
          </div>
        )}
        {birthrightResult && !validatingBR && (
          <div className="space-y-2">
            <div className={`p-3 rounded-lg border text-sm ${
              birthrightResult.firewall_request_required ? 'bg-amber-50 border-amber-200' :
              birthrightResult.compliant ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`font-bold text-xs ${
                  birthrightResult.firewall_request_required ? 'text-amber-700' :
                  birthrightResult.compliant ? 'text-green-700' : 'text-red-700'
                }`}>
                  Policy: {birthrightResult.matrix_used || ''}
                </span>
                <span className={`text-xs ${
                  birthrightResult.firewall_request_required ? 'text-amber-600' :
                  birthrightResult.compliant ? 'text-green-600' : 'text-red-600'
                }`}>
                  {birthrightResult.firewall_request_required
                    ? 'Firewall rule required for this cross-zone traffic'
                    : birthrightResult.compliant ? 'Permitted' : 'Blocked by policy'}
                </span>
              </div>
              {birthrightResult.permitted.length > 0 && (
                <ul className="text-xs text-green-700 list-disc list-inside mt-1">
                  {birthrightResult.permitted.map((p, i) => (
                    <li key={i}>{p.rule} — {p.reason}</li>
                  ))}
                </ul>
              )}
              {birthrightResult.warnings.length > 0 && (
                <ul className="text-xs text-amber-700 list-disc list-inside mt-1">
                  {birthrightResult.warnings.map((w, i) => (
                    <li key={i}>{w.rule} — {w.reason}</li>
                  ))}
                </ul>
              )}
            </div>
            {birthrightResult.firewall_devices_needed && birthrightResult.firewall_devices_needed.length > 0 && (
              <div className="p-3 rounded-lg border border-blue-200 bg-blue-50 text-sm">
                <div className="font-bold text-xs text-blue-800 mb-1">Firewall Traversal ({birthrightResult.firewall_devices_needed.length} hop{birthrightResult.firewall_devices_needed.length > 1 ? 's' : ''})</div>
                <div className="flex flex-wrap gap-2">
                  {birthrightResult.firewall_devices_needed.map((dev, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white border border-blue-300 text-xs font-mono text-blue-800">
                      {dev}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Datacenter</label>
            <select className={inputClass} value={form.datacenter} onChange={e => setForm({ ...form, datacenter: e.target.value })}>
              <option value="ALPHA_NGDC">Alpha NGDC</option>
              <option value="BETA_NGDC">Beta NGDC</option>
              <option value="GAMMA_NGDC">Gamma NGDC</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 text-blue-600 rounded" checked={form.is_group_to_group} onChange={e => setForm({ ...form, is_group_to_group: e.target.checked })} />
              <span className="text-sm text-gray-700">Group-to-Group Rule</span>
            </label>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
        <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
        <button
          onClick={handleSubmit}
          disabled={showConflicts && hasErrors}
          className={`px-4 py-2 text-sm font-medium rounded-md ${showConflicts && hasErrors ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'text-white bg-blue-600 hover:bg-blue-700'}`}
        >
          {showConflicts && conflicts.length > 0 && !hasErrors ? `Confirm ${mode === 'create' ? 'Create' : 'Update'}` : mode === 'create' ? 'Create Rule' : 'Update Rule'}
        </button>
      </div>
    </Modal>
  );
}
