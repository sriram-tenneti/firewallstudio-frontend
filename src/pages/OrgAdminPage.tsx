import { useState, useEffect, useCallback } from 'react';
import {
  getNeighbourhoods, getSecurityZones, getApplications,
  getNGDCDatacenters, getLegacyDatacenters, getPredefinedDestinations,
  getEnvironments, getOrgConfig, getPolicyMatrix,
  createNeighbourhood, updateNeighbourhood, deleteNeighbourhood,
  createSecurityZone, updateSecurityZone, deleteSecurityZone,
  createApplication, updateApplication, deleteApplication,
  createNGDCDatacenter, updateNGDCDatacenter, deleteNGDCDatacenter,
  createLegacyDatacenter, updateLegacyDatacenter, deleteLegacyDatacenter,
  createPredefinedDestination, updatePredefinedDestination, deletePredefinedDestination,
  createEnvironment, deleteEnvironment,
  updateOrgConfig,
  submitPolicyChange, getPolicyChanges,
} from '@/lib/api';
import { Building2, Shield, Server, MapPin, Globe, Settings, Network, Plus, Trash2, Edit2, Save, X, ChevronRight, Clock, CheckCircle, XCircle, SendHorizonal } from 'lucide-react';

type TabKey = 'neighbourhoods' | 'security-zones' | 'applications' | 'ngdc-dcs' | 'legacy-dcs' | 'destinations' | 'environments' | 'policy-matrix' | 'org-config';

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'neighbourhoods', label: 'Neighbourhoods', icon: <MapPin className="h-4 w-4" /> },
  { key: 'security-zones', label: 'Security Zones', icon: <Shield className="h-4 w-4" /> },
  { key: 'applications', label: 'Applications', icon: <Server className="h-4 w-4" /> },
  { key: 'ngdc-dcs', label: 'NGDC Datacenters', icon: <Building2 className="h-4 w-4" /> },
  { key: 'legacy-dcs', label: 'Legacy Datacenters', icon: <Building2 className="h-4 w-4" /> },
  { key: 'destinations', label: 'Predefined Destinations', icon: <Globe className="h-4 w-4" /> },
  { key: 'environments', label: 'Environments', icon: <Network className="h-4 w-4" /> },
  { key: 'policy-matrix', label: 'Policy Matrix', icon: <Shield className="h-4 w-4" /> },
  { key: 'org-config', label: 'Org Configuration', icon: <Settings className="h-4 w-4" /> },
];

interface IPRangeRow { cidr: string; description: string; dc: string }

function IPRangeEditor({ ranges, onChange }: { ranges: IPRangeRow[]; onChange: (r: IPRangeRow[]) => void }) {
  const addRow = () => onChange([...ranges, { cidr: '', description: '', dc: 'EAST_NGDC' }]);
  const removeRow = (i: number) => onChange(ranges.filter((_, idx) => idx !== i));
  const updateRow = (i: number, field: keyof IPRangeRow, val: string) => {
    const copy = [...ranges];
    copy[i] = { ...copy[i], [field]: val };
    onChange(copy);
  };
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">IP Ranges (CIDR)</span>
        <button onClick={addRow} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-0.5"><Plus className="h-3 w-3" />Add</button>
      </div>
      {ranges.map((r, i) => (
        <div key={i} className="flex gap-1 items-center">
          <input value={r.cidr} onChange={e => updateRow(i, 'cidr', e.target.value)} placeholder="10.0.0.0/24" className="flex-1 rounded border px-2 py-1 text-xs" />
          <input value={r.description} onChange={e => updateRow(i, 'description', e.target.value)} placeholder="Description" className="flex-1 rounded border px-2 py-1 text-xs" />
          <select value={r.dc} onChange={e => updateRow(i, 'dc', e.target.value)} className="rounded border px-1 py-1 text-xs">
            <option value="EAST_NGDC">EAST_NGDC</option>
            <option value="WEST_NGDC">WEST_NGDC</option>
            <option value="CENTRAL_NGDC">CENTRAL_NGDC</option>
          </select>
          <button onClick={() => removeRow(i)} className="text-red-400 hover:text-red-600"><Trash2 className="h-3 w-3" /></button>
        </div>
      ))}
    </div>
  );
}

