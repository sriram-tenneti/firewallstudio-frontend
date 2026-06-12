import { CheckCircle, AlertTriangle, XCircle, Ban, MessageSquare } from 'lucide-react';

interface MigrationRule {
  source: string;
  destination: string;
  status: 'Automapped' | 'Needs Review' | 'Blocked';
  details?: string;
}

interface MigrationFirewallPlannerProps {
  applicationId: string;
  dcScope: string;
  rules: MigrationRule[];
  onValidate: () => void;
  onDryRun: () => void;
  onMigrateGenerate: () => void;
  onSubmit: () => void;
  chgNumber?: string;
}

const statusConfig = {
  'Automapped': { bg: 'bg-emerald-100 text-emerald-700 border-emerald-300', icon: <CheckCircle className="h-3.5 w-3.5" /> },
  'Needs Review': { bg: 'bg-amber-100 text-amber-700 border-amber-300', icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  'Blocked': { bg: 'bg-red-100 text-red-700 border-red-300', icon: <XCircle className="h-3.5 w-3.5" /> },
};

export function MigrationFirewallPlanner({
  rules,
  onValidate,
  onDryRun,
  onMigrateGenerate,
  onSubmit,
  chgNumber,
}: MigrationFirewallPlannerProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="text-base font-bold text-slate-800">Firewall Migration Planner</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">Source</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">Destination</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule, idx) => {
              const config = statusConfig[rule.status];
              return (
                <tr key={idx} className="border-b border-slate-50 hover:bg-blue-50/30 transition-colors">
                  <td className="px-4 py-3 text-sm text-slate-700">{rule.source}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{rule.destination}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${config.bg}`}>
                      {config.icon}
                      {rule.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3 border-t border-slate-200 px-4 py-3 bg-slate-50/50">
        <button onClick={onValidate} className="rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 transition-colors">
          Validate
        </button>
        <button onClick={onDryRun} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
          Dry Run
        </button>
        <button onClick={onMigrateGenerate} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
          Migrate & Generate Rules
        </button>
        <button onClick={onSubmit} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm">
          Submit Migration
        </button>
      </div>

      {/* ServiceNow Status */}
      {chgNumber && (
        <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-2">
          <MessageSquare className="h-4 w-4 text-slate-400" />
          <span className="text-sm text-slate-600">ServiceNow: <strong>{chgNumber}</strong> created</span>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 border-t border-slate-100 px-4 py-3">
        <div className="flex items-center gap-1.5">
          <CheckCircle className="h-4 w-4 text-emerald-500" />
          <span className="text-xs text-slate-600">Permitted</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Ban className="h-4 w-4 text-amber-500" />
          <span className="text-xs text-slate-600">Blocked</span>
        </div>
        <div className="flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <span className="text-xs text-slate-600">Exception Required</span>
        </div>
      </div>
    </div>
  );
}
