import { StatusBadge } from '../shared/StatusBadge';
import type { LegacyRule } from '@/types';

interface MappingPanelProps {
  rule: LegacyRule;
  onAcceptMapping?: (ruleId: string) => void;
  onCustomize?: (ruleId: string) => void;
}

export function MappingPanel({ rule, onAcceptMapping, onCustomize }: MappingPanelProps) {
  const isStandard = rule.is_standard;

  return (
    <div className="border rounded-lg p-4 bg-white">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="text-sm font-semibold text-gray-800">{rule.id} - {rule.app_name}</h4>
          <p className="text-xs text-gray-500 mt-0.5">{rule.app_id} - {rule.app_distributed_id}</p>
        </div>
        <StatusBadge status={rule.migration_status} />
      </div>

      <div className="grid grid-cols-2 gap-4 mb-3">
        {/* Current State */}
        <div className="p-3 bg-red-50 border border-red-100 rounded-lg">
          <h5 className="text-xs font-semibold text-red-700 mb-2 uppercase tracking-wider">Current (Legacy)</h5>
          <div className="space-y-1.5 text-xs">
            <div><span className="text-gray-500">Source:</span> <span className="font-mono text-gray-800">{rule.rule_source || 'N/A'}</span></div>
            <div><span className="text-gray-500">Destination:</span> <span className="font-mono text-gray-800">{rule.rule_destination || 'N/A'}</span></div>
            <div><span className="text-gray-500">Service:</span> <span className="font-mono text-gray-800">{rule.rule_service || 'N/A'}</span></div>
            <div><span className="text-gray-500">Zone:</span> <span className="text-gray-800">{rule.rule_source_zone}</span></div>
            <div><span className="text-gray-500">Standard:</span> <StatusBadge status={isStandard ? 'Yes' : 'No'} /></div>
          </div>
        </div>

        {/* Recommended State */}
        <div className="p-3 bg-green-50 border border-green-100 rounded-lg">
          <h5 className="text-xs font-semibold text-green-700 mb-2 uppercase tracking-wider">Recommended (NGDC)</h5>
          <div className="space-y-1.5 text-xs">
            <div><span className="text-gray-500">Group Name:</span> <span className="font-mono text-gray-800">Auto-generated</span></div>
            <div><span className="text-gray-500">Naming:</span> <span className="text-gray-800">grp-{rule.app_id}-NH-SZ-subtype</span></div>
            <div><span className="text-gray-500">Service:</span> <span className="font-mono text-gray-800">{rule.rule_service || 'Same'}</span></div>
            <div><span className="text-gray-500">Compliance:</span> <span className="text-green-700">Group-to-Group Enforced</span></div>
            <div><span className="text-gray-500">Policy:</span> <span className="text-green-700">NGDC Matrix Validated</span></div>
          </div>
        </div>
      </div>

      {!isStandard && (
        <div className="p-2 bg-amber-50 border border-amber-100 rounded-md mb-3">
          <p className="text-xs text-amber-700">
            <span className="font-semibold">Analysis:</span> This rule uses non-standard naming and requires migration to NGDC-compliant format. 
            Source entries will be mapped to appropriate neighbourhood groups with proper security zone classification.
          </p>
        </div>
      )}

      {rule.migration_status !== 'Completed' && (
        <div className="flex gap-2">
          {onAcceptMapping && (
            <button onClick={() => onAcceptMapping(rule.id)} className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-md hover:bg-green-700">
              Accept Mapping
            </button>
          )}
          {onCustomize && (
            <button onClick={() => onCustomize(rule.id)} className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100">
              Customize
            </button>
          )}
        </div>
      )}
    </div>
  );
}