function DataTable({ columns, data, onDelete, onEdit, idField }: {
  columns: { key: string; label: string; width?: string }[];
  data: Record<string, unknown>[];
  onDelete?: (id: string) => void;
  onEdit?: (item: Record<string, unknown>) => void;
  idField: string;
}) {
  return (
    <div className="overflow-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-b">
            {columns.map(c => (
              <th key={c.key} className="px-3 py-2 text-left font-medium text-slate-600" style={c.width ? { width: c.width } : undefined}>{c.label}</th>
            ))}
            {(onEdit || onDelete) && <th className="px-3 py-2 text-right font-medium text-slate-600 w-20">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b hover:bg-slate-50">
              {columns.map(c => (
                <td key={c.key} className="px-3 py-2 text-slate-700">
                  {c.key === 'ip_ranges' ? (
                    <span className="text-xs text-slate-500">{Array.isArray(row[c.key]) ? `${(row[c.key] as unknown[]).length} ranges` : '0 ranges'}</span>
                  ) : c.key === 'pci_scope' || c.key === 'requires_exception' ? (
                    <span className={`text-xs px-1.5 py-0.5 rounded ${row[c.key] ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{row[c.key] ? 'Yes' : 'No'}</span>
                  ) : (
                    String(row[c.key] ?? '')
                  )}
                </td>
              ))}
              {(onEdit || onDelete) && (
                <td className="px-3 py-2 text-right">
                  <div className="flex justify-end gap-1">
                    {onEdit && <button onClick={() => onEdit(row)} className="p-1 text-blue-500 hover:text-blue-700"><Edit2 className="h-3.5 w-3.5" /></button>}
                    {onDelete && <button onClick={() => onDelete(String(row[idField]))} className="p-1 text-red-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>}
                  </div>
                </td>
              )}
            </tr>
          ))}
          {data.length === 0 && (
            <tr><td colSpan={columns.length + 1} className="px-3 py-6 text-center text-slate-400">No data</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function OrgAdminPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('neighbourhoods');
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Record<string, unknown> | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [orgConfig, setOrgConfig] = useState<Record<string, unknown>>({});
  const [saveMsg, setSaveMsg] = useState('');
  const [policyChanges, setPolicyChanges] = useState<Record<string, unknown>[]>([]);
  const [policyComment, setPolicyComment] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setShowForm(false);
    setEditItem(null);
    try {
      switch (activeTab) {
        case 'neighbourhoods': setData(await getNeighbourhoods() as unknown as Record<string, unknown>[]); break;
        case 'security-zones': setData(await getSecurityZones() as unknown as Record<string, unknown>[]); break;
        case 'applications': setData(await getApplications() as unknown as Record<string, unknown>[]); break;
        case 'ngdc-dcs': setData(await getNGDCDatacenters() as unknown as Record<string, unknown>[]); break;
        case 'legacy-dcs': setData(await getLegacyDatacenters() as unknown as Record<string, unknown>[]); break;
        case 'destinations': setData(await getPredefinedDestinations() as unknown as Record<string, unknown>[]); break;
        case 'environments': setData(await getEnvironments() as unknown as Record<string, unknown>[]); break;
        case 'policy-matrix': {
          setData(await getPolicyMatrix());
          setPolicyChanges(await getPolicyChanges());
          break;
        }
        case 'org-config': {
          const cfg = await getOrgConfig();
          setOrgConfig(cfg);
          setData([]);
          break;
        }
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [activeTab]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDelete = async (id: string) => {
    if (!confirm(`Delete "${id}"?`)) return;
    try {
      switch (activeTab) {
        case 'neighbourhoods': await deleteNeighbourhood(id); break;
        case 'security-zones': await deleteSecurityZone(id); break;
        case 'applications': await deleteApplication(id); break;
        case 'ngdc-dcs': await deleteNGDCDatacenter(id); break;
        case 'legacy-dcs': await deleteLegacyDatacenter(id); break;
        case 'destinations': await deletePredefinedDestination(id); break;
        case 'environments': await deleteEnvironment(id); break;
        case 'policy-matrix': {
          const parts = id.split('::');
          const orig = data.find(d => d.source_zone === parts[0] && d.dest_zone === parts[1]);
          await submitPolicyChange({
            change_type: 'delete',
            policy_data: { source_zone: parts[0], dest_zone: parts[1] },
            original_data: orig ? { ...orig } : { source_zone: parts[0], dest_zone: parts[1] },
            comments: 'Delete policy entry',
          });
          setSaveMsg('Delete submitted for review');
          setTimeout(() => setSaveMsg(''), 3000);
          break;
        }
      }
      loadData();
    } catch (e) { console.error(e); alert('Delete failed'); }
  };

  const handleEdit = (item: Record<string, unknown>) => {
    setEditItem(item);
    setFormData({ ...item });
    setShowForm(true);
  };

  const handleCreate = () => {
    setEditItem(null);
    setFormData(getDefaultForm());
    setShowForm(true);
  };

  const getDefaultForm = (): Record<string, unknown> => {
    switch (activeTab) {
      case 'neighbourhoods': return { nh_id: '', name: '', zone: 'GEN', environment: 'Production', description: '', ip_ranges: [] };
      case 'security-zones': return { code: '', name: '', description: '', risk_level: 'Medium', pci_scope: false, ip_ranges: [] };
      case 'applications': return { app_id: '', name: '', owner: '', nh: 'NH01', sz: 'GEN', criticality: 3, pci_scope: false };
      case 'ngdc-dcs': return { code: '', name: '', region: '', neighbourhoods: [], ip_supernets: [] };
      case 'legacy-dcs': return { code: '', name: '', region: '', status: 'Active' };
      case 'destinations': return { name: '', friendly_name: '', security_zone: 'GEN', ip: '', ports: '443', description: '' };
      case 'environments': return { code: '', name: '', description: '' };
      case 'policy-matrix': return { source_zone: '', dest_zone: '', default_action: 'Permitted', requires_exception: false, description: '' };
      default: return {};
    }
  };

  const handleSave = async () => {
    try {
      if (editItem) {
        switch (activeTab) {
          case 'neighbourhoods': await updateNeighbourhood(String(formData.nh_id), formData); break;
          case 'security-zones': await updateSecurityZone(String(formData.code), formData); break;
          case 'applications': await updateApplication(String(formData.app_id), formData); break;
          case 'ngdc-dcs': await updateNGDCDatacenter(String(formData.code), formData); break;
          case 'legacy-dcs': await updateLegacyDatacenter(String(formData.code), formData); break;
          case 'destinations': await updatePredefinedDestination(String(formData.name), formData); break;
          case 'policy-matrix': {
            await submitPolicyChange({
              change_type: 'modify',
              policy_data: formData,
              original_data: editItem,
              comments: policyComment || 'Modify policy entry',
            });
            setPolicyComment('');
            setSaveMsg('Policy modification submitted for review');
            setTimeout(() => setSaveMsg(''), 3000);
            break;
          }
        }
      } else {
        switch (activeTab) {
          case 'neighbourhoods': await createNeighbourhood(formData); break;
          case 'security-zones': await createSecurityZone(formData); break;
          case 'applications': await createApplication(formData); break;
          case 'ngdc-dcs': await createNGDCDatacenter(formData); break;
          case 'legacy-dcs': await createLegacyDatacenter(formData); break;
          case 'destinations': await createPredefinedDestination(formData); break;
          case 'environments': await createEnvironment(formData); break;
          case 'policy-matrix': {
            await submitPolicyChange({
              change_type: 'add',
              policy_data: formData,
              comments: policyComment || 'New policy entry',
            });
            setPolicyComment('');
            setSaveMsg('Policy change submitted for review');
            setTimeout(() => setSaveMsg(''), 3000);
            break;
          }
        }
      }
      setShowForm(false);
      loadData();
    } catch (e) { console.error(e); alert('Save failed'); }
  };

  const handleSaveOrgConfig = async () => {
    try {
      const result = await updateOrgConfig(orgConfig);
      setOrgConfig(result);
      setSaveMsg('Saved!');
      setTimeout(() => setSaveMsg(''), 2000);
    } catch (e) { console.error(e); alert('Save failed'); }
  };

  const getColumns = () => {
    switch (activeTab) {
      case 'neighbourhoods': return [
        { key: 'nh_id', label: 'ID', width: '80px' }, { key: 'name', label: 'Name' },
        { key: 'zone', label: 'Zone', width: '80px' }, { key: 'environment', label: 'Environment', width: '120px' },
        { key: 'ip_ranges', label: 'IP Ranges', width: '100px' },
      ];
      case 'security-zones': return [
        { key: 'code', label: 'Code', width: '80px' }, { key: 'name', label: 'Name' },
        { key: 'risk_level', label: 'Risk', width: '80px' }, { key: 'pci_scope', label: 'PCI', width: '60px' },
        { key: 'ip_ranges', label: 'IP Ranges', width: '100px' },
      ];
      case 'applications': return [
        { key: 'app_id', label: 'App ID', width: '100px' }, { key: 'name', label: 'Name' },
        { key: 'owner', label: 'Owner', width: '120px' }, { key: 'nh', label: 'NH', width: '60px' },
        { key: 'sz', label: 'SZ', width: '60px' }, { key: 'criticality', label: 'Crit', width: '50px' },
        { key: 'pci_scope', label: 'PCI', width: '60px' },
      ];
      case 'ngdc-dcs': return [
        { key: 'code', label: 'Code', width: '120px' }, { key: 'name', label: 'Name' }, { key: 'region', label: 'Region', width: '100px' },
      ];
      case 'legacy-dcs': return [
        { key: 'code', label: 'Code', width: '150px' }, { key: 'name', label: 'Name' }, { key: 'region', label: 'Region', width: '100px' },
      ];
      case 'destinations': return [
        { key: 'name', label: 'Name' }, { key: 'friendly_name', label: 'Friendly Name' },
        { key: 'security_zone', label: 'Zone', width: '80px' }, { key: 'ports', label: 'Ports', width: '80px' },
      ];
      case 'environments': return [
        { key: 'code', label: 'Code', width: '100px' }, { key: 'name', label: 'Name' }, { key: 'description', label: 'Description' },
      ];
      case 'policy-matrix': return [
        { key: 'source_zone', label: 'Source Zone', width: '120px' }, { key: 'dest_zone', label: 'Dest Zone', width: '120px' },
        { key: 'default_action', label: 'Action', width: '120px' }, { key: 'requires_exception', label: 'Exception', width: '80px' },
        { key: 'description', label: 'Description' },
      ];
      default: return [];
    }
  };

  const getIdField = () => {
    switch (activeTab) {
      case 'neighbourhoods': return 'nh_id';
      case 'security-zones': return 'code';
      case 'applications': return 'app_id';
      case 'ngdc-dcs': return 'code';
      case 'legacy-dcs': return 'code';
      case 'destinations': return 'name';
      case 'environments': return 'code';
      case 'policy-matrix': return 'source_zone';
      default: return 'id';
    }
  };

  const updateField = (key: string, value: unknown) => setFormData(prev => ({ ...prev, [key]: value }));

  const renderForm = () => {
    if (activeTab === 'org-config') return null;
    const fields: { key: string; label: string; type: 'text' | 'select' | 'checkbox' | 'number' | 'ip-ranges'; options?: string[] }[] = [];
    switch (activeTab) {
      case 'neighbourhoods':
        fields.push({ key: 'nh_id', label: 'NH ID', type: 'text' }, { key: 'name', label: 'Name', type: 'text' },
          { key: 'zone', label: 'Zone', type: 'text' }, { key: 'environment', label: 'Environment', type: 'text' },
          { key: 'description', label: 'Description', type: 'text' }, { key: 'ip_ranges', label: 'IP Ranges', type: 'ip-ranges' });
        break;
      case 'security-zones':
        fields.push({ key: 'code', label: 'Code', type: 'text' }, { key: 'name', label: 'Name', type: 'text' },
          { key: 'description', label: 'Description', type: 'text' },
          { key: 'risk_level', label: 'Risk Level', type: 'select', options: ['Critical', 'High', 'Medium', 'Low'] },
          { key: 'pci_scope', label: 'PCI Scope', type: 'checkbox' }, { key: 'ip_ranges', label: 'IP Ranges', type: 'ip-ranges' });
        break;
      case 'applications':
        fields.push({ key: 'app_id', label: 'App ID', type: 'text' }, { key: 'name', label: 'Name', type: 'text' },
          { key: 'owner', label: 'Owner', type: 'text' }, { key: 'nh', label: 'NH', type: 'text' },
          { key: 'sz', label: 'SZ', type: 'text' }, { key: 'criticality', label: 'Criticality', type: 'number' },
          { key: 'pci_scope', label: 'PCI Scope', type: 'checkbox' });
        break;
      case 'ngdc-dcs':
        fields.push({ key: 'code', label: 'Code', type: 'text' }, { key: 'name', label: 'Name', type: 'text' },
          { key: 'region', label: 'Region', type: 'text' });
        break;
      case 'legacy-dcs':
        fields.push({ key: 'code', label: 'Code', type: 'text' }, { key: 'name', label: 'Name', type: 'text' },
          { key: 'region', label: 'Region', type: 'text' }, { key: 'status', label: 'Status', type: 'text' });
        break;
      case 'destinations':
        fields.push({ key: 'name', label: 'Name', type: 'text' }, { key: 'friendly_name', label: 'Friendly Name', type: 'text' },
          { key: 'security_zone', label: 'Security Zone', type: 'text' }, { key: 'ip', label: 'IP', type: 'text' },
          { key: 'ports', label: 'Ports', type: 'text' }, { key: 'description', label: 'Description', type: 'text' });
        break;
      case 'environments':
        fields.push({ key: 'code', label: 'Code', type: 'text' }, { key: 'name', label: 'Name', type: 'text' },
          { key: 'description', label: 'Description', type: 'text' });
        break;
      case 'policy-matrix':
        fields.push({ key: 'source_zone', label: 'Source Zone', type: 'text' }, { key: 'dest_zone', label: 'Dest Zone', type: 'text' },
          { key: 'default_action', label: 'Action', type: 'select', options: ['Permitted', 'Blocked', 'Exception Required'] },
          { key: 'requires_exception', label: 'Requires Exception', type: 'checkbox' }, { key: 'description', label: 'Description', type: 'text' });
        break;
    }
    return (
      <div className="rounded-lg border bg-white p-4 shadow-sm mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-700">{editItem ? 'Edit' : 'Create New'}</h3>
          <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {fields.map(f => (
            <div key={f.key} className={f.type === 'ip-ranges' ? 'col-span-2' : ''}>
              {f.type === 'ip-ranges' ? (
                <IPRangeEditor
                  ranges={(formData[f.key] as IPRangeRow[]) || []}
                  onChange={val => updateField(f.key, val)}
                />
              ) : f.type === 'checkbox' ? (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={Boolean(formData[f.key])} onChange={e => updateField(f.key, e.target.checked)} className="rounded" />
                  {f.label}
                </label>
              ) : f.type === 'select' ? (
                <div>
                  <label className="text-xs font-medium text-slate-500">{f.label}</label>
                  <select value={String(formData[f.key] ?? '')} onChange={e => updateField(f.key, e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm">
                    {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              ) : f.type === 'number' ? (
                <div>
                  <label className="text-xs font-medium text-slate-500">{f.label}</label>
                  <input type="number" value={Number(formData[f.key]) || 0} onChange={e => updateField(f.key, parseInt(e.target.value))} className="w-full rounded border px-2 py-1.5 text-sm" />
                </div>
              ) : (
                <div>
                  <label className="text-xs font-medium text-slate-500">{f.label}</label>
                  <input type="text" value={String(formData[f.key] ?? '')} onChange={e => updateField(f.key, e.target.value)}
                    className="w-full rounded border px-2 py-1.5 text-sm" disabled={editItem !== null && (f.key === 'nh_id' || f.key === 'code' || f.key === 'app_id')} />
                </div>
              )}
            </div>
          ))}
        </div>
        {activeTab === 'policy-matrix' && (
          <div className="col-span-2 mt-2">
            <label className="text-xs font-medium text-slate-500">Review Comment</label>
            <input type="text" value={policyComment} onChange={e => setPolicyComment(e.target.value)}
              placeholder="Reason for this policy change..." className="w-full rounded border px-2 py-1.5 text-sm" />
          </div>
        )}
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={() => setShowForm(false)} className="rounded px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
          {activeTab === 'policy-matrix' ? (
            <button onClick={handleSave} className="rounded bg-amber-600 px-3 py-1.5 text-sm text-white hover:bg-amber-500 flex items-center gap-1"><SendHorizonal className="h-3.5 w-3.5" />Submit for Review</button>
          ) : (
            <button onClick={handleSave} className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500 flex items-center gap-1"><Save className="h-3.5 w-3.5" />Save</button>
          )}
        </div>
      </div>
    );
  };

  const renderOrgConfig = () => {
    const fields = [
      { key: 'org_name', label: 'Organization Name' }, { key: 'org_code', label: 'Org Code' },
      { key: 'servicenow_instance', label: 'ServiceNow Instance' }, { key: 'servicenow_api_path', label: 'ServiceNow API Path' },
      { key: 'gitops_repo', label: 'GitOps Repository' }, { key: 'gitops_branch', label: 'GitOps Branch' },
      { key: 'notification_email', label: 'Notification Email' }, { key: 'notification_slack_channel', label: 'Slack Channel' },
      { key: 'max_rule_expiry_days', label: 'Max Rule Expiry (days)', type: 'number' },
    ];
    const boolFields = [
      { key: 'approval_required', label: 'Approval Required' },
      { key: 'auto_certify_birthright', label: 'Auto-Certify Birthright Rules' },
      { key: 'enforce_group_to_group', label: 'Enforce Group-to-Group' },
    ];
    return (
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-700 mb-4">Organization Configuration</h3>
        <div className="grid grid-cols-2 gap-4">
          {fields.map(f => (
            <div key={f.key}>
              <label className="text-xs font-medium text-slate-500">{f.label}</label>
              <input type={f.type === 'number' ? 'number' : 'text'} value={String(orgConfig[f.key] ?? '')}
                onChange={e => setOrgConfig(prev => ({ ...prev, [f.key]: f.type === 'number' ? parseInt(e.target.value) : e.target.value }))}
                className="w-full rounded border px-3 py-2 text-sm" />
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-4">
          {boolFields.map(f => (
            <label key={f.key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={Boolean(orgConfig[f.key])}
                onChange={e => setOrgConfig(prev => ({ ...prev, [f.key]: e.target.checked }))} className="rounded" />
              {f.label}
            </label>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button onClick={handleSaveOrgConfig} className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500 flex items-center gap-1">
            <Save className="h-4 w-4" />Save Configuration
          </button>
          {saveMsg && <span className="text-sm text-green-600 font-medium">{saveMsg}</span>}
        </div>
      </div>
    );
  };

  const policyDeleteId = (row: Record<string, unknown>) => `${row.source_zone}::${row.dest_zone}`;

  return (
    <div className="flex h-full">
      <aside className="w-56 border-r bg-white overflow-y-auto">
        <div className="p-3">
          <h2 className="text-xs font-bold uppercase text-slate-400 mb-2">Administration</h2>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm mb-0.5 transition-colors ${
                activeTab === t.key ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-50'
              }`}>
              {t.icon}{t.label}<ChevronRight className="h-3 w-3 ml-auto opacity-40" />
            </button>
          ))}
        </div>
      </aside>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-slate-700">{TABS.find(t => t.key === activeTab)?.label}</h2>
          {activeTab !== 'org-config' && (
            <button onClick={handleCreate} className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500 flex items-center gap-1">
              <Plus className="h-4 w-4" />Add New
            </button>
          )}
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-400">Loading...</div>
        ) : activeTab === 'org-config' ? renderOrgConfig() : (
          <>
            {showForm && renderForm()}
            <DataTable
              columns={getColumns()}
              data={activeTab === 'policy-matrix' ? data.map(d => ({ ...d, _deleteId: policyDeleteId(d) })) : data}
              onDelete={id => handleDelete(activeTab === 'policy-matrix' ? id : id)}
              onEdit={activeTab !== 'environments' ? handleEdit : undefined}
              idField={activeTab === 'policy-matrix' ? '_deleteId' : getIdField()}
            />
            {activeTab === 'policy-matrix' && policyChanges.length > 0 && (
              <div className="mt-6">
                <h3 className="text-lg font-semibold text-slate-700 mb-3 flex items-center gap-2"><Clock className="h-5 w-5 text-amber-500" />Policy Change Requests</h3>
                <div className="overflow-auto rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b">
                        <th className="px-3 py-2 text-left font-medium text-slate-600">ID</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-600">Type</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-600">Source → Dest</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-600">Action</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-600">Status</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-600">Submitted</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-600">Comments</th>
                      </tr>
                    </thead>
                    <tbody>
                      {policyChanges.map((pc, i) => {
                        const pd = (pc.policy_data || {}) as Record<string, unknown>;
                        const status = String(pc.status || '');
                        return (
                          <tr key={i} className="border-b hover:bg-slate-50">
                            <td className="px-3 py-2 font-mono text-xs text-slate-500">{String(pc.id || '')}</td>
                            <td className="px-3 py-2">
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                pc.change_type === 'add' ? 'bg-green-100 text-green-700' :
                                pc.change_type === 'modify' ? 'bg-blue-100 text-blue-700' :
                                'bg-red-100 text-red-700'
                              }`}>{String(pc.change_type || '').toUpperCase()}</span>
                            </td>
                            <td className="px-3 py-2">{String(pd.source_zone || '')} → {String(pd.dest_zone || '')}</td>
                            <td className="px-3 py-2">{String(pd.default_action || '')}</td>
                            <td className="px-3 py-2">
                              <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium ${
                                status === 'Approved' ? 'bg-green-100 text-green-700' :
                                status === 'Rejected' ? 'bg-red-100 text-red-700' :
                                'bg-amber-100 text-amber-700'
                              }`}>
                                {status === 'Approved' ? <CheckCircle className="h-3 w-3" /> :
                                 status === 'Rejected' ? <XCircle className="h-3 w-3" /> :
                                 <Clock className="h-3 w-3" />}
                                {status}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-xs text-slate-500">{String(pc.submitted_at || '').slice(0, 16)}</td>
                            <td className="px-3 py-2 text-xs text-slate-500">{String(pc.comments || '')}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {saveMsg && <div className="mt-3 text-sm text-amber-600 font-medium flex items-center gap-1"><Clock className="h-4 w-4" />{saveMsg}</div>}
          </>
        )}
      </div>
    </div>
  );
}
