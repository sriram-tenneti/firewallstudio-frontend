import { useState } from 'react';
import type { MigrationDetails } from '@/types';

interface MigrationDetailsFormProps {
  applications: string[];
  legacyDCs: { name: string; code: string }[];
  ngdcDCs: { name: string; code: string }[];
  onSubmit: (data: {
    application: string;
    source_legacy_dc: string;
    target_ngdc: string;
    map_to_standard_groups: boolean;
    map_to_subnet_cidr: boolean;
  }) => void;
  existingMigration?: MigrationDetails | null;
}

export function MigrationDetailsForm({ applications, legacyDCs, ngdcDCs, onSubmit, existingMigration }: MigrationDetailsFormProps) {
  const [application, setApplication] = useState(existingMigration?.application || applications[0] || '');
  const [sourceDC, setSourceDC] = useState(existingMigration?.source_legacy_dc || legacyDCs[0]?.code || '');
  const [targetNGDC, setTargetNGDC] = useState(existingMigration?.target_ngdc || ngdcDCs[0]?.code || '');
  const [mapToStandard, setMapToStandard] = useState(existingMigration?.map_to_standard_groups ?? true);
  const [mapToCIDR, setMapToCIDR] = useState(existingMigration?.map_to_subnet_cidr ?? false);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-3">
        <h3 className="text-base font-bold text-slate-800">Migration Details</h3>
      </div>
      <div className="space-y-4 p-5">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Application:</label>
          <select
            value={application}
            onChange={(e) => setApplication(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            {applications.map((app) => (
              <option key={app} value={app}>{app}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Source Legacy DC:</label>
          <select
            value={sourceDC}
            onChange={(e) => setSourceDC(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            {legacyDCs.map((dc) => (
              <option key={dc.code} value={dc.code}>{dc.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Target NGDC:</label>
          <select
            value={targetNGDC}
            onChange={(e) => setTargetNGDC(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            {ngdcDCs.map((dc) => (
              <option key={dc.code} value={dc.code}>{dc.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Migration Options:</label>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={mapToStandard}
                onChange={(e) => setMapToStandard(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-700">Map to standard group names.</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={mapToCIDR}
                onChange={(e) => setMapToCIDR(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-700">Map to subnet IP ranges (CIDR)</span>
            </label>
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Migration Mode:</label>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="migrationMode" defaultChecked className="h-4 w-4 border-slate-300 text-blue-600" />
              <span className="text-sm text-slate-700">Map to standard group names.</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="migrationMode" className="h-4 w-4 border-slate-300 text-blue-600" />
              <span className="text-sm text-slate-700">Map to subnet IP ranges (CIDR)</span>
            </label>
          </div>
        </div>

        <button
          onClick={() => onSubmit({ application, source_legacy_dc: sourceDC, target_ngdc: targetNGDC, map_to_standard_groups: mapToStandard, map_to_subnet_cidr: mapToCIDR })}
          className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm"
        >
          {existingMigration ? 'Update Migration' : 'Start Migration'}
        </button>
      </div>
    </div>
  );
}
