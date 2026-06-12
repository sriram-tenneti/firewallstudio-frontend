import { useState, useEffect } from 'react';
import { compileEgressIngress, getFirewallDevices } from '@/lib/api';

interface BoundaryDevice {
  device_id: string; device_name: string; nh: string; sz: string;
  role: string; direction: string; compiled: string;
}

export interface EgressIngressResult {
  rule_id: string; vendor_format: string; boundaries: number;
  flow_rule: string; note: string;
  requires_egress: boolean; requires_ingress: boolean;
  devices: BoundaryDevice[];
  egress_compiled: string; ingress_compiled: string;
  source_zone: string; destination_zone: string;
  source_nh: string; destination_nh: string;
  source_dc?: string; destination_dc?: string;
  source_objects?: string[]; destination_objects?: string[];
  service?: string;
  compliant?: boolean; compliance_note?: string;
  existing_rule?: boolean;
}

interface FWDevice {
  device_id: string; name: string; vendor: string; dc: string;
  nh?: string; sz?: string; type: string; status: string;
  mgmt_ip?: string; ha_pair?: string; capabilities?: string[];
}

interface LDFFlowVisualizationProps {
  ruleId: string;
  vendor?: string;
  /** Pre-loaded boundary data (skip API call) */
  boundaryData?: EgressIngressResult | null;
  compact?: boolean;
}

const VENDOR_LABELS: Record<string, string> = {
  palo_alto: 'Palo Alto', checkpoint: 'Check Point', fortigate: 'FortiGate', generic: 'Generic',
};

const LDF_RULE_LABELS: Record<string, string> = {
  'LDF-001': 'Standard (STD/GEN) zone workloads flow between neighbourhoods without firewall traversal',
  'LDF-002': 'Same neighbourhood, same security zone — rule deployed on zone firewall device (permitted per birthright)',
  'LDF-003': 'Segmented to Prod data flow between security zones in different neighbourhoods — egress firewall required',
  'LDF-003-reverse': 'Non-segmented to segmented zone in different neighbourhood — ingress firewall required',
  'LDF-004': 'Same security zone across different neighbourhoods — permitted per birthright, traffic passes through egress and ingress FW devices (informational)',
  'LDF-005': 'Cross-zone within same neighbourhood — single segmentation firewall boundary',
  'LDF-006': 'Publicly Accessible Application (PAA) flow — traffic traverses PAA perimeter and internal firewalls',
  'LDF-DEFAULT': 'No firewall boundary required for this traffic flow',
};

function determineLDFRule(data: EgressIngressResult): string {
  const { boundaries, source_zone, destination_zone, source_nh, destination_nh } = data;
  const segmented = new Set(['CPA', 'CDE', 'CCS', 'PAA', '3PY', 'Swift', 'PSE', 'UC', 'UCPA', 'UCDE', 'UCCS', 'UPAA', 'U3PY']);
  const srcSeg = segmented.has(source_zone);
  const dstSeg = segmented.has(destination_zone);

  if (boundaries === 0) {
    if (source_nh === destination_nh) return 'LDF-002';
    return 'LDF-001';
  }
  if (boundaries === 1) {
    if (source_nh === destination_nh) return 'LDF-005';
    return 'LDF-003';
  }
  // boundaries === 2
  if (source_zone === 'PAA' || destination_zone === 'PAA') return 'LDF-006';
  if (srcSeg && dstSeg && source_zone === destination_zone) return 'LDF-004';
  return 'LDF-006';
}

