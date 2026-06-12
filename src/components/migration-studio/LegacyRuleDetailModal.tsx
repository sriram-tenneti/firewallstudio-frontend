import { Modal } from '../shared/Modal';
import { StatusBadge } from '../shared/StatusBadge';
import { parseExpandedToDisplayLines } from '@/lib/nestingParser';
import type { LegacyRule } from '@/types';

interface LegacyRuleDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  rule: LegacyRule | null;
  onStartMigration?: () => void;
}

export function LegacyRuleDetailModal({ isOpen, onClose, rule, onStartMigration }: LegacyRuleDetailModalProps) {
  if (!rule) return null;

  const isNonStandard = !rule.is_standard;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Legacy Rule: ${rule.id}`} size="xl">
      {isNonStandard && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-2">
            <span className="text-amber-600 text-lg">!</span>
            <div>
              <h4 className="text-sm font-semibold text-amber-800">Non-Standard Rule Detected</h4>
              <p className="text-xs text-amber-700 mt-1">
                This rule does not conform to NGDC naming standards. Migration is recommended.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-3 mb-4">
        {([
          ['Rule ID', rule.id],
          ['App ID', String(rule.app_id)],
          ['App Distributed ID', rule.app_distributed_id],
          ['App Name', rule.app_name],
          ['Inventory Item', rule.inventory_item],
          ['Policy Name', rule.policy_name],
          ['Rule Global', rule.rule_global ? 'Yes' : 'No'],
          ['Rule Action', rule.rule_action],
          ['Source Zone', rule.rule_source_zone],
          ['Destination Zone', rule.rule_destination_zone],
          ['Service', rule.rule_service],
          ['RN', String(rule.rn)],
          ['RC', String(rule.rc)],
          ['Standard', rule.is_standard ? 'Yes' : 'No'],
        ] as [string, string][]).map(([label, val]) => (
          <div key={label} className="p-2 bg-gray-50 rounded">
            <span className="text-xs text-gray-500">{label}</span>
            <p className="text-sm font-medium text-gray-800 break-all">{val}</p>
          </div>
        ))}
        <div className="p-2 bg-gray-50 rounded">
          <span className="text-xs text-gray-500">Migration Status</span>
          <div className="mt-0.5"><StatusBadge status={rule.migration_status} /></div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="border rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-blue-50 border-b">
            <h3 className="text-sm font-semibold text-blue-800">Source (Expanded IPs/Groups)</h3>
          </div>
          <div className="p-3 bg-gray-900 max-h-60 overflow-y-auto">
            {parseExpandedToDisplayLines(rule.rule_source || '', rule.rule_source_expanded || '').map((item, i) => (
              <div key={i} className="font-mono text-xs text-green-400 flex items-center gap-1" style={{ paddingLeft: `${item.indent * 16}px` }}>
                {item.type === 'group' && <span className="text-[9px] bg-green-700 text-white px-1 rounded">GRP</span>}
                {item.text}
              </div>
            ))}
          </div>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-purple-50 border-b">
            <h3 className="text-sm font-semibold text-purple-800">Destination (Expanded IPs/Groups)</h3>
          </div>
          <div className="p-3 bg-gray-900 max-h-60 overflow-y-auto">
            {parseExpandedToDisplayLines(rule.rule_destination || '', rule.rule_destination_expanded || '').map((item, i) => (
              <div key={i} className="font-mono text-xs text-purple-400 flex items-center gap-1" style={{ paddingLeft: `${item.indent * 16}px` }}>
                {item.type === 'group' && <span className="text-[9px] bg-purple-700 text-white px-1 rounded">GRP</span>}
                {item.text}
              </div>
            ))}
          </div>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-amber-50 border-b">
            <h3 className="text-sm font-semibold text-amber-800">Service (Expanded)</h3>
          </div>
          <div className="p-3 bg-gray-900">
            {(rule.rule_service_expanded || '').split('\n').map((line, i) => (
              <div key={i} className="font-mono text-xs text-amber-400">{line}</div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
        {onStartMigration && rule.migration_status !== 'Completed' && (
          <button onClick={onStartMigration} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">
            {rule.migration_status === 'Not Started' ? 'Start Migration' : 'Continue Migration'}
          </button>
        )}
        <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Close</button>
      </div>
    </Modal>
  );
}
