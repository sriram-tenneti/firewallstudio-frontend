import { useState, useCallback, useEffect } from 'react';
import { importLegacyRulesExcel, importLegacyRulesJSON, exportLegacyRulesToExcel, importNGDCMappingsExcel, getNGDCMappings, deleteNGDCMapping, createNGDCMapping, importRulesToNGDC, getImportedApps, createAppDCMapping, deleteAppDCMapping, getLegacyRules, clearAllLegacyRules, isHideSeedEnabled } from '@/lib/api';
import { autoCreateLegacyGroupsFromRules } from '@/lib/legacyGroupAutoCreate';
import type { FirewallRule, LegacyRule } from '@/types';

interface ImportedApp {
  app_id: string;
  app_name: string;
  app_distributed_id: string;
  rule_count: number;
  has_mapping: boolean;
  components: Record<string, unknown>[];
}

interface NewComponentForm {
  component: string;
  dc: string;
  nh: string;
  sz: string;
  cidr: string;
  notes: string;
}

interface DataImportPageProps {
  context?: string;
}

export default function DataImportPage({ context }: DataImportPageProps) {
  const [file, setFile] = useState<File | null>(null);
  const [selectedEnv, setSelectedEnv] = useState<string>('Production');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');
  const [mappings, setMappings] = useState<Record<string, unknown>[]>([]);
  const [showMappings, setShowMappings] = useState(false);
  const [newMapping, setNewMapping] = useState({ legacy_name: '', legacy_dc: '', ngdc_name: '', ngdc_dc: '', ngdc_nh: '', ngdc_sz: '', type: 'group' });

  // Imported apps mapping state
  const [, setImportedApps] = useState<ImportedApp[]>([]);
  const [, setShowAppMappings] = useState(false);
  const [, _setExpandedAppId] = useState<string | null>(null);
  void _setExpandedAppId;
  const [, setAddingComponentForApp] = useState<string | null>(null);
  const [newComponentForm, setNewComponentForm] = useState<NewComponentForm>({
    component: 'APP', dc: 'ALPHA_NGDC', nh: '', sz: '', cidr: '', notes: ''
  });
  const [, setSavingComponent] = useState(false);
  const [, _setAppFilter] = useState<'all' | 'unmapped' | 'mapped'>('all');
  void _setAppFilter;

  // Imported legacy rules display state
  const [importedRules, setImportedRules] = useState<LegacyRule[]>([]);
  const [showImportedRules, setShowImportedRules] = useState(false);
  const [rulesAppFilter, setRulesAppFilter] = useState<string>('');
  const [rulesSearchQuery, setRulesSearchQuery] = useState<string>('');
  const [clearing, setClearing] = useState(false);
  const [autoGroupResult, setAutoGroupResult] = useState<{ groupsCreated: number; nestedGroupsCreated: number; membersAdded: number } | null>(null);

  // NFR import state (for ngdc-import-rules context)
  const [nfrRules, setNfrRules] = useState<FirewallRule[]>([]);
  const [nfrApps, setNfrApps] = useState<{ value: string; label: string }[]>([]);
  const [selectedImportApps, setSelectedImportApps] = useState<Set<string>>(new Set());
  const [importingFromNFR, setImportingFromNFR] = useState(false);
  const [nfrLoading, setNfrLoading] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; apps: number } | null>(null);

  const [nfrEnvFilter, setNfrEnvFilter] = useState<string>('');
  const isNGDCMappings = context === 'ngdc-mappings';
  const isNFRImport = context === 'ngdc-import-rules';
  const pageTitle = isNGDCMappings ? 'NGDC Organization Mappings' :
    isNFRImport ? 'Import Rules from Network Firewall Request' :
    context === 'ngdc-standardization' ? 'Import Legacy Rules for Migration' :
    context === 'firewall-management' ? 'Import Firewall Rules' :
    context === 'firewall-studio' ? 'Import Rules for Firewall Studio' :
    'Data Import';

  // Load legacy imported apps when this is the NFR import page (reads from Firewall Management legacy_rules)
  const loadNFRApps = useCallback(async () => {
    setNfrLoading(true);
    try {
      const legacyRules = await getLegacyRules();
      // Map legacy rules to FirewallRule shape for display compatibility
      const mapped = legacyRules.map((r: LegacyRule) => ({
        ...r,
        rule_id: r.id || '',
        application: String(r.app_id || ''),
        application_name: r.app_name || String(r.app_id || ''),
        source: r.rule_source || '',
        destination: r.rule_destination || '',
        port: (r.rule_service || '').split('/')[0] || '',
        protocol: (r.rule_service || '').split('/')[1] || 'tcp',
        action: r.rule_action || 'Accept',
        status: r.migration_status || 'Not Started',
        environment: 'Production',
      })) as unknown as FirewallRule[];
      setNfrRules(mapped);
      const apps = Array.from(new Set(legacyRules.map((r: LegacyRule) => `${r.app_distributed_id || r.app_id}|${r.app_name || r.app_id}`))).map(key => {
        const [distId, appName] = (key as string).split('|');
        return { value: distId, label: `${distId} - ${appName}` };
      });
      setNfrApps(apps);
    } catch { setNfrApps([]); }
    setNfrLoading(false);
  }, [nfrEnvFilter]);

  useEffect(() => {
    if (isNFRImport) { setSelectedImportApps(new Set()); loadNFRApps(); }
  }, [isNFRImport, loadNFRApps]);

  const toggleImportApp = (appId: string) => {
    setSelectedImportApps(prev => {
      const next = new Set(prev);
      if (next.has(appId)) next.delete(appId); else next.add(appId);
      return next;
    });
  };

  const selectAllImportApps = () => {
    if (selectedImportApps.size === nfrApps.length) setSelectedImportApps(new Set());
    else setSelectedImportApps(new Set(nfrApps.map(a => a.value)));
  };

  const handleImportFromNFR = async () => {
    if (selectedImportApps.size === 0) return;
    setImportingFromNFR(true);
    setError('');
    setImportResult(null);
    try {
      const selectedAppIds = Array.from(selectedImportApps);
      const res = await importRulesToNGDC(selectedAppIds);
      setImportResult({ imported: res.imported, apps: selectedImportApps.size });
      setSelectedImportApps(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import rules from Network Request');
    }
    setImportingFromNFR(false);
  };

  const loadMappings = useCallback(async () => {
    try {
      const data = await getNGDCMappings();
      setMappings(data);
      setShowMappings(true);
    } catch { setError('Failed to load mappings'); }
  }, []);

  const loadImportedApps = useCallback(async () => {
    try {
      const apps = await getImportedApps();
      setImportedApps(apps);
      setShowAppMappings(true);
    } catch { /* ignore */ }
  }, []);

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setError('');
    setResult(null);
    try {
      const isJSON = file.name.endsWith('.json');
      const res = isNGDCMappings
        ? await importNGDCMappingsExcel(file)
        : isJSON
        ? await importLegacyRulesJSON(file)
        : await importLegacyRulesExcel(file, selectedEnv || undefined);
      setResult(res);
      if (isNGDCMappings) loadMappings();
      // After legacy import, load imported apps for mapping and load rules
      if (!isNGDCMappings) {
        loadImportedApps();
        loadImportedRules();
        // Auto-create Legacy Groups from imported rules (with members & nesting)
        try {
          const importedRulesForGroups = await getLegacyRules();
          const groupResult = await autoCreateLegacyGroupsFromRules(importedRulesForGroups);
          if (groupResult.groupsCreated > 0 || groupResult.nestedGroupsCreated > 0) {
            setAutoGroupResult({
              groupsCreated: groupResult.groupsCreated,
              nestedGroupsCreated: groupResult.nestedGroupsCreated,
              membersAdded: groupResult.membersAdded,
            });
          }
        } catch { /* Auto-group creation is best-effort */ }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const _handleAddComponent = async (appId: string) => {
    setSavingComponent(true);
    try {
      await createAppDCMapping({
        app_id: appId,
        component: newComponentForm.component,
        dc: newComponentForm.dc,
        nh: newComponentForm.nh,
        sz: newComponentForm.sz,
        cidr: newComponentForm.cidr,
        notes: newComponentForm.notes,
        status: 'Active',
      });
      setAddingComponentForApp(null);
      setNewComponentForm({ component: 'APP', dc: 'ALPHA_NGDC', nh: '', sz: '', cidr: '', notes: '' });
      await loadImportedApps();
    } catch {
      setError('Failed to add component mapping');
    } finally {
      setSavingComponent(false);
    }
  };
  void _handleAddComponent;

  const _handleDeleteComponent = async (mappingId: string) => {
    try {
      await deleteAppDCMapping(mappingId);
      await loadImportedApps();
    } catch {
      setError('Failed to delete component mapping');
    }
  };
  void _handleDeleteComponent;

  const loadImportedRules = useCallback(async () => {
    try {
      const rules = await getLegacyRules();
      setImportedRules(rules);
      setShowImportedRules(true);
    } catch { /* ignore */ }
  }, []);

  // Dynamically compute all column keys from imported rules (preserves all Excel columns)
  const importedRuleColumns = (() => {
    const skip = new Set(['id', 'is_standard', 'imported_at', 'environment']);
    const allKeys = new Set<string>();
    for (const r of importedRules) {
      for (const k of Object.keys(r)) {
        if (!skip.has(k)) allKeys.add(k);
      }
    }
    // Put known columns first in preferred order, then any extras
    const preferred = ['app_id', 'app_distributed_id', 'app_name', 'inventory_item', 'policy_name', 'rule_global', 'rule_action', 'rule_source', 'rule_source_expanded', 'rule_source_zone', 'rule_destination', 'rule_destination_expanded', 'rule_destination_zone', 'rule_service', 'rule_service_expanded', 'rn', 'rc', 'migration_status'];
    const ordered: string[] = [];
    for (const k of preferred) { if (allKeys.has(k)) { ordered.push(k); allKeys.delete(k); } }
    for (const k of Array.from(allKeys).sort()) { ordered.push(k); }
    return ordered;
  })();

  const exportImportedRulesToCSV = () => {
    const filtered = getFilteredImportedRules();
    if (filtered.length === 0) return;
    // Use dynamic columns from the actual data
    const headers = importedRuleColumns.map(k => k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
    const rows = filtered.map(r => importedRuleColumns.map(k => String((r as unknown as Record<string, unknown>)[k] ?? '')));
    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `imported-legacy-rules-${rulesAppFilter || 'all'}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getFilteredImportedRules = () => {
    let filtered = importedRules;
    if (rulesAppFilter) filtered = filtered.filter(r => (r.app_distributed_id || String(r.app_id)) === rulesAppFilter);
    if (rulesSearchQuery.trim()) {
      const q = rulesSearchQuery.toLowerCase();
      filtered = filtered.filter(r => {
        // Search across ALL columns dynamically
        const rec = r as unknown as Record<string, unknown>;
        return Object.values(rec).some(v => v != null && String(v).toLowerCase().includes(q));
      });
    }
    return filtered;
  };

  const handleClearAllRules = async () => {
    if (!confirm('This will delete all non-migrated legacy rules. Rules already migrated or in-progress will be preserved. App DC mappings will NOT be affected. Continue?')) return;
    setClearing(true);
    try {
      const res = await clearAllLegacyRules();
      setImportedRules([]);
      setShowImportedRules(false);
      setResult(null);
      setError('');
      alert(`Cleared ${res.deleted} rules. You can now import fresh data.`);
    } catch {
      setError('Failed to clear rules');
    } finally {
      setClearing(false);
    }
  };

  const handleDeleteMapping = async (id: string) => {
    try {
      await deleteNGDCMapping(id);
      setMappings(prev => prev.filter(m => (m as Record<string, unknown>).id !== id));
    } catch { setError('Failed to delete mapping'); }
  };

  const handleAddMapping = async () => {
    try {
      const created = await createNGDCMapping(newMapping);
      setMappings(prev => [...prev, created]);
      setNewMapping({ legacy_name: '', legacy_dc: '', ngdc_name: '', ngdc_dc: '', ngdc_nh: '', ngdc_sz: '', type: 'group' });
    } catch { setError('Failed to add mapping'); }
  };

  return (
    <div className="max-w-[1800px] mx-auto p-6">
      {isHideSeedEnabled() && (
        <div className="mb-4 px-4 py-2 bg-indigo-50 border border-indigo-200 rounded-lg flex items-center gap-2">
          <span className="text-xs font-semibold text-indigo-700">REAL DATA MODE</span>
          <span className="text-xs text-indigo-500">Seed/test data is hidden. Showing only real imported data. Change in Settings &gt; Data Management.</span>
        </div>
      )}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{pageTitle}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isNGDCMappings
              ? 'Manage organization-provided legacy-to-NGDC name mappings used during migration'
              : isNFRImport
              ? 'Select applications to import their Network Firewall Request rules for NGDC migration'
              : 'Upload Excel (.xlsx) files to import rules into the system'}
          </p>
        </div>
        {isNFRImport ? (
          <select className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 bg-white"
            value={nfrEnvFilter} onChange={e => setNfrEnvFilter(e.target.value)}>
            <option value="">All Environments</option>
            <option value="Production">Production</option>
            <option value="Non-Production">Non-Production</option>
            <option value="Pre-Production">Pre-Production</option>
          </select>
        ) : (
          <select className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 bg-white"
            value={selectedEnv} onChange={e => setSelectedEnv(e.target.value)}>
            <option value="Production">Production</option>
            <option value="Non-Production">Non-Production</option>
            <option value="Pre-Production">Pre-Production</option>
          </select>
        )}
      </div>

      {/* NFR Import Section - App Dropdown */}
      {isNFRImport && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-5">
            <p className="text-sm text-indigo-700">Select one or more applications to import their Network Firewall Request rules for NGDC migration. These rules will be copied and available for one-to-one DC mapping in Migration Studio.</p>
          </div>

          {nfrLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Loading applications from Network Firewall Request...</p>
            </div>
          ) : nfrApps.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-gray-500">No applications found in Network Firewall Request.</p>
              <button onClick={loadNFRApps} className="mt-3 px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100">
                Retry
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-gray-700">{nfrApps.length} Applications Available</span>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer">
                    <input type="checkbox" checked={selectedImportApps.size === nfrApps.length && nfrApps.length > 0} onChange={selectAllImportApps} className="rounded border-gray-300 text-indigo-600" />
                    Select All
                  </label>
                  <button onClick={loadNFRApps} className="text-xs text-indigo-600 hover:text-indigo-800">Refresh</button>
                </div>
              </div>
              <div className="max-h-80 overflow-y-auto border rounded-lg divide-y divide-gray-100">
                {nfrApps.map(app => (
                  <label key={app.value} className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-indigo-50 transition-colors ${selectedImportApps.has(app.value) ? 'bg-indigo-50' : ''}`}>
                    <input type="checkbox" checked={selectedImportApps.has(app.value)} onChange={() => toggleImportApp(app.value)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                    <span className="text-sm text-gray-800 font-medium">{app.label}</span>
                    <span className="text-xs text-gray-400 ml-auto">{nfrRules.filter(r => r.application === app.value && (!nfrEnvFilter || r.environment === nfrEnvFilter)).length} rules</span>
                  </label>
                ))}
              </div>

              {selectedImportApps.size > 0 && (
                <div className="mt-4 bg-gray-50 rounded-lg p-4 flex items-center justify-between">
                  <span className="text-sm text-gray-600">
                    <strong>{selectedImportApps.size}</strong> app(s) selected &middot; <strong>{nfrRules.filter(r => selectedImportApps.has(r.application) && (!nfrEnvFilter || r.environment === nfrEnvFilter)).length}</strong> rules will be imported for migration
                  </span>
                  <button onClick={handleImportFromNFR} disabled={importingFromNFR}
                    className="px-6 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 shadow-sm transition-colors">
                    {importingFromNFR ? 'Importing...' : `Import ${selectedImportApps.size} App(s)`}
                  </button>
                </div>
              )}
            </>
          )}

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}
          {importResult && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <h3 className="text-sm font-semibold text-green-800 mb-1">Import Successful</h3>
              <p className="text-sm text-green-700">
                <strong>{importResult.imported}</strong> rules imported from <strong>{importResult.apps}</strong> app(s) for NGDC migration. Go to <strong>Migration Studio</strong> to map and migrate these rules.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Excel Import Section (for non-NFR contexts) */}
      {!isNFRImport && <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">
          {isNGDCMappings ? 'Import Mappings from Excel' : 'Import from Excel / JSON'}
        </h2>
        <div className="flex items-center gap-4">
          <label className="flex-1">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-all">
              <input
                type="file"
                accept={isNGDCMappings ? '.xlsx' : '.xlsx,.xls,.csv,.json'}
                className="hidden"
                onChange={e => setFile(e.target.files?.[0] || null)}
              />
              <svg className="w-10 h-10 mx-auto text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <p className="text-sm text-gray-600">{file ? file.name : isNGDCMappings ? 'Click to select .xlsx file' : 'Click to select .xlsx, .xls, .csv, or .json file'}</p>
              <p className="text-xs text-gray-400 mt-1">If your .xlsx file has IRM/DRM protection, save it as CSV first</p>
            </div>
          </label>
          <button
            onClick={handleImport}
            disabled={!file || importing}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {importing ? 'Importing...' : 'Import'}
          </button>
          <button
            onClick={handleClearAllRules}
            disabled={clearing}
            className="px-4 py-3 bg-red-50 text-red-600 rounded-lg font-medium hover:bg-red-100 border border-red-200 disabled:opacity-50 transition-colors text-sm"
            title="Delete all imported rules and start fresh"
          >
            {clearing ? 'Clearing...' : 'Clear All & Re-import'}
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}
        {result && (
          <div className={`mt-4 p-4 rounded-lg border ${Number(result.added || result.imported || 0) > 0 ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
            <h3 className={`text-sm font-semibold mb-2 ${Number(result.added || result.imported || 0) > 0 ? 'text-green-800' : 'text-amber-800'}`}>
              {Number(result.added || result.imported || 0) > 0 ? 'Import Successful' : 'No New Rules Imported'}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-white rounded p-2"><span className="text-gray-500">New Rules Added:</span> <span className="font-bold text-green-700">{String(result.added ?? result.imported ?? 0)}</span></div>
              <div className="bg-white rounded p-2"><span className="text-gray-500">Duplicates Skipped:</span> <span className="font-bold text-amber-700">{String(result.duplicates ?? result.duplicates_skipped ?? 0)}</span></div>
              <div className="bg-white rounded p-2"><span className="text-gray-500">Total in DB:</span> <span className="font-bold">{String(result.total ?? result.total_rules ?? '—')}</span></div>
              <div className="bg-white rounded p-2"><span className="text-gray-500">Rows in File:</span> <span className="font-bold text-blue-700">{String(result.parsed_rows ?? result.total_file_rows ?? '—')}</span></div>
            </div>
            {/* Header diagnostics */}
            {!!result.headers_found && (
              <details className="mt-3 text-xs">
                <summary className="cursor-pointer text-gray-500 hover:text-gray-700">Column diagnostics ({String((result.headers_found as string[])?.length || 0)} columns found)</summary>
                <div className="mt-2 space-y-1">
                  {(result.mapped_headers as string[])?.length > 0 && (
                    <div><span className="text-green-600 font-medium">Mapped:</span> {(result.mapped_headers as string[]).join(', ')}</div>
                  )}
                  {(result.unmapped_headers as string[])?.length > 0 && (
                    <div><span className="text-blue-600 font-medium">Extra columns (preserved):</span> {(result.unmapped_headers as string[]).join(', ')}</div>
                  )}
                </div>
              </details>
            )}
            {Number(result.added || result.imported || 0) === 0 && Number(result.parsed_rows || 0) === 0 && (
              <p className="text-xs text-red-600 mt-2 font-medium">The file could not be read. If it has IRM/DRM protection, open it in Excel and Save As CSV (.csv), then re-import.</p>
            )}
            {/* Auto-created Legacy Groups notification */}
            {autoGroupResult && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <h4 className="text-xs font-semibold text-amber-800 mb-1">Legacy Groups Auto-Created</h4>
                <p className="text-xs text-amber-700">
                  <strong>{autoGroupResult.groupsCreated}</strong> group(s) created
                  {autoGroupResult.nestedGroupsCreated > 0 && <>, <strong>{autoGroupResult.nestedGroupsCreated}</strong> nested sub-group(s)</>}
                  {autoGroupResult.membersAdded > 0 && <>, <strong>{autoGroupResult.membersAdded}</strong> member(s) associated</>}.
                  View them in <strong>Firewall Management &gt; Legacy Groups</strong>.
                </p>
              </div>
            )}
            {Number(result.added || result.imported || 0) === 0 && Number(result.parsed_rows || 0) > 0 && (
              <p className="text-xs text-amber-600 mt-2">All {String(result.parsed_rows)} rows were duplicates of existing rules. Use "Clear All &amp; Re-import" to start fresh.</p>
            )}
            {Number(result.added || result.imported || 0) > 0 && (
              <p className="text-xs text-green-600 mt-2">Source/destination groups have been expanded to show associated IPs, ranges, and subnets.</p>
            )}
          </div>
        )}
      </div>}

      {/* Imported Legacy Rules with Source/Destination Details */}
      {!isNGDCMappings && !isNFRImport && showImportedRules && importedRules.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">Imported Legacy Rules</h2>
              <p className="text-xs text-gray-500 mt-1">View source and destination details of imported rules. Use filters to narrow down, then export as CSV.</p>
            </div>
            <div className="flex items-center gap-3">
              <select className="px-2 py-1.5 text-xs border rounded-md" value={rulesAppFilter} onChange={e => setRulesAppFilter(e.target.value)}>
                <option value="">All Apps</option>
                {Array.from(new Set(importedRules.map(r => r.app_distributed_id || String(r.app_id)))).sort().map(distId => (
                  <option key={distId} value={distId}>{distId}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Search source, destination, service..."
                value={rulesSearchQuery}
                onChange={e => setRulesSearchQuery(e.target.value)}
                className="px-2 py-1.5 text-xs border rounded-md w-64"
              />
              <button onClick={exportImportedRulesToCSV} className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700">
                Export CSV
              </button>
              <button onClick={() => exportLegacyRulesToExcel(rulesAppFilter || undefined)} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
                Export Excel
              </button>
              <button onClick={() => setShowImportedRules(false)} className="px-3 py-2 text-xs text-gray-500 border rounded-md hover:bg-gray-50">
                Hide
              </button>
            </div>
          </div>

          <div className="text-xs text-gray-500 mb-2">
            Showing <strong className="text-gray-700">{getFilteredImportedRules().length}</strong> of <strong className="text-gray-700">{importedRules.length}</strong> rules
          </div>

          <div className="overflow-x-auto max-h-[500px] overflow-y-auto border rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-2 py-2 text-left font-medium text-gray-500 whitespace-nowrap">Rule ID</th>
                  {importedRuleColumns.map(col => (
                    <th key={col} className="px-2 py-2 text-left font-medium text-gray-500 whitespace-nowrap max-w-[200px]">
                      {col.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {getFilteredImportedRules().slice(0, 200).map(rule => (
                  <tr key={rule.id} className="hover:bg-gray-50">
                    <td className="px-2 py-1.5 font-mono text-gray-600">{rule.id}</td>
                    {importedRuleColumns.map(col => {
                      const val = String((rule as unknown as Record<string, unknown>)[col] ?? '');
                      if (col === 'rule_action') {
                        return <td key={col} className="px-2 py-1.5"><span className={`px-1.5 py-0.5 rounded font-medium ${val === 'Accept' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{val}</span></td>;
                      }
                      if (col === 'migration_status') {
                        return <td key={col} className="px-2 py-1.5"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${val === 'Completed' ? 'bg-green-100 text-green-700' : val === 'In Progress' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{val}</span></td>;
                      }
                      return <td key={col} className="px-2 py-1.5 max-w-[200px] truncate" title={val}>{val || <span className="text-gray-300 italic">—</span>}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {getFilteredImportedRules().length > 200 && (
              <div className="px-3 py-2 bg-amber-50 text-xs text-amber-700 text-center border-t">
                Showing first 200 of {getFilteredImportedRules().length} rules. Use filters to narrow down or export all as CSV.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Load Rules Button (if not auto-loaded) */}
      {!isNGDCMappings && !isNFRImport && !showImportedRules && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6 text-center">
          <button onClick={loadImportedRules} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            Load Imported Rules
          </button>
          <p className="text-xs text-gray-500 mt-2">View imported legacy rules with source and destination details</p>
        </div>
      )}

      {/* App NGDC Mappings moved to Settings page */}

      {/* NGDC Mappings Table */}
      {isNGDCMappings && (
        <>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Add Manual Mapping</h2>
            </div>
            <div className="grid grid-cols-7 gap-3 mb-3">
              <input placeholder="Legacy Name" value={newMapping.legacy_name} onChange={e => setNewMapping(p => ({ ...p, legacy_name: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm" />
              <input placeholder="Legacy DC" value={newMapping.legacy_dc} onChange={e => setNewMapping(p => ({ ...p, legacy_dc: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm" />
              <input placeholder="NGDC Name" value={newMapping.ngdc_name} onChange={e => setNewMapping(p => ({ ...p, ngdc_name: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm" />
              <input placeholder="NGDC DC" value={newMapping.ngdc_dc} onChange={e => setNewMapping(p => ({ ...p, ngdc_dc: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm" />
              <input placeholder="NH" value={newMapping.ngdc_nh} onChange={e => setNewMapping(p => ({ ...p, ngdc_nh: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm" />
              <input placeholder="SZ" value={newMapping.ngdc_sz} onChange={e => setNewMapping(p => ({ ...p, ngdc_sz: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm" />
              <button onClick={handleAddMapping} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">Add</button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Organization NGDC Mappings</h2>
              <button onClick={loadMappings} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
                {showMappings ? 'Refresh' : 'Load Mappings'}
              </button>
            </div>
            {showMappings && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left">
                      <th className="px-3 py-2 font-medium text-gray-600">Legacy Name</th>
                      <th className="px-3 py-2 font-medium text-gray-600">Legacy DC</th>
                      <th className="px-3 py-2 font-medium text-gray-600">NGDC Name</th>
                      <th className="px-3 py-2 font-medium text-gray-600">NGDC DC</th>
                      <th className="px-3 py-2 font-medium text-gray-600">NH</th>
                      <th className="px-3 py-2 font-medium text-gray-600">SZ</th>
                      <th className="px-3 py-2 font-medium text-gray-600">Type</th>
                      <th className="px-3 py-2 font-medium text-gray-600">Status</th>
                      <th className="px-3 py-2 font-medium text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappings.map((m, i) => (
                      <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-xs">{String(m.legacy_name || '')}</td>
                        <td className="px-3 py-2">{String(m.legacy_dc || '')}</td>
                        <td className="px-3 py-2 font-mono text-xs text-blue-700">{String(m.ngdc_name || '')}</td>
                        <td className="px-3 py-2">{String(m.ngdc_dc || '')}</td>
                        <td className="px-3 py-2">{String(m.ngdc_nh || '')}</td>
                        <td className="px-3 py-2">{String(m.ngdc_sz || '')}</td>
                        <td className="px-3 py-2">
                          <span className="px-2 py-0.5 rounded-full bg-gray-100 text-xs">{String(m.type || '')}</span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${m.status === 'Verified' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                            {String(m.status || 'Pending')}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <button onClick={() => handleDeleteMapping(String(m.id))} className="text-red-500 hover:text-red-700 text-xs">Delete</button>
                        </td>
                      </tr>
                    ))}
                    {mappings.length === 0 && (
                      <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-400">No mappings loaded. Click "Load Mappings" or import from Excel.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
