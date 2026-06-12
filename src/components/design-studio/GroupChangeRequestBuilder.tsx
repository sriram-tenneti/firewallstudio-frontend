import { useEffect, useState } from 'react';
import * as api from '@/lib/api';
import type { FirewallGroup } from '@/types';

interface Props {
  environment?: string;
  onSubmitted?: (request_id?: string) => void;
}

type Op = 'create' | 'modify-add' | 'modify-remove' | 'delete';

export default function GroupChangeRequestBuilder({ environment = '', onSubmitted }: Props) {
  const [open, setOpen] = useState(false);
  const [op, setOp] = useState<Op>('modify-add');
  const [groupName, setGroupName] = useState('');
  const [members, setMembers] = useState('');
  const [description, setDescription] = useState('');
  const [groups, setGroups] = useState<FirewallGroup[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    api.getGroups().then(setGroups).catch(() => {});
  }, [open]);

  const reset = () => {
    setGroupName('');
    setMembers('');
    setDescription('');
    setOp('modify-add');
    setError(null);
  };

  const handleSubmit = async () => {
    setError(null);
    if (!groupName.trim()) {
      setError('Group name is required');
      return;
    }
    const memberList = members
      .split(/[\n,;\s]+/)
      .map(s => s.trim())
      .filter(Boolean);
    if ((op === 'create' || op === 'modify-add') && memberList.length === 0) {
      setError('Members are required for create / add operations');
      return;
    }
    if (op === 'modify-remove' && memberList.length === 0) {
      setError('Specify members to remove');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        op,
        group_name: groupName.trim(),
        added_members: op === 'create' || op === 'modify-add' ? memberList : [],
        removed_members: op === 'modify-remove' ? memberList : [],
        environment: environment || 'Production',
        description: description.trim() || undefined,
      };
      const res = await api.createGroupChangeRequest(payload);
      reset();
      setOpen(false);
      onSubmitted?.(res.request_id);
    } catch (e) {
      setError(String((e as Error)?.message || e));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs px-3 py-1.5 rounded border border-purple-400 bg-purple-50 text-purple-700 hover:bg-purple-100"
      >
        + New Group Change Request
      </button>
    );
  }

  return (
    <div className="bg-white border rounded-lg shadow-sm p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold text-slate-800">
          New Group Change Request
        </div>
        <button
          onClick={() => { setOpen(false); reset(); }}
          className="text-xs text-slate-500 hover:text-slate-800"
        >
          Cancel
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
            Operation
          </label>
          <select
            value={op}
            onChange={e => setOp(e.target.value as Op)}
            className="w-full text-xs border rounded px-2 py-1"
          >
            <option value="create">Create new group</option>
            <option value="modify-add">Add members to existing group</option>
            <option value="modify-remove">Remove members from existing group</option>
            <option value="delete">Delete group</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
            Group name (NGDC: <span className="font-mono">grp-…</span>)
          </label>
          {op === 'create' ? (
            <input
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              placeholder="grp-APP-NH02-CCS"
              className="w-full text-xs font-mono border rounded px-2 py-1"
            />
          ) : (
            <select
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              className="w-full text-xs font-mono border rounded px-2 py-1"
            >
              <option value="">Select group…</option>
              {groups.map(g => (
                <option key={g.name} value={g.name}>{g.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>
      {op !== 'delete' && (
        <div className="mt-3">
          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
            {op === 'modify-remove' ? 'Members to remove' : 'Members'} (one per line, IPs / CIDRs)
          </label>
          <textarea
            value={members}
            onChange={e => setMembers(e.target.value)}
            placeholder="10.20.30.40&#10;10.50.0.0/16"
            rows={3}
            className="w-full text-xs font-mono border rounded px-2 py-1"
          />
        </div>
      )}
      <div className="mt-3">
        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
          Justification / description
        </label>
        <input
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="CHG-####### — onboarding new app cluster …"
          className="w-full text-xs border rounded px-2 py-1"
        />
      </div>
      {error && (
        <div className="mt-2 text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1">
          {error}
        </div>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <button
          onClick={() => { setOpen(false); reset(); }}
          className="text-xs px-3 py-1.5 rounded border bg-white hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="text-xs px-3 py-1.5 rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : 'Submit change request'}
        </button>
      </div>
    </div>
  );
}