export function LDFFlowVisualization({ ruleId, vendor = 'generic', boundaryData, compact = false }: LDFFlowVisualizationProps) {
  const [data, setData] = useState<EgressIngressResult | null>(boundaryData ?? null);
  const [loading, setLoading] = useState(!boundaryData);
  const [allDevices, setAllDevices] = useState<FWDevice[]>([]);

  useEffect(() => {
    if (boundaryData) { setData(boundaryData); setLoading(false); return; }
    if (!ruleId) return;
    setLoading(true);
    compileEgressIngress(ruleId, vendor)
      .then(d => setData(d as unknown as EgressIngressResult))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [ruleId, vendor, boundaryData]);

  useEffect(() => {
    getFirewallDevices()
      .then(d => setAllDevices(d as unknown as FWDevice[]))
      .catch(() => setAllDevices([]));
  }, []);

  if (loading) {
    return (
      <div className="border border-indigo-200 rounded-lg p-4 bg-indigo-50 animate-pulse">
        <div className="h-4 w-48 bg-indigo-200 rounded mb-2" />
        <div className="h-20 bg-indigo-100 rounded" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
        <p className="text-xs text-gray-500 italic">Logical Data Flow analysis not available for this rule.</p>
      </div>
    );
  }

  const ldfRule = determineLDFRule(data);
  const ldfDescription = LDF_RULE_LABELS[ldfRule] || 'Unknown LDF rule';
  const egressDevices = data.devices.filter(d => d.direction === 'egress');
  const ingressDevices = data.devices.filter(d => d.direction === 'ingress');
  const boundaryDevices = data.devices.filter(d => d.direction === 'boundary');
  const localDevices = data.devices.filter(d => d.direction === 'local');

  // Look up full device details from allDevices
  const enrichDevice = (dev: BoundaryDevice): BoundaryDevice & Partial<FWDevice> => {
    const full = allDevices.find(fd => fd.device_id === dev.device_id);
    return { ...dev, ...full };
  };

  // When existing_rule is true (LDF-002 segmented same-SZ same-NH), render in green
  const isExisting = !!data.existing_rule;
  const colorScheme = isExisting ? 'green' : data.boundaries === 0 ? 'green' : data.boundaries === 1 ? 'amber' : 'red';

  // SVG icons matching Confluence diagrams
  const ServerIcon = () => (
    <svg viewBox="0 0 40 48" className="w-10 h-12 mx-auto mb-1">
      {/* Server rack icon */}
      <rect x="4" y="0" width="32" height="10" rx="2" fill="#475569" stroke="#334155" strokeWidth="1" />
      <rect x="4" y="12" width="32" height="10" rx="2" fill="#475569" stroke="#334155" strokeWidth="1" />
      <rect x="4" y="24" width="32" height="10" rx="2" fill="#475569" stroke="#334155" strokeWidth="1" />
      <rect x="4" y="36" width="32" height="10" rx="2" fill="#475569" stroke="#334155" strokeWidth="1" />
      {/* Drive bays */}
      <rect x="7" y="2" width="8" height="2" rx="0.5" fill="#94a3b8" /><rect x="7" y="5" width="8" height="2" rx="0.5" fill="#94a3b8" />
      <rect x="7" y="14" width="8" height="2" rx="0.5" fill="#94a3b8" /><rect x="7" y="17" width="8" height="2" rx="0.5" fill="#94a3b8" />
      <rect x="7" y="26" width="8" height="2" rx="0.5" fill="#94a3b8" /><rect x="7" y="29" width="8" height="2" rx="0.5" fill="#94a3b8" />
      <rect x="7" y="38" width="8" height="2" rx="0.5" fill="#94a3b8" /><rect x="7" y="41" width="8" height="2" rx="0.5" fill="#94a3b8" />
      {/* LEDs */}
      <circle cx="30" cy="5" r="1.5" fill="#22c55e" /><circle cx="30" cy="17" r="1.5" fill="#22c55e" />
      <circle cx="30" cy="29" r="1.5" fill="#22c55e" /><circle cx="30" cy="41" r="1.5" fill="#22c55e" />
    </svg>
  );

  const FirewallIcon = () => (
    <svg viewBox="0 0 36 44" className="w-9 h-11 mx-auto mb-1">
      {/* Firewall brick wall icon */}
      <rect x="0" y="0" width="36" height="44" rx="2" fill="#991b1b" stroke="#7f1d1d" strokeWidth="1" />
      {/* Brick rows */}
      <rect x="2" y="2" width="14" height="6" rx="1" fill="#dc2626" /><rect x="18" y="2" width="16" height="6" rx="1" fill="#dc2626" />
      <rect x="2" y="10" width="20" height="6" rx="1" fill="#dc2626" /><rect x="24" y="10" width="10" height="6" rx="1" fill="#dc2626" />
      <rect x="2" y="18" width="10" height="6" rx="1" fill="#dc2626" /><rect x="14" y="18" width="20" height="6" rx="1" fill="#dc2626" />
      <rect x="2" y="26" width="18" height="6" rx="1" fill="#dc2626" /><rect x="22" y="26" width="12" height="6" rx="1" fill="#dc2626" />
      <rect x="2" y="34" width="12" height="6" rx="1" fill="#dc2626" /><rect x="16" y="34" width="18" height="6" rx="1" fill="#dc2626" />
    </svg>
  );

  // Bi-directional arrow matching Confluence style
  const BiArrow = () => (
    <div className="flex-shrink-0 w-16 flex items-center justify-center">
      <svg width="56" height="20" viewBox="0 0 56 20">
        <path d="M8 10 H48" fill="none" stroke="#1e293b" strokeWidth="2.5" />
        <path d="M8 4 L0 10 L8 16" fill="none" stroke="#1e293b" strokeWidth="2.5" />
        <path d="M48 4 L56 10 L48 16" fill="none" stroke="#1e293b" strokeWidth="2.5" />
      </svg>
    </div>
  );

  // Build source/dest labels — show group or app name, NOT individual IPs
  const srcLabel = (() => {
    // Prefer app name from source_objects if it's NOT an IP/svr- reference
    if (data.source_objects?.length) {
      const first = data.source_objects[0];
      if (!first.match(/^(svr-|\d+\.|any)/i)) return first;
    }
    return 'Source';
  })();
  const dstLabel = (() => {
    if (data.destination_objects?.length) {
      const first = data.destination_objects[0];
      if (!first.match(/^(svr-|\d+\.|any)/i)) return first;
    }
    return 'Destination';
  })();

  return (
    <div className={`border rounded-lg overflow-hidden ${colorScheme === 'green' ? 'border-green-200' : colorScheme === 'amber' ? 'border-amber-200' : 'border-red-200'}`}>
      {/* Header */}
      <div className={`px-4 py-3 ${colorScheme === 'green' ? 'bg-green-50' : colorScheme === 'amber' ? 'bg-amber-50' : 'bg-red-50'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className={`text-sm font-bold ${colorScheme === 'green' ? 'text-green-800' : colorScheme === 'amber' ? 'text-amber-800' : 'text-red-800'}`}>
              Logical Data Flow
            </h3>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
              colorScheme === 'green' ? 'bg-green-200 text-green-800' :
              colorScheme === 'amber' ? 'bg-amber-200 text-amber-800' :
              'bg-red-200 text-red-800'
            }`}>
              {data.boundaries} {data.boundaries === 1 ? 'Boundary' : 'Boundaries'}
              {isExisting && ' (Active)'}
            </span>
          </div>
          <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 text-xs font-mono font-bold">{ldfRule}</span>
        </div>
        <p className="text-xs mt-1 opacity-80">{ldfDescription}</p>
      </div>

      {/* Flow Diagram — Confluence style with server racks, firewall bricks, and bi-directional arrows */}
      <div className="px-4 py-6 bg-white">
        <div className="flex items-center justify-center gap-0 overflow-x-auto">
          {/* Source Application Node — show NH/SZ/DC path, not IPs */}
          <div className="flex-shrink-0 w-40 text-center">
            <ServerIcon />
            <div className="text-sm font-bold text-gray-900">{srcLabel}</div>
            <div className="text-[11px] font-semibold text-blue-700">{data.source_zone}</div>
            <div className="text-[10px] text-gray-600">{data.source_nh} / {data.source_dc ? data.source_dc.replace(/_/g, ' ') : 'DC'}</div>
          </div>

          <BiArrow />

          {data.boundaries === 0 ? (
            /* Direct connection — no firewall traversal, but may have zone device */
            localDevices.length > 0 ? (
              <div className="flex-shrink-0 text-center">
                <FirewallIcon />
                {localDevices.map((dev, i) => {
                  const enriched = enrichDevice(dev);
                  return (
                    <div key={i}>
                      <div className="text-[11px] font-bold text-gray-900">{dev.nh} {dev.sz} FW</div>
                      <div className="text-[9px] text-gray-500">{enriched.name || dev.device_name}</div>
                      <div className="text-[9px] text-blue-600 font-medium mt-0.5">Rule Active</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex-shrink-0 px-4 py-2 bg-green-100 border-2 border-green-400 rounded-lg">
                <span className="text-xs font-bold text-green-800">No Firewall Boundary</span>
              </div>
            )
          ) : (
            <>
              {/* Egress Firewall Device(s) */}
              {(egressDevices.length > 0 || data.requires_egress) && (
                <div className="flex-shrink-0 text-center">
                  <FirewallIcon />
                      {egressDevices.length > 0 ? egressDevices.map((dev, i) => {
                        const enriched = enrichDevice(dev);
                        return (
                          <div key={i}>
                            <div className="text-[11px] font-bold text-gray-900">{dev.nh} {dev.sz} FW</div>
                            <div className="text-[9px] text-gray-500">{enriched.name || dev.device_name}</div>
                          </div>
                        );
                      }) : (
                        <div className="text-[10px] font-semibold text-orange-700">{data.source_nh} {data.source_zone} FW</div>
                      )}
                </div>
              )}

              {/* Arrow between egress and ingress (or boundary) */}
              {(egressDevices.length > 0 || data.requires_egress) && (ingressDevices.length > 0 || data.requires_ingress) && (
                <BiArrow />
              )}

              {/* Boundary Device (for single boundary scenarios without separate egress/ingress) */}
              {boundaryDevices.length > 0 && egressDevices.length === 0 && ingressDevices.length === 0 && (
                <div className="flex-shrink-0 text-center">
                  <FirewallIcon />
                      {boundaryDevices.map((dev, i) => {
                        const enriched = enrichDevice(dev);
                        return (
                          <div key={i}>
                            <div className="text-[11px] font-bold text-gray-900">{dev.nh} {dev.sz} FW</div>
                            <div className="text-[9px] text-gray-500">{enriched.name || dev.device_name}</div>
                          </div>
                        );
                      })}
                </div>
              )}

              {/* Ingress Firewall Device(s) */}
              {(ingressDevices.length > 0 || data.requires_ingress) && (
                <div className="flex-shrink-0 text-center">
                  <FirewallIcon />
                      {ingressDevices.length > 0 ? ingressDevices.map((dev, i) => {
                        const enriched = enrichDevice(dev);
                        return (
                          <div key={i}>
                            <div className="text-[11px] font-bold text-gray-900">{dev.nh} {dev.sz} FW</div>
                            <div className="text-[9px] text-gray-500">{enriched.name || dev.device_name}</div>
                          </div>
                        );
                      }) : (
                        <div className="text-[10px] font-semibold text-cyan-700">{data.destination_nh} {data.destination_zone} FW</div>
                      )}
                </div>
              )}
            </>
          )}

          <BiArrow />

          {/* Destination Application Node — show NH/SZ/DC path, not IPs */}
          <div className="flex-shrink-0 w-40 text-center">
            <ServerIcon />
            <div className="text-sm font-bold text-gray-900">{dstLabel}</div>
            <div className="text-[11px] font-semibold text-purple-700">{data.destination_zone}</div>
            <div className="text-[10px] text-gray-600">{data.destination_nh} / {data.destination_dc ? data.destination_dc.replace(/_/g, ' ') : 'DC'}</div>
          </div>
        </div>
      </div>

      {/* Explanation & Note */}
      <div className={`px-4 py-2 text-xs border-t ${data.boundaries === 0 ? 'bg-green-50 border-green-200 text-green-700' : data.boundaries === 1 ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
        <span className="font-medium">Flow Rule:</span> {data.flow_rule}
        {data.note && <span className="ml-2 opacity-80">| {data.note}</span>}
      </div>

      {/* Compliancy Status */}
      {data.compliant !== undefined && (
        <div className={`px-4 py-2 text-xs border-t ${data.compliant ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <span className={`font-bold ${data.compliant ? 'text-green-700' : 'text-red-700'}`}>
            {data.compliant ? 'COMPLIANT' : 'NON-COMPLIANT'}
          </span>
          {data.compliance_note && <span className="ml-2 text-gray-600">{data.compliance_note}</span>}
        </div>
      )}

      {/* Device-Specific Compiled Rules — auto-expanded */}
      {!compact && data.devices.length > 0 && (
        <DeviceCompiledRules devices={data.devices} allDevices={allDevices} />
      )}
    </div>
  );
}

function DeviceCompiledRules({ devices, allDevices }: { devices: BoundaryDevice[]; allDevices: FWDevice[] }) {
  return (
    <div className="border-t border-gray-200">
      <div className="px-4 py-2 bg-gray-50">
        <span className="text-xs font-semibold text-gray-700">Per-Device Compiled Rules ({devices.length} device{devices.length !== 1 ? 's' : ''})</span>
      </div>
      <div className="p-3 space-y-2 bg-gray-50">
        {devices.map((dev, i) => {
          const full = allDevices.find(fd => fd.device_id === dev.device_id);
          return (
            <div key={i} className="bg-gray-900 rounded-lg p-3 overflow-x-auto">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                    dev.direction === 'egress' ? 'bg-orange-500 text-white' :
                    dev.direction === 'ingress' ? 'bg-cyan-500 text-white' :
                    dev.direction === 'local' ? 'bg-blue-500 text-white' :
                    'bg-purple-500 text-white'
                  }`}>{dev.direction === 'local' ? 'ACTIVE' : dev.direction.toUpperCase()}</span>
                  <span className="text-xs text-gray-200 font-medium">{full?.name || dev.device_name}</span>
                  <span className="text-[10px] text-gray-500">({dev.device_id})</span>
                  {full?.vendor && <span className="text-[10px] text-gray-400 px-1.5 py-0.5 bg-gray-800 rounded">{VENDOR_LABELS[full.vendor] || full.vendor}</span>}
                </div>
                <button onClick={() => navigator.clipboard.writeText(dev.compiled)} className="text-xs text-blue-400 hover:text-blue-300">Copy</button>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-gray-500 mb-1.5">
                <span>NH: {dev.nh}</span>
                <span>SZ: {dev.sz}</span>
                <span>Role: {dev.role}</span>
                {full?.dc && <span>DC: {full.dc}</span>}
                {full?.mgmt_ip && <span>Mgmt: {full.mgmt_ip}</span>}
                {full?.status && <span className={`px-1 py-0.5 rounded ${full.status === 'Active' ? 'bg-green-900 text-green-400' : 'bg-yellow-900 text-yellow-400'}`}>{full.status}</span>}
              </div>
              <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">{dev.compiled}</pre>
            </div>
          );
        })}
      </div>
    </div>
  );
}
