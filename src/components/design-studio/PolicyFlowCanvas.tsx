import { CheckCircle, XCircle, AlertTriangle, ArrowRight, Server, Shield, Database } from 'lucide-react';
import type { SourceConfig, DestinationConfig, PolicyValidationResult } from '@/types';

interface PolicyFlowCanvasProps {
  source: SourceConfig;
  destination: DestinationConfig;
  policyResult: PolicyValidationResult | null;
  onValidate: () => void;
  onDrop: (dest: { name: string; security_zone: string }) => void;
}

const resultStyles: Record<string, { bg: string; border: string; text: string; icon: React.ReactNode }> = {
  Permitted: {
    bg: 'bg-emerald-500',
    border: 'border-emerald-400',
    text: 'text-white',
    icon: <CheckCircle className="h-6 w-6" />,
  },
  Blocked: {
    bg: 'bg-red-500',
    border: 'border-red-400',
    text: 'text-white',
    icon: <XCircle className="h-6 w-6" />,
  },
  'Exception Required': {
    bg: 'bg-amber-500',
    border: 'border-amber-400',
    text: 'text-white',
    icon: <AlertTriangle className="h-6 w-6" />,
  },
};

export function PolicyFlowCanvas({ source, destination, policyResult, onValidate, onDrop }: PolicyFlowCanvasProps) {
  const result = policyResult?.result || 'Permitted';
  const style = resultStyles[result] || resultStyles['Permitted'];

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add('ring-4', 'ring-blue-400', 'ring-opacity-50');
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('ring-4', 'ring-blue-400', 'ring-opacity-50');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove('ring-4', 'ring-blue-400', 'ring-opacity-50');
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      onDrop(data);
    } catch {
      // ignore invalid drops
    }
  };

  const sourceDisplay = source.source_type === 'Single IP'
    ? source.ip_address || '0.0.0.0'
    : source.source_type === 'Subnet'
    ? source.cidr || '0.0.0.0/0'
    : source.group_name || 'No Group';

  return (
    <div className="flex-1 rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-4">
      {/* Top breadcrumb tabs */}
      <div className="mb-4 flex items-center gap-2">
        {source.neighbourhood && (
          <span className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 border border-slate-200">
            <Database className="h-3 w-3" />
            {source.neighbourhood.split(' - ')[0]}
          </span>
        )}
        {source.neighbourhood && (
          <span className="flex items-center gap-1 rounded-full bg-orange-100 px-3 py-1 text-xs font-medium text-orange-700 border border-orange-200">
            {source.neighbourhood}
          </span>
        )}
        {destination.name && (
          <span className="flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700 border border-green-200">
            <Shield className="h-3 w-3" />
            {destination.security_zone || 'GEN'}
          </span>
        )}
      </div>

      <h3 className="mb-4 text-center text-sm font-semibold text-slate-500 uppercase tracking-wide">
        Policy Configuration
      </h3>

      {/* Flow Diagram */}
      <div className="flex items-center justify-center gap-4 py-6">
        {/* Source Box */}
        <div className="rounded-lg border-2 border-blue-300 bg-blue-50 p-4 shadow-sm min-w-48">
          <div className="flex items-center gap-2 text-blue-700">
            <ArrowRight className="h-4 w-4 text-orange-500" />
            <span className="text-xs font-semibold">Source:</span>
          </div>
          <div className="mt-1 text-sm font-bold text-slate-800">{sourceDisplay}</div>
          <div className="mt-1 text-xs text-slate-500">
            <span className="font-medium">Ports:</span> {source.ports}
          </div>
          {source.neighbourhood && (
            <div className="mt-1 text-xs text-slate-400">{source.neighbourhood}</div>
          )}
          {source.security_zone && (
            <div className="mt-0.5 text-xs text-slate-400">Security Zone: {source.security_zone}</div>
          )}
        </div>

        {/* Arrow */}
        <ArrowRight className="h-8 w-8 text-slate-300 flex-shrink-0" />

        {/* Policy Check */}
        <button
          onClick={onValidate}
          className={`flex flex-col items-center gap-2 rounded-xl ${style.bg} ${style.text} px-6 py-4 shadow-lg transition-transform hover:scale-105 cursor-pointer`}
        >
          {style.icon}
          <span className="text-xs font-bold uppercase tracking-wide">
            {policyResult ? result.toUpperCase() : 'VALIDATE'}
          </span>
          <span className="text-xs opacity-80">
            {policyResult ? 'BY POLICY' : 'Click to check'}
          </span>
        </button>

        {/* Arrow */}
        <ArrowRight className="h-8 w-8 text-slate-300 flex-shrink-0" />

        {/* Destination Box */}
        <div className="rounded-lg border-2 border-orange-300 bg-orange-50 p-4 shadow-sm min-w-48">
          <div className="flex items-center gap-2 text-orange-700">
            <Shield className="h-4 w-4" />
            <span className="font-bold">{destination.name || 'Drop Here'}</span>
          </div>
          {destination.security_zone && (
            <div className="mt-1">
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${
                destination.security_zone === 'CDE' ? 'bg-orange-200 text-orange-800' :
                destination.security_zone === 'GEN' ? 'bg-green-200 text-green-800' :
                'bg-slate-200 text-slate-700'
              }`}>
                {destination.security_zone}
              </span>
            </div>
          )}
          {destination.dest_ip && (
            <div className="mt-1 text-xs text-slate-500">
              <span className="font-medium">Dest IP:</span> {destination.dest_ip}
            </div>
          )}
          <div className="mt-0.5 text-xs text-slate-500">
            <span className="font-medium">Ports:</span> {destination.ports}
          </div>
        </div>
      </div>

      {/* Drag & Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="mx-auto mt-4 max-w-lg rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 p-6 text-center transition-all"
      >
        <h4 className="text-sm font-semibold text-slate-500">Drag & Drop Destination</h4>
        <p className="mt-1 text-xs text-slate-400">
          Drag a predefined destination from the right panel here
        </p>
        {destination.name && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-teal-300 bg-teal-50 px-4 py-2">
            <Server className="h-4 w-4 text-teal-600" />
            <span className="text-sm font-medium text-teal-800">{destination.name}</span>
            <span className="rounded bg-teal-200 px-1.5 py-0.5 text-xs font-bold text-teal-700">
              {destination.security_zone}
            </span>
          </div>
        )}
      </div>

      {/* Policy Result */}
      {policyResult && (
        <div className={`mt-4 flex items-center gap-2 rounded-lg px-4 py-3 ${
          result === 'Permitted' ? 'bg-emerald-50 border border-emerald-200' :
          result === 'Blocked' ? 'bg-red-50 border border-red-200' :
          'bg-amber-50 border border-amber-200'
        }`}>
          {result === 'Permitted' ? (
            <CheckCircle className="h-5 w-5 text-emerald-600" />
          ) : result === 'Blocked' ? (
            <XCircle className="h-5 w-5 text-red-600" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-amber-600" />
          )}
          <div>
            <span className={`text-sm font-bold ${
              result === 'Permitted' ? 'text-emerald-700' :
              result === 'Blocked' ? 'text-red-700' : 'text-amber-700'
            }`}>
              Policy Result: {result}
            </span>
            <span className="ml-2 text-sm text-slate-600">{policyResult.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
