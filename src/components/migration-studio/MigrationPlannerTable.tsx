import { ArrowRight, Database, Shield, List } from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import { Badge } from '@/components/ui/badge';

interface MappingRow {
  id?: string;
  mapping_id?: string;
  legacy_source?: string;
  legacy_source_detail?: string | null;
  legacy_group?: string | null;
  ngdc_target?: string;
  ngdc_target_detail?: string | null;
  ngdc_source?: string;
  ngdc_destination?: string;
  mapping_status?: string;
  status?: string;
  trust_zones_automapped?: number;
  related_policies?: string[];
  [key: string]: unknown;
}

interface MigrationPlannerTableProps {
  mappings: MappingRow[];
  filterStatus: string;
  onFilterChange: (status: string) => void;
}

const filterTabs = [
  { label: 'All', value: 'all', icon: List },
  { label: 'Auto', value: 'Auto-Mapped', icon: null },
  { label: 'New-Group', value: 'New Group', icon: null },
  { label: 'Needs Review', value: 'Needs Review', icon: null },
  { label: 'Conflict', value: 'Conflict', icon: null },
];

export function MigrationPlannerTable({ mappings, filterStatus, onFilterChange }: MigrationPlannerTableProps) {
  const getStatus = (m: MappingRow) => m.mapping_status || m.status || 'Unknown';
  const filtered = filterStatus === 'all' ? mappings : mappings.filter(m => getStatus(m) === filterStatus);

  const counts = {
    all: mappings.length,
    'Auto-Mapped': mappings.filter(m => getStatus(m) === 'Auto-Mapped' || getStatus(m) === 'Mapped').length,
    'New Group': mappings.filter(m => getStatus(m) === 'New Group').length,
    'Needs Review': mappings.filter(m => getStatus(m) === 'Needs Review' || getStatus(m) === 'Review Required').length,
    'Conflict': mappings.filter(m => getStatus(m) === 'Conflict').length,
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h3 className="text-base font-bold text-slate-800">Migration Planner</h3>
        <span className="text-xs text-slate-500">1-1r {mappings.length}</span>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-100 px-4 py-2">
        {filterTabs.map((tab) => {
          const count = counts[tab.value as keyof typeof counts] || 0;
          return (
            <button
              key={tab.value}
              onClick={() => onFilterChange(tab.value)}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                filterStatus === tab.value
                  ? 'bg-blue-100 text-blue-700 border border-blue-200'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-xs ${
                  filterStatus === tab.value ? 'bg-blue-200 text-blue-800' : 'bg-slate-200 text-slate-600'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Table Header */}
      <div className="grid grid-cols-12 gap-2 border-b border-slate-100 bg-blue-600 px-4 py-2 text-xs font-semibold text-white rounded-none">
        <div className="col-span-4">Legacy Source:</div>
        <div className="col-span-1">Group:</div>
        <div className="col-span-1"></div>
        <div className="col-span-4">NGDC Target</div>
        <div className="col-span-2">Status</div>
      </div>

      {/* Mapping Rows */}
      <div className="divide-y divide-slate-50">
        {filtered.map((mapping, idx) => {
          const policies = mapping.related_policies || [];
          const target = mapping.ngdc_target || mapping.ngdc_destination || '';
          const targetDetail = mapping.ngdc_target_detail || mapping.ngdc_source || '';
          const status = getStatus(mapping);
          const tzAuto = mapping.trust_zones_automapped || 0;
          return (
            <div key={mapping.id || mapping.mapping_id || idx} className="grid grid-cols-12 gap-2 px-4 py-3 hover:bg-blue-50/30 transition-colors items-center">
              <div className="col-span-4">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  <div>
                    <div className="text-sm font-semibold text-slate-800">{mapping.legacy_source || ''}</div>
                    <div className="text-xs text-slate-500">{mapping.legacy_source_detail || ''}</div>
                  </div>
                </div>
                {policies.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1 ml-6">
                    {policies.map((p) => (
                      <span key={p} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500 font-mono">{p}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="col-span-1">
                {mapping.legacy_group && (
                  <span className="text-xs text-slate-500">{mapping.legacy_group}</span>
                )}
              </div>
              <div className="col-span-1 flex justify-center">
                <ArrowRight className="h-5 w-5 text-blue-400" />
              </div>
              <div className="col-span-4">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-teal-500 flex-shrink-0" />
                  <div>
                    <div className="text-sm font-semibold text-slate-800">{target}</div>
                    <div className="text-xs text-slate-500">{targetDetail}</div>
                  </div>
                </div>
                {tzAuto > 0 && (
                  <div className="mt-1 flex items-center gap-1 ml-6">
                    <span className="text-xs text-teal-600">
                      Auto-Mapped &bull; {tzAuto} Trust Zones automapped
                    </span>
                  </div>
                )}
              </div>
              <div className="col-span-2">
                <StatusBadge status={status} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 bg-slate-50/50">
        <div className="flex items-center gap-4">
          <Badge variant="success">
            Migration Summary
          </Badge>
          <span className="text-xs text-slate-600">
            <strong>{counts['Auto-Mapped']}</strong> Auto-Mapped
          </span>
          <span className="text-xs text-slate-600">
            <strong>{counts['Conflict'] + counts['Needs Review']}</strong> Conflict
          </span>
        </div>
      </div>
    </div>
  );
}
