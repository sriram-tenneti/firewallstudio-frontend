import { useState } from 'react';
import { Shield, Globe, ChevronDown } from 'lucide-react';
import type { DestinationConfig, PredefinedDestination } from '@/types';

interface DestinationPanelProps {
  destination: DestinationConfig;
  onChange: (dest: DestinationConfig) => void;
  predefinedDestinations: PredefinedDestination[];
}

const zoneColors: Record<string, string> = {
  CDE: 'bg-orange-100 text-orange-700 border-orange-300',
  GEN: 'bg-green-100 text-green-700 border-green-300',
  DMZ: 'bg-purple-100 text-purple-700 border-purple-300',
  RST: 'bg-red-100 text-red-700 border-red-300',
  MGT: 'bg-blue-100 text-blue-700 border-blue-300',
  EXT: 'bg-yellow-100 text-yellow-700 border-yellow-300',
};

export function DestinationPanel({ destination, onChange, predefinedDestinations }: DestinationPanelProps) {
  const [showCustom, setShowCustom] = useState(false);

  return (
    <div className="flex flex-col rounded-xl border-2 border-orange-200 bg-orange-50/50 shadow-sm">
      <div className="rounded-t-xl bg-gradient-to-r from-amber-600 to-orange-500 px-4 py-3">
        <h3 className="text-base font-bold text-white">Destination</h3>
      </div>

      <div className="space-y-4 p-4">
        {/* Predefined Destinations */}
        <div>
          <h4 className="mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Predefined Destinations</h4>
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {predefinedDestinations.map((pd) => {
              const zoneStyle = zoneColors[pd.security_zone] || 'bg-slate-100 text-slate-700 border-slate-300';
              return (
                <button
                  key={pd.name}
                  onClick={() =>
                    onChange({
                      name: pd.name,
                      security_zone: pd.security_zone,
                      dest_ip: destination.dest_ip,
                      ports: destination.ports,
                      is_predefined: true,
                    })
                  }
                  className={`flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm transition-all ${
                    destination.name === pd.name
                      ? 'bg-orange-100 border-2 border-orange-400 shadow-sm'
                      : 'bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <Shield className="h-4 w-4 flex-shrink-0 mt-0.5 text-slate-500" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-800 truncate">{pd.name}</div>
                    <div className="text-xs text-slate-500">{pd.description || 'Security Zone'}</div>
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${zoneStyle}`}>
                    {pd.security_zone}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Destination */}
        <div>
          <button
            onClick={() => setShowCustom(!showCustom)}
            className="flex w-full items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wide"
          >
            Custom Destination
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showCustom ? 'rotate-180' : ''}`} />
          </button>
          {showCustom && (
            <div className="mt-2 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Dest IP:</label>
                <div className="flex items-center gap-1">
                  <Globe className="h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={destination.dest_ip || ''}
                    onChange={(e) => onChange({ ...destination, dest_ip: e.target.value, is_predefined: false })}
                    placeholder="10.1.2.50"
                    className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Ports:</label>
                <select
                  value={destination.ports}
                  onChange={(e) => onChange({ ...destination, ports: e.target.value })}
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                >
                  <option>TCP 8443</option>
                  <option>TCP 443</option>
                  <option>TCP 1521</option>
                  <option>TCP 8080</option>
                  <option>TCP 22</option>
                  <option>TCP 3306</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
