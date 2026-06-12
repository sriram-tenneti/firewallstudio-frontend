import { useEffect, useState } from 'react';
import * as api from '@/lib/api';
import type { ItsmConnector } from '@/types';

const KIND_OPTIONS: ItsmConnector['kind'][] = ['servicenow', 'generic_rest', 'internal'];
const AUTH_MODES: NonNullable<ItsmConnector['auth_mode']>[] = ['api_key', 'basic', 'oauth2', 'vault', 'none'];

const empty: ItsmConnector = {
  kind: 'servicenow',
  name: '',
  endpoint_url: '',
  auth_mode: 'api_key',
  auth_user: '',
  auth_secret: '',
  vault_path: '',
  payload_template: {},
  status_mapping: { 'In Progress': 'Deployed', 'Closed Complete': 'Certified', Cancelled: 'Rejected' },
  auto_submit_on_approval: false,
};

export default function ItsmConnectorsTab() {
  const [items, setItems] = useState<ItsmConnector[]>([]);
  const [editing, setEditing] = useState<ItsmConnector | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await api.listItsmConnectors());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const save = async () => {
    if (!editing) return;
    try {
      await api.upsertItsmConnector(editing);
      setEditing(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async (id?: string) => {
    if (!id) return;
    if (!confirm(`Delete ITSM connector ${id}?`)) return;
    try {
      await api.deleteItsmConnector(id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">ITSM Connectors</h3>
          <p className="text-xs text-gray-500">Configure REST endpoints for ServiceNow, internal CHG tools, or any generic REST tracker. Used by the "Submit to SNS" flow on approved rule requests.</p>
        </div>
        <button onClick={() => setEditing({ ...empty })}
          className="text-xs px-3 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-700">
          + New connector
        </button>
      </div>

      {error && <div className="rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">{error}</div>}

      {loading ? (
        <div className="text-xs text-gray-400 italic">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-xs text-gray-400 italic">No connectors configured.</div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left p-2">ID</th>
                <th className="text-left p-2">Name</th>
                <th className="text-left p-2">Kind</th>
                <th className="text-left p-2">Endpoint</th>
                <th className="text-left p-2">Auth</th>
                <th className="text-left p-2">Auto-submit</th>
                <th className="text-right p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.connector_id} className="border-t border-gray-100">
                  <td className="p-2 font-mono">{c.connector_id}</td>
                  <td className="p-2">{c.name || '—'}</td>
                  <td className="p-2">
                    <span className="px-1.5 py-0.5 rounded border border-indigo-200 bg-indigo-50 text-indigo-800 text-[10px] uppercase">{c.kind}</span>
                  </td>
                  <td className="p-2 font-mono text-[10px] text-gray-700 max-w-[260px] truncate" title={c.endpoint_url}>{c.endpoint_url}</td>
                  <td className="p-2">{c.auth_mode || 'none'}</td>
                  <td className="p-2">{c.auto_submit_on_approval ? 'yes' : 'no'}</td>
                  <td className="p-2 text-right space-x-2">
                    <button onClick={() => setEditing({ ...c, auth_secret: '' })}
                      className="text-[11px] px-2 py-0.5 rounded border border-gray-300 hover:bg-gray-50">Edit</button>
                    <button onClick={() => void remove(c.connector_id)}
                      className="text-[11px] px-2 py-0.5 rounded border border-rose-200 text-rose-700 hover:bg-rose-50">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="border border-indigo-200 bg-indigo-50/40 rounded-lg p-4 space-y-3">
          <div className="text-sm font-semibold text-indigo-900">{editing.connector_id ? 'Edit' : 'New'} connector</div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <label className="space-y-1">
              <span className="text-gray-700">Name</span>
              <input value={editing.name || ''}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                className="w-full border rounded px-2 py-1" placeholder="e.g. SNS ServiceNow Production" />
            </label>
            <label className="space-y-1">
              <span className="text-gray-700">Kind</span>
              <select value={editing.kind}
                onChange={(e) => setEditing({ ...editing, kind: e.target.value as ItsmConnector['kind'] })}
                className="w-full border rounded px-2 py-1">
                {KIND_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
            <label className="space-y-1 col-span-2">
              <span className="text-gray-700">Endpoint URL</span>
              <input value={editing.endpoint_url}
                onChange={(e) => setEditing({ ...editing, endpoint_url: e.target.value })}
                className="w-full border rounded px-2 py-1 font-mono"
                placeholder="https://servicenow.example.com/api/now/table/change_request" />
            </label>
            <label className="space-y-1">
              <span className="text-gray-700">Auth mode</span>
              <select value={editing.auth_mode || 'api_key'}
                onChange={(e) => setEditing({ ...editing, auth_mode: e.target.value as ItsmConnector['auth_mode'] })}
                className="w-full border rounded px-2 py-1">
                {AUTH_MODES.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-gray-700">Auto-submit on approval</span>
              <select value={editing.auto_submit_on_approval ? 'yes' : 'no'}
                onChange={(e) => setEditing({ ...editing, auto_submit_on_approval: e.target.value === 'yes' })}
                className="w-full border rounded px-2 py-1">
                <option value="no">No (manual)</option>
                <option value="yes">Yes</option>
              </select>
            </label>
            {editing.auth_mode !== 'vault' && editing.auth_mode !== 'none' && (
              <>
                <label className="space-y-1">
                  <span className="text-gray-700">Auth user / API key name</span>
                  <input value={editing.auth_user || ''}
                    onChange={(e) => setEditing({ ...editing, auth_user: e.target.value })}
                    className="w-full border rounded px-2 py-1" />
                </label>
                <label className="space-y-1">
                  <span className="text-gray-700">Auth secret (will be masked)</span>
                  <input type="password" value={editing.auth_secret || ''}
                    onChange={(e) => setEditing({ ...editing, auth_secret: e.target.value })}
                    placeholder={editing.connector_id ? 'leave blank to keep existing' : ''}
                    className="w-full border rounded px-2 py-1" />
                </label>
              </>
            )}
            {editing.auth_mode === 'vault' && (
              <label className="space-y-1 col-span-2">
                <span className="text-gray-700">Vault path</span>
                <input value={editing.vault_path || ''}
                  onChange={(e) => setEditing({ ...editing, vault_path: e.target.value })}
                  className="w-full border rounded px-2 py-1 font-mono"
                  placeholder="secret/data/itsm/servicenow" />
              </label>
            )}
            <label className="space-y-1 col-span-2">
              <span className="text-gray-700">Payload template (JSON, optional — uses default ServiceNow CHG mapping if empty)</span>
              <textarea rows={4}
                value={JSON.stringify(editing.payload_template || {}, null, 2)}
                onChange={(e) => {
                  try { setEditing({ ...editing, payload_template: JSON.parse(e.target.value || '{}') }); }
                  catch { /* keep typing */ }
                }}
                className="w-full border rounded px-2 py-1 font-mono text-[10px]" />
            </label>
            <label className="space-y-1 col-span-2">
              <span className="text-gray-700">Status mapping (external → NGDC)</span>
              <textarea rows={3}
                value={JSON.stringify(editing.status_mapping || {}, null, 2)}
                onChange={(e) => {
                  try { setEditing({ ...editing, status_mapping: JSON.parse(e.target.value || '{}') }); }
                  catch { /* keep typing */ }
                }}
                className="w-full border rounded px-2 py-1 font-mono text-[10px]" />
            </label>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button onClick={() => setEditing(null)}
              className="text-xs px-3 py-1 rounded border border-gray-300 hover:bg-gray-50">Cancel</button>
            <button onClick={() => void save()}
              className="text-xs px-3 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700">Save</button>
          </div>
        </div>
      )}
    </div>
  );
}
