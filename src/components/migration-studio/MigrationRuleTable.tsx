import { Database, Shield, List, ArrowLeftRight } from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import type { MigrationRuleLifecycle } from '@/types';

interface MigrationRuleTableProps {
  rules: MigrationRuleLifecycle[];
  onValidate: () => void;
  onDryRun: () => void;
  onMigrate: () => void;
  onDelete: () => void;
}

export function MigrationRuleTable({ rules, onValidate, onDryRun, onMigrate, onDelete }: MigrationRuleTableProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h3 className="text-base font-bold text-slate-800">Rule Lifecycle Migration</h3>
        <span className="text-xs text-slate-500">1-1-{rules.length} of 1- {rules.length}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">Rule</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">Source</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">Mapping</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">NGDC Target</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id} className="border-b border-slate-50 hover:bg-blue-50/30 transition-colors">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <List className="h-3.5 w-3.5 text-slate-400" />
                    <span className="text-sm font-semibold text-slate-700">{rule.rule_id}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <Database className="h-3.5 w-3.5 text-orange-400" />
                    <span className="text-sm text-slate-700">{rule.source}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <StatusBadge status={rule.mapping_status} />
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5 text-teal-500" />
                    <span className="text-sm font-semibold text-slate-700">{rule.ngdc_target}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 bg-slate-50/50">
        <div className="flex items-center gap-1.5">
          <ArrowLeftRight className="h-4 w-4 text-slate-400" />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onValidate} className="rounded-lg border border-blue-300 bg-white px-4 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 transition-colors">
            Validate Migration
          </button>
          <button onClick={onDryRun} className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
            Dry Run Only Deploy
          </button>
          <button onClick={onMigrate} className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors">
            Migrate & Deploy
          </button>
          <button onClick={onDelete} className="rounded-lg border border-red-300 bg-white px-4 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
