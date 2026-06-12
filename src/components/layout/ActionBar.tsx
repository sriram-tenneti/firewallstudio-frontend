import { Shield, ChevronDown, User } from 'lucide-react';

interface ActionBarProps {
  mode: 'design' | 'migration';
  title?: string;
}

export function ActionBar({ mode, title }: ActionBarProps) {
  return (
    <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-2.5">
      <div className="flex items-center gap-3">
        <Shield className="h-5 w-5 text-blue-600" />
        <h2 className="text-base font-bold text-slate-800">
          {title || (mode === 'design' ? 'Design Studio' : 'Migration Studio')}
        </h2>
        <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-600 border border-blue-200">
          {mode === 'design' ? 'Rule Management' : 'Legacy Migration'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-md bg-slate-50 px-3 py-1.5 text-sm text-slate-600 border border-slate-200">
          <User className="h-3.5 w-3.5 text-slate-400" />
          <span className="font-medium">Jon</span>
          <ChevronDown className="h-3 w-3 text-slate-400" />
        </div>
      </div>
    </div>
  );
}
