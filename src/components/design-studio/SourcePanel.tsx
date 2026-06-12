import { useState, useEffect } from 'react';
import { Monitor, Globe, Server, ChevronDown, CheckCircle, AlertTriangle } from 'lucide-react';
import type { SourceConfig, SourceType, NeighbourhoodRegistry, Application, NamingStandardsInfo } from '@/types';

interface SourcePanelProps {
  source: SourceConfig;
  onChange: (source: SourceConfig) => void;
  neighbourhoods: NeighbourhoodRegistry[];
  applications: Application[];
  namingStandards: NamingStandardsInfo | null;
}

export function SourcePanel({ source, onChange, neighbourhoods, applications, namingStandards }: SourcePanelProps) {
  const [expandedNH, setExpandedNH] = useState(true);
  const [expandedNaming, setExpandedNaming] = useState(true);
  const [selectedAppId, setSelectedAppId] = useState('');
  const [selectedSubtype, setSelectedSubtype] = useState('APP');
  const [generatedName, setGeneratedName] = useState('');
  const [nameValid, setNameValid] = useState<boolean | null>(null);

  const updateField = (field: keyof SourceConfig, value: string | null) => {
    onChange({ ...source, [field]: value });
  };

  useEffect(() => {
    if (source.source_type === 'Group' && selectedAppId && source.neighbourhood && source.security_zone) {
      const nhId = neighbourhoods.find(n => n.name === source.neighbourhood)?.id
        || source.neighbourhood;
      const name = `grp-${selectedAppId}-${nhId}-${source.security_zone}-${selectedSubtype}`;
      setGeneratedName(name);
      setNameValid(true);
    }
  }, [selectedAppId, source.neighbourhood, source.security_zone, selectedSubtype, source.source_type, neighbourhoods]);

  useEffect(() => {
    if (source.group_name && source.group_name.startsWith('grp-')) {
      const parts = source.group_name.split('-');
      setNameValid(parts.length >= 5);
    } else if (source.group_name && (source.group_name.startsWith('svr-') || source.group_name.startsWith('rng-') || source.group_name.startsWith('net-'))) {
      const parts = source.group_name.split('-');
      setNameValid(parts.length >= 5);
    } else if (source.group_name) {
      setNameValid(false);
    }
  }, [source.group_name]);

  const applyGeneratedName = () => {
    if (generatedName) {
      onChange({ ...source, group_name: generatedName, source_type: 'Group' });
    }
  };

  const subtypes = namingStandards?.valid_subtypes || {
    APP: 'Application Servers',
    WEB: 'Web Servers',
    DB: 'Database Servers',
    BAT: 'Batch Servers',
    MQ: 'Message Queue',
    API: 'API Servers',
    LB: 'Load Balancers',
    MON: 'Monitoring',
    MFR: 'Mainframe',
    SVC: 'Services',
  };

  return (
    <div className="flex flex-col rounded-xl border-2 border-blue-200 bg-blue-50/50 shadow-sm">
      <div className="rounded-t-xl bg-gradient-to-r from-slate-700 to-slate-600 px-4 py-3">
        <h3 className="text-base font-bold text-white">Source</h3>
      </div>

      <div className="space-y-4 p-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-500 uppercase tracking-wide">Source Type:</label>
          <div className="space-y-2">
            {(['Single IP', 'Subnet', 'Range', 'Group'] as SourceType[]).map((type) => (
              <label key={type} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="sourceType"
                  checked={source.source_type === type}
                  onChange={() => onChange({ ...source, source_type: type })}
                  className="h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-slate-700">{type}</span>
                {type === 'Single IP' && source.source_type === 'Single IP' && (
                  <div className="ml-auto flex items-center gap-1">
                    <Monitor className="h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={source.ip_address || ''}
                      onChange={(e) => updateField('ip_address', e.target.value)}
                      placeholder="1.10..."
                      className="w-20 rounded border border-slate-300 px-2 py-0.5 text-xs"
                    />
                  </div>
                )}
              </label>
            ))}
            {source.source_type === 'Subnet' && (
              <div className="ml-6 flex items-center gap-2">
                <Globe className="h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={source.cidr || ''}
                  onChange={(e) => updateField('cidr', e.target.value)}
                  placeholder="net-10.0.1.0/24"
                  className="w-40 rounded border border-slate-300 px-2 py-1 text-xs"
                />
              </div>
            )}
            {source.source_type === 'Range' && (
              <div className="ml-6 flex items-center gap-2">
                <Globe className="h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={source.cidr || ''}
                  onChange={(e) => updateField('cidr', e.target.value)}
                  placeholder="rng-10.0.1.1-10.0.1.50"
                  className="w-48 rounded border border-slate-300 px-2 py-1 text-xs"
                />
              </div>
            )}
          </div>
        </div>

        <div>
          <button
            onClick={() => setExpandedNaming(!expandedNaming)}
            className="mb-2 flex w-full items-center justify-between text-xs font-semibold text-blue-600 uppercase tracking-wide"
          >
            Naming Standards Builder
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expandedNaming ? 'rotate-180' : ''}`} />
          </button>
          {expandedNaming && (
            <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
              <div>
                <label className="mb-0.5 block text-xs font-medium text-slate-600">App ID:</label>
                <select
                  value={selectedAppId}
                  onChange={(e) => setSelectedAppId(e.target.value)}
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                >
                  <option value="">Select Application</option>
                  {applications.map((app) => (
                    <option key={app.id} value={app.app_id}>{app.app_distributed_id || app.app_id}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-0.5 block text-xs font-medium text-slate-600">Subtype:</label>
                <select
                  value={selectedSubtype}
                  onChange={(e) => setSelectedSubtype(e.target.value)}
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                >
                  {Object.entries(subtypes).map(([code, desc]) => (
                    <option key={code} value={code}>{code} - {desc}</option>
                  ))}
                </select>
              </div>

              {generatedName && (
                <div className="mt-2">
                  <label className="mb-0.5 block text-xs font-medium text-slate-600">Generated Name:</label>
                  <div className="flex items-center gap-1">
                    <code className="flex-1 rounded bg-white px-2 py-1 text-xs font-mono text-blue-700 border border-blue-200">
                      {generatedName}
                    </code>
                    <button
                      onClick={applyGeneratedName}
                      className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-1 rounded bg-slate-50 px-2 py-1.5 text-xs text-slate-500">
                <div className="font-semibold text-slate-600 mb-0.5">Format:</div>
                <div><span className="font-mono text-blue-600">svr-</span>{'{'}<span>AppID</span>{'}'}-{'{'}<span>NH</span>{'}'}-{'{'}<span>SZ</span>{'}'}-{'{'}<span>ServerName</span>{'}'} <span className="text-gray-400">(IPs)</span></div>
                <div><span className="font-mono text-purple-600">net-</span>{'{'}<span>AppID</span>{'}'}-{'{'}<span>NH</span>{'}'}-{'{'}<span>SZ</span>{'}'}-{'{'}<span>Descriptor</span>{'}'} <span className="text-gray-400">(Subnets)</span></div>
                <div><span className="font-mono text-orange-600">rng-</span>{'{'}<span>AppID</span>{'}'}-{'{'}<span>NH</span>{'}'}-{'{'}<span>SZ</span>{'}'}-{'{'}<span>Descriptor</span>{'}'} <span className="text-gray-400">(Ranges)</span></div>
                <div><span className="font-mono text-emerald-600">grp-</span>{'{'}<span>AppID</span>{'}'}-{'{'}<span>NH</span>{'}'}-{'{'}<span>SZ</span>{'}'}-{'{'}<span>Subtype</span>{'}'} <span className="text-gray-400">(Groups)</span></div>
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Group / Source Name:
          </label>
          <div className="relative">
            <input
              type="text"
              value={source.group_name || ''}
              onChange={(e) => updateField('group_name', e.target.value)}
              placeholder="grp-APP-NH01-GEN-APP"
              className={`w-full rounded border px-3 py-1.5 text-sm pr-8 ${
                nameValid === true ? 'border-green-400 bg-green-50' :
                nameValid === false ? 'border-red-400 bg-red-50' :
                'border-slate-300'
              }`}
            />
            {nameValid === true && (
              <CheckCircle className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
            )}
            {nameValid === false && (
              <AlertTriangle className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500" />
            )}
          </div>
          {nameValid === false && source.group_name && (
            <p className="mt-0.5 text-xs text-red-500">
              Name must use svr-/net-/rng-/grp- prefix with AppID-NH-SZ-Subtype
            </p>
          )}
        </div>

        <div>
          <select
            value={source.ports}
            onChange={(e) => updateField('ports', e.target.value)}
            className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm"
          >
            <option>TCP 8080</option>
            <option>TCP 8443</option>
            <option>TCP 443</option>
            <option>TCP 22</option>
            <option>TCP 1521</option>
            <option>TCP 3306</option>
            <option>TCP 8080-8443</option>
            <option>UDP 53</option>
          </select>
        </div>

        <div>
          <button
            onClick={() => setExpandedNH(!expandedNH)}
            className="mb-2 flex w-full items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wide"
          >
            Neighbourhood
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expandedNH ? 'rotate-180' : ''}`} />
          </button>
          {expandedNH && (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {neighbourhoods.map((nh) => (
                <button
                  key={nh.id}
                  onClick={() => {
                    onChange({ ...source, neighbourhood: nh.name, neighbourhood_name: nh.name, security_zone: nh.zone });
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    source.neighbourhood === nh.name
                      ? 'bg-blue-100 border-2 border-blue-400 text-blue-800 font-medium'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Server className="h-3.5 w-3.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="block truncate text-xs">{nh.id} - {nh.name}</span>
                  </div>
                  <span className={`rounded px-1.5 py-0.5 text-xs font-bold flex-shrink-0 ${
                    nh.zone === 'CDE' ? 'bg-orange-100 text-orange-700' :
                    nh.zone === 'DMZ' ? 'bg-purple-100 text-purple-700' :
                    nh.zone === 'RST' ? 'bg-red-100 text-red-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    {nh.zone}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
