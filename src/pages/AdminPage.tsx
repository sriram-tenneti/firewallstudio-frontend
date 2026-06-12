import { useState, useEffect, useCallback } from 'react';
import { Notification } from '@/components/shared/Notification';
import { useNotification } from '@/hooks/useNotification';
import * as api from '@/lib/api';
import type { Application } from '@/types';

interface AppEnvAssignment {
  app_id: string;
  environment: string;
  datacenter: string;
  neighbourhood: string;
  security_zone: string;
  status: string;
  notes: string;
}

export default function AdminPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [assignments, setAssignments] = useState<AppEnvAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedApp, setSelectedApp] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'assignments' | 'apps'>('assignments');
  const { notification, showNotification, clearNotification } = useNotification();

  // Assignment edit state
  const [editingAssignment, setEditingAssignment] = useState<AppEnvAssignment | null>(null);
  const [editForm, setEditForm] = useState<Record<string, unknown>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<Record<string, unknown>>({
    app_id: '',
    environment: 'Production',
    datacenter: '',
    neighbourhood: '',
    security_zone: '',
    status: 'Active',
    notes: '',
  });

  // Application edit state
  const [editingApp, setEditingApp] = useState<Application | null>(null);
  const [appEditForm, setAppEditForm] = useState<Record<string, unknown>>({});
  const [showAddApp, setShowAddApp] = useState(false);
  const [appAddForm, setAppAddForm] = useState<Record<string, unknown>>({
    app_id: '', name: '', owner: '', nh: '', sz: '', criticality: '', pci_scope: false, app_distributed_id: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [appsData, assignData] = await Promise.all([
        api.getApplications(),
        api.getAppEnvAssignments(selectedApp || undefined),
      ]);
      setApplications(appsData);
      setAssignments(assignData as unknown as AppEnvAssignment[]);
    } catch {
      showNotification('Failed to load data', 'error');
    }
    setLoading(false);
  }, [selectedApp, showNotification]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleEdit = (a: AppEnvAssignment) => {
    setEditingAssignment(a);
    setEditForm({
      datacenter: a.datacenter,
      neighbourhood: a.neighbourhood,
      security_zone: a.security_zone,
      status: a.status,
      notes: a.notes,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingAssignment) return;
    try {
      await api.updateAppEnvAssignment(editingAssignment.app_id, editingAssignment.environment, editForm);
      showNotification('Assignment updated', 'success');
      setEditingAssignment(null);
      loadData();
    } catch {
      showNotification('Failed to update assignment', 'error');
    }
  };

  const handleDelete = async (a: AppEnvAssignment) => {
    if (!confirm(`Delete assignment for ${a.app_id} - ${a.environment}?`)) return;
    try {
      await api.deleteAppEnvAssignment(a.app_id, a.environment);
      showNotification('Assignment deleted', 'success');
      loadData();
    } catch {
      showNotification('Failed to delete assignment', 'error');
    }
  };

  const handleAdd = async () => {
    try {
      await api.updateAppEnvAssignment(
        String(addForm.app_id),
        String(addForm.environment),
        addForm,
      );
      showNotification('Assignment created', 'success');
      setShowAddForm(false);
      setAddForm({ app_id: '', environment: 'Production', datacenter: '', neighbourhood: '', security_zone: '', status: 'Active', notes: '' });
      loadData();
    } catch {
      showNotification('Failed to create assignment', 'error');
    }
  };

  // Application CRUD handlers
  const handleEditApp = (app: Application) => {
    setEditingApp(app);
    setAppEditForm({ name: app.name, owner: app.owner, nh: app.nh, sz: app.sz, criticality: app.criticality ?? '', pci_scope: app.pci_scope ?? false, app_distributed_id: app.app_distributed_id ?? '' });
  };

  const handleSaveAppEdit = async () => {
    if (!editingApp) return;
    try {
      await api.updateApplication(editingApp.app_id, appEditForm);
      showNotification('Application updated', 'success');
      setEditingApp(null);
      loadData();
    } catch {
      showNotification('Failed to update application', 'error');
    }
  };

  const handleDeleteApp = async (app: Application) => {
    if (!confirm(`Delete application ${app.app_id} - ${app.name}?`)) return;
    try {
      await api.deleteApplication(app.app_id);
      showNotification('Application deleted', 'success');
      loadData();
    } catch {
      showNotification('Failed to delete application', 'error');
    }
  };

  const handleAddApp = async () => {
    try {
      await api.createApplication(appAddForm);
      showNotification('Application created', 'success');
      setShowAddApp(false);
      setAppAddForm({ app_id: '', name: '', owner: '', nh: '', sz: '', criticality: '', pci_scope: false, app_distributed_id: '' });
      loadData();
    } catch {
      showNotification('Failed to create application', 'error');
    }
  };

  const filteredAssignments = selectedApp
    ? assignments.filter(a => a.app_id === selectedApp)
    : assignments;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {notification && <Notification message={notification.message} type={notification.type} onClose={clearNotification} />}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin</h1>
          <p className="text-sm text-gray-500 mt-1">Manage application environment assignments and configuration</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="px-3 py-2 text-sm border border-gray-300 rounded-md bg-white focus:ring-2 focus:ring-indigo-500"
            value={selectedApp}
            onChange={e => setSelectedApp(e.target.value)}
          >
            <option value="">All Applications</option>
            {applications.map(app => (
              <option key={app.app_id} value={app.app_id}>{app.app_distributed_id || app.app_id}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('assignments')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'assignments' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          App-Environment Assignments ({filteredAssignments.length})
        </button>
        <button
          onClick={() => setActiveTab('apps')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'apps' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Applications ({applications.length})
        </button>
      </div>

      {activeTab === 'assignments' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
            >
              {showAddForm ? 'Cancel' : '+ Add Assignment'}
            </button>
          </div>

          {/* Add form */}
          {showAddForm && (
            <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg space-y-3">
              <h3 className="text-sm font-semibold text-indigo-800">New App-Environment Assignment</h3>
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Application</label>
                  <select className="w-full px-2 py-1.5 text-sm border rounded" value={String(addForm.app_id)} onChange={e => setAddForm({ ...addForm, app_id: e.target.value })}>
                    <option value="">Select...</option>
                    {applications.map(a => <option key={a.app_id} value={a.app_id}>{a.app_distributed_id || a.app_id}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Environment</label>
                  <select className="w-full px-2 py-1.5 text-sm border rounded" value={String(addForm.environment)} onChange={e => setAddForm({ ...addForm, environment: e.target.value })}>
                    <option value="Production">Production</option>
                    <option value="Non-Production">Non-Production</option>
                    <option value="Pre-Production">Pre-Production</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Datacenter</label>
                  <input className="w-full px-2 py-1.5 text-sm border rounded" value={String(addForm.datacenter || '')} onChange={e => setAddForm({ ...addForm, datacenter: e.target.value })} placeholder="e.g. EAST_NGDC" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Neighbourhood</label>
                  <input className="w-full px-2 py-1.5 text-sm border rounded" value={String(addForm.neighbourhood || '')} onChange={e => setAddForm({ ...addForm, neighbourhood: e.target.value })} placeholder="e.g. NH01" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Security Zone</label>
                  <input className="w-full px-2 py-1.5 text-sm border rounded" value={String(addForm.security_zone || '')} onChange={e => setAddForm({ ...addForm, security_zone: e.target.value })} placeholder="e.g. STD" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                  <select className="w-full px-2 py-1.5 text-sm border rounded" value={String(addForm.status)} onChange={e => setAddForm({ ...addForm, status: e.target.value })}>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="Pending">Pending</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                  <input className="w-full px-2 py-1.5 text-sm border rounded" value={String(addForm.notes || '')} onChange={e => setAddForm({ ...addForm, notes: e.target.value })} placeholder="Optional notes" />
                </div>
              </div>
              <div className="flex justify-end">
                <button onClick={handleAdd} disabled={!addForm.app_id} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-40">
                  Save Assignment
                </button>
              </div>
            </div>
          )}

          {/* Assignments table */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">App ID</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Environment</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Datacenter</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Neighbourhood</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Security Zone</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Notes</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
                  ) : filteredAssignments.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No assignments found</td></tr>
                  ) : filteredAssignments.map(a => (
                    <tr key={`${a.app_id}-${a.environment}`} className="hover:bg-gray-50">
                      {editingAssignment?.app_id === a.app_id && editingAssignment?.environment === a.environment ? (
                        <>
                          <td className="px-4 py-2 font-mono font-semibold text-blue-700">{a.app_id}</td>
                          <td className="px-4 py-2">{a.environment}</td>
                          <td className="px-4 py-2"><input className="w-full px-1 py-0.5 text-xs border rounded" value={String(editForm.datacenter || '')} onChange={e => setEditForm({ ...editForm, datacenter: e.target.value })} /></td>
                          <td className="px-4 py-2"><input className="w-full px-1 py-0.5 text-xs border rounded" value={String(editForm.neighbourhood || '')} onChange={e => setEditForm({ ...editForm, neighbourhood: e.target.value })} /></td>
                          <td className="px-4 py-2"><input className="w-full px-1 py-0.5 text-xs border rounded" value={String(editForm.security_zone || '')} onChange={e => setEditForm({ ...editForm, security_zone: e.target.value })} /></td>
                          <td className="px-4 py-2">
                            <select className="w-full px-1 py-0.5 text-xs border rounded" value={String(editForm.status || '')} onChange={e => setEditForm({ ...editForm, status: e.target.value })}>
                              <option value="Active">Active</option>
                              <option value="Inactive">Inactive</option>
                              <option value="Pending">Pending</option>
                            </select>
                          </td>
                          <td className="px-4 py-2"><input className="w-full px-1 py-0.5 text-xs border rounded" value={String(editForm.notes || '')} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} /></td>
                          <td className="px-4 py-2 text-right">
                            <div className="flex justify-end gap-1">
                              <button onClick={handleSaveEdit} className="px-2 py-1 text-xs font-medium text-white bg-green-600 rounded hover:bg-green-700">Save</button>
                              <button onClick={() => setEditingAssignment(null)} className="px-2 py-1 text-xs text-gray-600 border rounded hover:bg-gray-50">Cancel</button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-2 font-mono font-semibold text-blue-700">{a.app_id}</td>
                          <td className="px-4 py-2">{a.environment}</td>
                          <td className="px-4 py-2 font-mono text-gray-600">{a.datacenter || '-'}</td>
                          <td className="px-4 py-2 font-mono text-gray-600">{a.neighbourhood || '-'}</td>
                          <td className="px-4 py-2 font-mono text-gray-600">{a.security_zone || '-'}</td>
                          <td className="px-4 py-2">
                            <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${a.status === 'Active' ? 'bg-green-100 text-green-700' : a.status === 'Pending' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                              {a.status || 'N/A'}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-gray-500 text-xs">{a.notes || '-'}</td>
                          <td className="px-4 py-2 text-right">
                            <div className="flex justify-end gap-1">
                              <button onClick={() => handleEdit(a)} className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100">Edit</button>
                              <button onClick={() => handleDelete(a)} className="px-2 py-1 text-xs font-medium text-red-700 bg-red-50 rounded hover:bg-red-100">Delete</button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'apps' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowAddApp(!showAddApp)} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">
              {showAddApp ? 'Cancel' : '+ Add Application'}
            </button>
          </div>

          {/* Add Application form */}
          {showAddApp && (
            <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg space-y-3">
              <h3 className="text-sm font-semibold text-indigo-800">New Application</h3>
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">App ID</label>
                  <input className="w-full px-2 py-1.5 text-sm border rounded" value={String(appAddForm.app_id || '')} onChange={e => setAppAddForm({ ...appAddForm, app_id: e.target.value })} placeholder="e.g. APP001" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                  <input className="w-full px-2 py-1.5 text-sm border rounded" value={String(appAddForm.name || '')} onChange={e => setAppAddForm({ ...appAddForm, name: e.target.value })} placeholder="Application name" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Distributed ID</label>
                  <input className="w-full px-2 py-1.5 text-sm border rounded" value={String(appAddForm.app_distributed_id || '')} onChange={e => setAppAddForm({ ...appAddForm, app_distributed_id: e.target.value })} placeholder="e.g. DID001" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Owner</label>
                  <input className="w-full px-2 py-1.5 text-sm border rounded" value={String(appAddForm.owner || '')} onChange={e => setAppAddForm({ ...appAddForm, owner: e.target.value })} placeholder="Owner name" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Neighbourhood</label>
                  <input className="w-full px-2 py-1.5 text-sm border rounded" value={String(appAddForm.nh || '')} onChange={e => setAppAddForm({ ...appAddForm, nh: e.target.value })} placeholder="e.g. NH01" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Security Zone</label>
                  <input className="w-full px-2 py-1.5 text-sm border rounded" value={String(appAddForm.sz || '')} onChange={e => setAppAddForm({ ...appAddForm, sz: e.target.value })} placeholder="e.g. STD" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Criticality</label>
                  <input type="number" className="w-full px-2 py-1.5 text-sm border rounded" value={String(appAddForm.criticality || '')} onChange={e => setAppAddForm({ ...appAddForm, criticality: e.target.value ? Number(e.target.value) : '' })} placeholder="1-5" />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={!!appAddForm.pci_scope} onChange={e => setAppAddForm({ ...appAddForm, pci_scope: e.target.checked })} className="rounded border-gray-300 text-indigo-600" />
                    PCI Scope
                  </label>
                </div>
              </div>
              <div className="flex justify-end">
                <button onClick={handleAddApp} disabled={!appAddForm.app_id || !appAddForm.name} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 disabled:opacity-40">
                  Save Application
                </button>
              </div>
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-800">All Applications ({applications.length})</h3>
            </div>
            {loading ? (
              <div className="p-8 text-center text-gray-400">Loading...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">App ID</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Name</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">NH</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">SZ</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Criticality</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">PCI</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Owner</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {applications.map(app => (
                      <tr key={app.app_id} className="hover:bg-gray-50">
                        {editingApp?.app_id === app.app_id ? (
                          <>
                            <td className="px-4 py-2 font-mono font-semibold text-blue-700">{app.app_id}</td>
                            <td className="px-4 py-2"><input className="w-full px-1 py-0.5 text-xs border rounded" value={String(appEditForm.name || '')} onChange={e => setAppEditForm({ ...appEditForm, name: e.target.value })} /></td>
                            <td className="px-4 py-2"><input className="w-full px-1 py-0.5 text-xs border rounded" value={String(appEditForm.nh || '')} onChange={e => setAppEditForm({ ...appEditForm, nh: e.target.value })} /></td>
                            <td className="px-4 py-2"><input className="w-full px-1 py-0.5 text-xs border rounded" value={String(appEditForm.sz || '')} onChange={e => setAppEditForm({ ...appEditForm, sz: e.target.value })} /></td>
                            <td className="px-4 py-2"><input type="number" className="w-16 px-1 py-0.5 text-xs border rounded" value={String(appEditForm.criticality || '')} onChange={e => setAppEditForm({ ...appEditForm, criticality: e.target.value ? Number(e.target.value) : '' })} /></td>
                            <td className="px-4 py-2">
                              <label className="flex items-center gap-1 cursor-pointer">
                                <input type="checkbox" checked={!!appEditForm.pci_scope} onChange={e => setAppEditForm({ ...appEditForm, pci_scope: e.target.checked })} className="rounded border-gray-300 text-indigo-600" />
                                <span className="text-xs">{appEditForm.pci_scope ? 'Yes' : 'No'}</span>
                              </label>
                            </td>
                            <td className="px-4 py-2"><input className="w-full px-1 py-0.5 text-xs border rounded" value={String(appEditForm.owner || '')} onChange={e => setAppEditForm({ ...appEditForm, owner: e.target.value })} /></td>
                            <td className="px-4 py-2 text-right">
                              <div className="flex justify-end gap-1">
                                <button onClick={handleSaveAppEdit} className="px-2 py-1 text-xs font-medium text-white bg-green-600 rounded hover:bg-green-700">Save</button>
                                <button onClick={() => setEditingApp(null)} className="px-2 py-1 text-xs text-gray-600 border rounded hover:bg-gray-50">Cancel</button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-2 font-mono font-semibold text-blue-700">{app.app_id}</td>
                            <td className="px-4 py-2 text-gray-800">{app.name}</td>
                            <td className="px-4 py-2 font-mono text-gray-600">{app.nh || '-'}</td>
                            <td className="px-4 py-2 font-mono text-gray-600">{app.sz || '-'}</td>
                            <td className="px-4 py-2 text-gray-600">{app.criticality ?? '-'}</td>
                            <td className="px-4 py-2">
                              <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${app.pci_scope ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                {app.pci_scope ? 'Yes' : 'No'}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-gray-600">{app.owner || '-'}</td>
                            <td className="px-4 py-2 text-right">
                              <div className="flex justify-end gap-1">
                                <button onClick={() => handleEditApp(app)} className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100">Edit</button>
                                <button onClick={() => handleDeleteApp(app)} className="px-2 py-1 text-xs font-medium text-red-700 bg-red-50 rounded hover:bg-red-100">Delete</button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
