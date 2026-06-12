import { useState } from 'react';
import { ChevronDown, ChevronUp, Globe, Server, Building } from 'lucide-react';
import type { NGDCDataCenter } from '@/types';

interface NGDCSidebarProps {
  datacenters: NGDCDataCenter[];
  selectedDC: string;
  onSelectDC: (code: string) => void;
}

export function NGDCSidebar({ datacenters, selectedDC, onSelectDC }: NGDCSidebarProps) {
  const [expandedDC, setExpandedDC] = useState(true);
  const [expandedNH, setExpandedNH] = useState(true);
  const [expandedIPs, setExpandedIPs] = useState(true);

  const currentDC = datacenters.find(dc => dc.code === selectedDC);

  return (
    <div className="w-72 flex-shrink-0 space-y-3">
      {/* NGDC Data Centers */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <button
          onClick={() => setExpandedDC(!expandedDC)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <h3 className="text-sm font-bold text-slate-800">NGDC Data Centers</h3>
          {expandedDC ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </button>
        {expandedDC && (
          <div className="space-y-1 px-3 pb-3">
            {datacenters.map((dc) => (
              <button
                key={dc.code}
                onClick={() => onSelectDC(dc.code)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  selectedDC === dc.code
                    ? 'bg-blue-100 border border-blue-300 text-blue-800 font-medium'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Building className="h-4 w-4 flex-shrink-0" />
                  <span>{dc.name}</span>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                  selectedDC === dc.code
                    ? 'bg-amber-400 text-amber-900'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {dc.rule_count}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Neighbourhoods */}
      {currentDC && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <button
            onClick={() => setExpandedNH(!expandedNH)}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <h3 className="text-sm font-bold text-slate-800">{currentDC.name} Neighborhoods</h3>
            {expandedNH ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
          </button>
          {expandedNH && (
            <div className="space-y-3 px-4 pb-4">
              {currentDC.neighbourhoods.map((nh) => (
                <div key={nh.name}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                    <span className="text-sm font-semibold text-slate-700">{nh.name}</span>
                  </div>
                  <div className="ml-4 space-y-0.5">
                    {nh.subnets.map((subnet) => (
                      <div key={subnet} className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Globe className="h-3 w-3 text-slate-400" />
                        {subnet}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* IPs / Groups */}
      {currentDC && currentDC.ip_groups.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <button
            onClick={() => setExpandedIPs(!expandedIPs)}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <h3 className="text-sm font-bold text-slate-800">{currentDC.name} IPs / Groups</h3>
            {expandedIPs ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
          </button>
          {expandedIPs && (
            <div className="space-y-3 px-4 pb-4">
              {currentDC.ip_groups.map((group) => (
                <div key={group.name}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="h-2 w-2 rounded-full bg-teal-500"></div>
                    <span className="text-sm font-semibold text-slate-700">{group.name}</span>
                  </div>
                  <div className="ml-4 space-y-0.5">
                    {group.entries.map((entry) => (
                      <div key={entry.name} className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Server className="h-3 w-3 text-slate-400" />
                        <span className="font-medium">{entry.name}</span>
                        <span>{entry.ip || entry.cidr}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
