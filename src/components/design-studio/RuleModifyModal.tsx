import { useState, useEffect } from 'react';
import { Modal } from '../shared/Modal';
import type { FirewallRule, RuleDelta, BirthrightValidation, FirewallGroup, Application, GroupMember } from '@/types';
import { validateBirthright, getGroup, getApplications, getFilteredNhSzDc, addGroupMember, removeGroupMember } from '@/lib/api';
import { autoPrefix } from '@/lib/utils';
import { detectEntryType } from '@/lib/nestingParser';

interface EntryItem {
  id: string;
  type: 'ip' | 'subnet' | 'range' | 'group';
  value: string;
  isNew?: boolean;
  isModified?: boolean;
}

export interface RuleModification {
  source_entries: EntryItem[];
  destination_entries: EntryItem[];
  ports: string;
  protocol: string;
  action: string;
  delta: RuleDelta;
}

interface RuleModifyModalProps {
  isOpen: boolean;
  onClose: () => void;
  rule: FirewallRule | null;
  onSave: (ruleId: string, changes: RuleModification) => void;
}

function getVal(obj: unknown, key: string): string {
  if (!obj) return '';
  if (typeof obj === 'string') return obj;
  if (typeof obj === 'object' && obj !== null) return (obj as Record<string, string>)[key] || '';
  return '';
}

// Use shared detectEntryType from nestingParser for consistency across all modules (Fix #1)
function detectType(value: string): 'ip' | 'subnet' | 'range' | 'group' {
  return detectEntryType(value);
}

function parseEntries(obj: unknown): EntryItem[] {
  if (!obj) return [];
  let mainValue = '';
  if (typeof obj === 'string') {
    mainValue = obj;
  } else if (typeof obj === 'object' && obj !== null) {
    const o = obj as Record<string, string>;
    mainValue = o.group_name || o.ip_address || o.cidr || o.name || o.dest_ip || '';
  }
  if (!mainValue) return [];
  return mainValue.split(',').map((v, i) => ({
    id: `entry-${i}`,
    type: detectType(v.trim()),
    value: v.trim(),
  }));
}

function parsePorts(rule: FirewallRule): string {
  const srcPorts = getVal(rule.source, 'ports');
  const dstPorts = getVal(rule.destination, 'ports');
  return srcPorts || dstPorts || '';
}

let nextId = 1;

function EntryEditor({ label, entries, onChange }: {
  label: string;
  entries: EntryItem[];
  onChange: (entries: EntryItem[]) => void;
}) {
  const [addType, setAddType] = useState<'ip' | 'subnet' | 'range' | 'group'>('ip');
  const [addValue, setAddValue] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const handleAdd = () => {
    if (!addValue.trim()) return;
    const prefixed = autoPrefix(addValue.trim(), addType);
    const newEntry: EntryItem = {
      id: `new-${nextId++}`,
      type: addType,
      value: prefixed,
      isNew: true,
    };
    onChange([...entries, newEntry]);
    setAddValue('');
  };

  const handleDelete = (id: string) => {
    onChange(entries.filter(e => e.id !== id));
  };

  const handleStartEdit = (entry: EntryItem) => {
    setEditingId(entry.id);
    setEditValue(entry.value);
  };

  const handleSaveEdit = (id: string) => {
    if (!editValue.trim()) return;
    const detectedType = detectType(editValue.trim());
    const prefixed = autoPrefix(editValue.trim(), detectedType === 'group' ? 'group' : detectedType === 'subnet' ? 'subnet' : detectedType === 'range' ? 'range' : 'ip');
    onChange(entries.map(e =>
      e.id === id ? { ...e, value: prefixed, type: detectedType, isModified: true } : e
    ));
    setEditingId(null);
    setEditValue('');
  };

  const typeColors: Record<string, string> = {
    ip: 'bg-blue-50 text-blue-700 border-blue-200',
    subnet: 'bg-purple-50 text-purple-700 border-purple-200',
    range: 'bg-orange-50 text-orange-700 border-orange-200',
    group: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  };
  const typeLabels: Record<string, string> = {
    ip: 'IP', subnet: 'NET', range: 'RNG', group: 'GRP',
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-800">{label}</h4>
        <span className="text-xs text-gray-500">{entries.length} entries</span>
      </div>

      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {entries.length === 0 && (
          <p className="text-xs text-gray-400 italic py-2">No entries. Add IPs, subnets, or groups below.</p>
        )}
        {entries.map(entry => (
          <div key={entry.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${entry.isNew ? 'bg-green-50 border-green-200' : entry.isModified ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`}>
            <span className={`px-1.5 py-0.5 text-[10px] font-bold uppercase rounded border ${typeColors[entry.type]}`}>{typeLabels[entry.type] || entry.type}</span>
            {editingId === entry.id ? (
              <div className="flex-1 flex gap-1.5">
                <input
                  type="text"
                  className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(entry.id); if (e.key === 'Escape') setEditingId(null); }}
                  autoFocus
                />
                <button onClick={() => handleSaveEdit(entry.id)} className="px-2 py-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded hover:bg-green-100">Save</button>
                <button onClick={() => setEditingId(null)} className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700">Cancel</button>
              </div>
            ) : (
              <>
                <span className="flex-1 text-sm font-mono text-gray-800">{entry.value}</span>
                {entry.isNew && <span className="text-[10px] text-green-600 font-medium">NEW</span>}
                {entry.isModified && <span className="text-[10px] text-amber-600 font-medium">MODIFIED</span>}
                <button onClick={() => handleStartEdit(entry)} className="px-2 py-0.5 text-xs text-blue-600 hover:bg-blue-50 rounded">Edit</button>
                <button onClick={() => handleDelete(entry.id)} className="px-2 py-0.5 text-xs text-red-600 hover:bg-red-50 rounded">Del</button>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2 pt-1 border-t border-gray-100">
        <select
          value={addType}
          onChange={e => setAddType(e.target.value as 'ip' | 'subnet' | 'range' | 'group')}
          className="px-2 py-1.5 text-xs font-medium border border-gray-300 rounded-md bg-white"
        >
          <option value="ip">IP (svr-)</option>
          <option value="subnet">Subnet (net-)</option>
          <option value="range">Range (rng-)</option>
          <option value="group">Group (grp-)</option>
        </select>
        <input
          type="text"
          placeholder={addType === 'ip' ? 'e.g. 10.0.1.5' : addType === 'subnet' ? 'e.g. 10.0.1.0/24' : addType === 'range' ? 'e.g. 10.0.1.1-10.0.1.50' : 'e.g. grp-APP01-NH01-STD-web'}
          value={addValue}
          onChange={e => setAddValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
          className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500"
        />
        <button onClick={handleAdd} disabled={!addValue.trim()} className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed">
          + Add
        </button>
      </div>
    </div>
  );
}

export function RuleModifyModal({ isOpen, onClose, rule, onSave }: RuleModifyModalProps) {
  const [sourceEntries, setSourceEntries] = useState<EntryItem[]>([]);
  const [destEntries, setDestEntries] = useState<EntryItem[]>([]);
  const [ports, setPorts] = useState('');
  const [protocol, setProtocol] = useState('TCP');
  const [action, setAction] = useState('Allow');
  const [activeSection, setActiveSection] = useState<'source' | 'destination' | 'service'>('source');
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [fwDeviceInfo, setFwDeviceInfo] = useState<BirthrightValidation | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, FirewallGroup>>({});
  const [loadingGroups, setLoadingGroups] = useState(false);
  // Fix #7: Track original group members for delta computation + editable group members
  const [originalGroupMembers, setOriginalGroupMembers] = useState<Record<string, GroupMember[]>>({});
  const [editedGroupMembers, setEditedGroupMembers] = useState<Record<string, GroupMember[]>>({});
  const [addingMemberTo, setAddingMemberTo] = useState<string | null>(null);
  const [newMemberType, setNewMemberType] = useState<GroupMember['type']>('ip');
  const [newMemberValue, setNewMemberValue] = useState('');
  // Fix #10: destination app display + app-filtered SZ
  const [applications, setApplications] = useState<Application[]>([]);
  const [destApp, setDestApp] = useState<string>('');
  const [appFilteredSZs, setAppFilteredSZs] = useState<string[]>([]);

  // Load applications for destination app display
  useEffect(() => {
    if (isOpen) {
      getApplications().then(apps => setApplications(apps)).catch(() => {});
    }
  }, [isOpen]);

  // When destApp changes, filter SZs by app management data
  useEffect(() => {
    if (destApp && rule) {
      const env = rule.environment || 'Production';
      getFilteredNhSzDc(env, destApp)
        .then(data => {
          setAppFilteredSZs(data.security_zones.map(sz => sz.code || sz.name));
        })
        .catch(() => setAppFilteredSZs([]));
    } else {
      setAppFilteredSZs([]);
    }
  }, [destApp, rule]);

  useEffect(() => {
    if (rule && isOpen) {
      setSourceEntries(parseEntries(rule.source));
      setDestEntries(parseEntries(rule.destination));
      setPorts(parsePorts(rule));
      setProtocol('TCP');
      setAction('Allow');
      setActiveSection('source');
      setFwDeviceInfo(null);
      setExpandedGroups({});
      // Detect destination app from rule data
      setDestApp(rule.application || '');
      // Auto-fetch group members for source/dest groups
      const groupNames: string[] = [];
      const srcParsed = parseEntries(rule.source);
      const dstParsed = parseEntries(rule.destination);
      [...srcParsed, ...dstParsed].forEach(e => {
        if (e.value.startsWith('grp-') || e.value.startsWith('g-')) groupNames.push(e.value);
      });
      if (groupNames.length > 0) {
        setLoadingGroups(true);
        Promise.allSettled(groupNames.map(n => getGroup(n)))
          .then(results => {
            const map: Record<string, FirewallGroup> = {};
            const origMembers: Record<string, GroupMember[]> = {};
            results.forEach((r, i) => {
              if (r.status === 'fulfilled') {
                map[groupNames[i]] = r.value;
                origMembers[groupNames[i]] = r.value.members.map(m => ({ ...m }));
              }
            });
            setExpandedGroups(map);
            setOriginalGroupMembers(origMembers);
            setEditedGroupMembers(origMembers);
          })
          .finally(() => setLoadingGroups(false));
      }
      // Auto-fetch FW device info based on rule's zones
      const srcZone = getVal(rule.source, 'security_zone');
      const dstZone = getVal(rule.destination, 'security_zone');
      const srcNh = getVal(rule.source, 'neighbourhood');
      const env = rule.environment || 'Production';
      const dc = rule.datacenter || '';
      if (srcZone || dstZone) {
        validateBirthright({
          source_zone: srcZone, destination_zone: dstZone,
          source_sz: srcZone, destination_sz: dstZone,
          source_nh: srcNh, destination_nh: '',
          source_dc: dc, destination_dc: dc,
          environment: env,
        }).then(r => setFwDeviceInfo(r)).catch(() => {});
      }
    }
  }, [rule, isOpen]);

  if (!rule) return null;

  // Fix #7: Add/remove members from groups with delta tracking
  const handleAddMemberToGroup = async (groupName: string) => {
    if (!newMemberValue.trim()) return;
    const prefixed = autoPrefix(newMemberValue.trim(), newMemberType);
    const member: GroupMember = { type: newMemberType, value: prefixed, description: '' };
    // Update local edited state
    setEditedGroupMembers(prev => ({
      ...prev,
      [groupName]: [...(prev[groupName] || []), member],
    }));
    // Persist to backend
    try {
      await addGroupMember(groupName, member);
    } catch { /* will be retried on save */ }
    setNewMemberValue('');
    setAddingMemberTo(null);
  };

  const handleRemoveMemberFromGroup = async (groupName: string, memberValue: string) => {
    setEditedGroupMembers(prev => ({
      ...prev,
      [groupName]: (prev[groupName] || []).filter(m => m.value !== memberValue),
    }));
    // Persist to backend
    try {
      await removeGroupMember(groupName, memberValue);
    } catch { /* will be retried on save */ }
  };

  const handleSave = () => {
    onSave(rule.rule_id, {
      source_entries: sourceEntries,
      destination_entries: destEntries,
      ports,
      protocol,
      action,
      delta: computeDelta(),
    });
    onClose();
  };

  // Compute full delta for display (Fix #7: includes group member changes)
  const computeDelta = (): RuleDelta => {
    const delta: RuleDelta = { added: {}, removed: {}, changed: {} };
    const origSrc = parseEntries(rule.source);
    const origDst = parseEntries(rule.destination);
    const origPorts = parsePorts(rule);
    const origSrcVals = new Set(origSrc.map(e => e.value));
    const curSrcVals = new Set(sourceEntries.map(e => e.value));
    const addedSrc = sourceEntries.filter(e => !origSrcVals.has(e.value)).map(e => e.value);
    const removedSrc = origSrc.filter(e => !curSrcVals.has(e.value)).map(e => e.value);
    if (addedSrc.length) delta.added['source'] = addedSrc;
    if (removedSrc.length) delta.removed['source'] = removedSrc;
    const origDstVals = new Set(origDst.map(e => e.value));
    const curDstVals = new Set(destEntries.map(e => e.value));
    const addedDst = destEntries.filter(e => !origDstVals.has(e.value)).map(e => e.value);
    const removedDst = origDst.filter(e => !curDstVals.has(e.value)).map(e => e.value);
    if (addedDst.length) delta.added['destination'] = addedDst;
    if (removedDst.length) delta.removed['destination'] = removedDst;
    const modifiedSrc = sourceEntries.filter(e => e.isModified).map(e => e.value);
    const modifiedDst = destEntries.filter(e => e.isModified).map(e => e.value);
    if (modifiedSrc.length) delta.changed['source_modified'] = { from: 'original', to: modifiedSrc.join(', ') };
    if (modifiedDst.length) delta.changed['destination_modified'] = { from: 'original', to: modifiedDst.join(', ') };
    if (ports !== origPorts) delta.changed['ports'] = { from: origPorts || '(none)', to: ports || '(none)' };
    if (protocol !== 'TCP') delta.changed['protocol'] = { from: 'TCP', to: protocol };
    if (action !== 'Allow') delta.changed['action'] = { from: 'Allow', to: action };
    // Fix #7: Track group member add/remove in deltas
    for (const [grpName, editedMembers] of Object.entries(editedGroupMembers)) {
      const origMembers = originalGroupMembers[grpName] || [];
      const origVals = new Set(origMembers.map(m => m.value));
      const editVals = new Set(editedMembers.map(m => m.value));
      const addedMembers = editedMembers.filter(m => !origVals.has(m.value)).map(m => m.value);
      const removedMembers = origMembers.filter(m => !editVals.has(m.value)).map(m => m.value);
      if (addedMembers.length) delta.added[`group:${grpName}`] = addedMembers;
      if (removedMembers.length) delta.removed[`group:${grpName}`] = removedMembers;
    }
    return delta;
  };
  const currentDelta = computeDelta();
  const hasDeltaChanges = Object.keys(currentDelta.added).length > 0 || Object.keys(currentDelta.removed).length > 0 || Object.keys(currentDelta.changed).length > 0;

  const sectionTabs = [
    { id: 'source' as const, label: 'Source', count: sourceEntries.length },
    { id: 'destination' as const, label: 'Destination', count: destEntries.length },
    { id: 'service' as const, label: 'Service / Ports', count: null },
  ];

  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Modify Rule: ${rule.rule_id}`} subtitle={`${rule.application} | ${rule.environment}${destApp && destApp !== rule.application ? ` | Dest: ${destApp}` : ''}`} size="lg">
      <div className="space-y-4">
        {/* Edit / Preview toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center border border-gray-300 rounded-md overflow-hidden">
            <button onClick={() => setViewMode('edit')} className={`px-3 py-1.5 text-xs font-medium ${viewMode === 'edit' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>Edit</button>
            <button onClick={() => setViewMode('preview')} className={`px-3 py-1.5 text-xs font-medium ${viewMode === 'preview' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              Preview Changes{hasDeltaChanges ? ` (${Object.keys(currentDelta.added).length + Object.keys(currentDelta.removed).length + Object.keys(currentDelta.changed).length})` : ''}
            </button>
          </div>
          {viewMode === 'preview' && !hasDeltaChanges && (
            <span className="text-xs text-gray-400 italic">No changes yet</span>
          )}
        </div>

        {viewMode === 'edit' ? (
          <>
            <div className="flex border-b border-gray-200">
              {sectionTabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveSection(tab.id)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeSection === tab.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                >
                  {tab.label}
                  {tab.count !== null && <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold bg-gray-100 text-gray-600 rounded-full">{tab.count}</span>}
                </button>
              ))}
            </div>

            {activeSection === 'source' && (
              <>
                <EntryEditor label="Source Entries" entries={sourceEntries} onChange={setSourceEntries} />
                {/* Expanded group members for source (Fix #7: editable) */}
                {sourceEntries.filter(e => expandedGroups[e.value]).map(e => {
                  const members = editedGroupMembers[e.value] || expandedGroups[e.value].members;
                  const origVals = new Set((originalGroupMembers[e.value] || []).map(m => m.value));
                  return (
                  <div key={e.value} className="mt-2 border border-emerald-200 rounded-lg overflow-hidden">
                    <div className="px-3 py-1.5 bg-emerald-50 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-emerald-100 text-emerald-700">GROUP</span>
                        <span className="text-xs font-mono font-medium text-gray-800">{e.value}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500">{members.length} member{members.length !== 1 ? 's' : ''}</span>
                        <button onClick={() => { setAddingMemberTo(addingMemberTo === e.value ? null : e.value); setNewMemberValue(''); }} className="px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 bg-emerald-100 rounded hover:bg-emerald-200">+ Add</button>
                      </div>
                    </div>
                    {addingMemberTo === e.value && (
                      <div className="px-3 py-2 bg-emerald-50 border-b border-emerald-200 flex gap-2">
                        <select value={newMemberType} onChange={ev => setNewMemberType(ev.target.value as GroupMember['type'])} className="px-1.5 py-1 text-xs border border-gray-300 rounded bg-white">
                          <option value="ip">IP</option><option value="subnet">Subnet</option><option value="range">Range</option><option value="group">Group</option>
                        </select>
                        <input type="text" placeholder="Value..." value={newMemberValue} onChange={ev => setNewMemberValue(ev.target.value)}
                          onKeyDown={ev => { if (ev.key === 'Enter') handleAddMemberToGroup(e.value); }}
                          className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-emerald-500" />
                        <button onClick={() => handleAddMemberToGroup(e.value)} disabled={!newMemberValue.trim()} className="px-2 py-1 text-xs font-medium text-white bg-emerald-600 rounded hover:bg-emerald-700 disabled:bg-gray-300">Add</button>
                      </div>
                    )}
                    <div className="px-3 py-1.5 bg-gray-900 max-h-32 overflow-y-auto">
                      {members.map((m, i) => (
                        <div key={i} className="flex items-center gap-2 py-0.5 group">
                          <span className={`px-1 py-0.5 text-[8px] font-bold uppercase rounded ${m.type === 'ip' ? 'bg-blue-100 text-blue-700' : m.type === 'range' ? 'bg-orange-100 text-orange-700' : m.type === 'subnet' || m.type === 'cidr' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'}`}>{m.type === 'ip' ? 'IP' : m.type === 'subnet' || m.type === 'cidr' ? 'NET' : m.type === 'range' ? 'RNG' : 'GRP'}</span>
                          <span className="flex-1 text-xs font-mono text-green-400">{m.value}</span>
                          {!origVals.has(m.value) && <span className="text-[9px] text-green-400 font-medium">NEW</span>}
                          <button onClick={() => handleRemoveMemberFromGroup(e.value, m.value)} className="px-1 py-0.5 text-[9px] text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity">Del</button>
                        </div>
                      ))}
                    </div>
                  </div>
                  );
                })}
                {loadingGroups && <p className="text-xs text-gray-400 italic mt-1">Loading group members...</p>}
              </>
            )}

            {activeSection === 'destination' && (
              <>
                {/* Destination App selector + app-filtered SZs */}
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-purple-700 mb-1">Destination Application</label>
                      <select
                        className="w-full px-2 py-1.5 text-sm border border-purple-300 rounded-md bg-white focus:ring-1 focus:ring-purple-500"
                        value={destApp}
                        onChange={e => setDestApp(e.target.value)}
                      >
                        <option value="">Same as Source ({rule.application})</option>
                        {applications.map(app => (
                          <option key={app.app_distributed_id || app.app_id} value={app.app_distributed_id || app.app_id}>
                            {app.app_distributed_id || app.app_id}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-purple-700 mb-1">App-Filtered Security Zones</label>
                      {appFilteredSZs.length > 0 ? (
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {appFilteredSZs.map(sz => (
                            <span key={sz} className="px-1.5 py-0.5 text-[10px] font-medium bg-purple-100 text-purple-700 rounded">{sz}</span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-gray-400 italic mt-1">Select a destination app to filter SZs by App Management data</p>
                      )}
                    </div>
                  </div>
                </div>
                <EntryEditor label="Destination Entries" entries={destEntries} onChange={setDestEntries} />
                {/* Expanded group members for destination (Fix #7: editable) */}
                {destEntries.filter(e => expandedGroups[e.value]).map(e => {
                  const members = editedGroupMembers[e.value] || expandedGroups[e.value].members;
                  const origVals = new Set((originalGroupMembers[e.value] || []).map(m => m.value));
                  return (
                  <div key={e.value} className="mt-2 border border-emerald-200 rounded-lg overflow-hidden">
                    <div className="px-3 py-1.5 bg-emerald-50 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-emerald-100 text-emerald-700">GROUP</span>
                        <span className="text-xs font-mono font-medium text-gray-800">{e.value}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500">{members.length} member{members.length !== 1 ? 's' : ''}</span>
                        <button onClick={() => { setAddingMemberTo(addingMemberTo === e.value ? null : e.value); setNewMemberValue(''); }} className="px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 bg-emerald-100 rounded hover:bg-emerald-200">+ Add</button>
                      </div>
                    </div>
                    {addingMemberTo === e.value && (
                      <div className="px-3 py-2 bg-emerald-50 border-b border-emerald-200 flex gap-2">
                        <select value={newMemberType} onChange={ev => setNewMemberType(ev.target.value as GroupMember['type'])} className="px-1.5 py-1 text-xs border border-gray-300 rounded bg-white">
                          <option value="ip">IP</option><option value="subnet">Subnet</option><option value="range">Range</option><option value="group">Group</option>
                        </select>
                        <input type="text" placeholder="Value..." value={newMemberValue} onChange={ev => setNewMemberValue(ev.target.value)}
                          onKeyDown={ev => { if (ev.key === 'Enter') handleAddMemberToGroup(e.value); }}
                          className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-emerald-500" />
                        <button onClick={() => handleAddMemberToGroup(e.value)} disabled={!newMemberValue.trim()} className="px-2 py-1 text-xs font-medium text-white bg-emerald-600 rounded hover:bg-emerald-700 disabled:bg-gray-300">Add</button>
                      </div>
                    )}
                    <div className="px-3 py-1.5 bg-gray-900 max-h-32 overflow-y-auto">
                      {members.map((m, i) => (
                        <div key={i} className="flex items-center gap-2 py-0.5 group">
                          <span className={`px-1 py-0.5 text-[8px] font-bold uppercase rounded ${m.type === 'ip' ? 'bg-blue-100 text-blue-700' : m.type === 'range' ? 'bg-orange-100 text-orange-700' : m.type === 'subnet' || m.type === 'cidr' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'}`}>{m.type === 'ip' ? 'IP' : m.type === 'subnet' || m.type === 'cidr' ? 'NET' : m.type === 'range' ? 'RNG' : 'GRP'}</span>
                          <span className="flex-1 text-xs font-mono text-green-400">{m.value}</span>
                          {!origVals.has(m.value) && <span className="text-[9px] text-green-400 font-medium">NEW</span>}
                          <button onClick={() => handleRemoveMemberFromGroup(e.value, m.value)} className="px-1 py-0.5 text-[9px] text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity">Del</button>
                        </div>
                      ))}
                    </div>
                  </div>
                  );
                })}
                {loadingGroups && <p className="text-xs text-gray-400 italic mt-1">Loading group members...</p>}
              </>
            )}

            {activeSection === 'service' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ports</label>
                  <input className={inputClass} placeholder="e.g. 443, 8080-8090, 80,443" value={ports} onChange={e => setPorts(e.target.value)} />
                  <p className="text-xs text-gray-400 mt-1">Comma-separated ports or ranges (e.g. 80,443,8080-8090)</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Protocol</label>
                    <select className={inputClass} value={protocol} onChange={e => setProtocol(e.target.value)}>
                      <option value="TCP">TCP</option>
                      <option value="UDP">UDP</option>
                      <option value="ICMP">ICMP</option>
                      <option value="ANY">ANY</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
                    <select className={inputClass} value={action} onChange={e => setAction(e.target.value)}>
                      <option value="Allow">Allow</option>
                      <option value="Deny">Deny</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Inline delta while editing */}
            <div className={`border rounded-lg p-3 ${hasDeltaChanges ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}>
              <h4 className={`text-sm font-semibold mb-2 ${hasDeltaChanges ? 'text-blue-800' : 'text-gray-500'}`}>
                Change Delta {hasDeltaChanges ? '' : '(No changes yet)'}
              </h4>
              {hasDeltaChanges ? (
                <div className="space-y-2">
                  {Object.keys(currentDelta.added).length > 0 && (
                    <div>
                      <h5 className="text-xs font-semibold text-green-700 mb-1">Added</h5>
                      {Object.entries(currentDelta.added).map(([field, values]) => (
                        <div key={field} className="ml-2">
                          <span className="text-xs text-gray-500">{field}:</span>
                          {values.map((v, i) => (
                            <div key={i} className="text-xs text-green-700 font-mono ml-2">+ {v}</div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                  {Object.keys(currentDelta.removed).length > 0 && (
                    <div>
                      <h5 className="text-xs font-semibold text-red-700 mb-1">Removed</h5>
                      {Object.entries(currentDelta.removed).map(([field, values]) => (
                        <div key={field} className="ml-2">
                          <span className="text-xs text-gray-500">{field}:</span>
                          {values.map((v, i) => (
                            <div key={i} className="text-xs text-red-700 font-mono ml-2">- {v}</div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                  {Object.keys(currentDelta.changed).length > 0 && (
                    <div>
                      <h5 className="text-xs font-semibold text-blue-700 mb-1">Changed</h5>
                      {Object.entries(currentDelta.changed).map(([field, change]) => (
                        <div key={field} className="ml-2 text-xs">
                          <span className="text-gray-500">{field.replace(/_/g, ' ')}:</span>
                          <span className="text-red-600 line-through ml-1">{change.from}</span>
                          <span className="mx-1">&rarr;</span>
                          <span className="text-green-600">{change.to}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">Make changes to source, destination, or service to see the delta here.</p>
              )}
            </div>
          </>
        ) : (
          /* Preview Mode: Delta-only view for reviewers */
          <div className="space-y-4">
            {hasDeltaChanges ? (
              <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
                <h3 className="text-sm font-semibold text-blue-800 mb-3">Changes Only (Delta Preview)</h3>
                <div className="space-y-3">
                  {Object.keys(currentDelta.added).length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-green-700 mb-1">Added</h4>
                      {Object.entries(currentDelta.added).map(([field, values]) => (
                        <div key={field} className="ml-2">
                          <span className="text-xs font-medium text-gray-600">{field}:</span>
                          {values.map((v, i) => (
                            <div key={i} className="text-sm text-green-700 font-mono ml-3 bg-green-50 px-2 py-0.5 rounded my-0.5">+ {v}</div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                  {Object.keys(currentDelta.removed).length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-red-700 mb-1">Removed</h4>
                      {Object.entries(currentDelta.removed).map(([field, values]) => (
                        <div key={field} className="ml-2">
                          <span className="text-xs font-medium text-gray-600">{field}:</span>
                          {values.map((v, i) => (
                            <div key={i} className="text-sm text-red-700 font-mono ml-3 bg-red-50 px-2 py-0.5 rounded my-0.5 line-through">- {v}</div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                  {Object.keys(currentDelta.changed).length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-blue-700 mb-1">Changed</h4>
                      {Object.entries(currentDelta.changed).map(([field, change]) => (
                        <div key={field} className="ml-2 py-1">
                          <span className="text-xs font-medium text-gray-600">{field.replace(/_/g, ' ')}:</span>
                          <div className="ml-3 mt-0.5">
                            <span className="text-sm text-red-600 line-through font-mono">{change.from}</span>
                            <span className="mx-2 text-gray-400">&rarr;</span>
                            <span className="text-sm text-green-600 font-mono">{change.to}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg p-6 bg-gray-50 text-center">
                <p className="text-sm text-gray-500">No changes to preview yet.</p>
                <p className="text-xs text-gray-400 mt-1">Switch to Edit mode to make changes.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* FW Device Deployment Info */}
      {fwDeviceInfo && hasDeltaChanges && (
        <div className="mt-4 border border-indigo-200 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-indigo-50 border-b border-indigo-200">
            <h4 className="text-sm font-semibold text-indigo-800">Firewall Device Deployment</h4>
            <p className="text-[10px] text-indigo-600 mt-0.5">Changes will be deployed to these FW devices</p>
          </div>
          <div className="p-3 space-y-2">
            {fwDeviceInfo.firewall_devices_needed && fwDeviceInfo.firewall_devices_needed.length > 0 ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {fwDeviceInfo.firewall_devices_needed.map((dev, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-white border border-indigo-200 text-xs font-mono text-indigo-800">
                      <span className="w-2 h-2 rounded-full bg-indigo-500" />
                      {dev}
                    </span>
                  ))}
                </div>
                {/* Group update commands per device */}
                <div className="mt-2 bg-gray-900 rounded-lg p-3">
                  <div className="text-[10px] text-gray-400 font-semibold uppercase mb-2">Group Update Commands</div>
                  {fwDeviceInfo.firewall_devices_needed.map((dev, i) => {
                    const addedSrc = sourceEntries.filter(e => e.isNew).map(e => e.value);
                    const addedDst = destEntries.filter(e => e.isNew).map(e => e.value);
                    const removedSrcSet = new Set(parseEntries(rule!.source).map(e => e.value));
                    const removedSrc = [...removedSrcSet].filter(v => !new Set(sourceEntries.map(e => e.value)).has(v));
                    const removedDstSet = new Set(parseEntries(rule!.destination).map(e => e.value));
                    const removedDst = [...removedDstSet].filter(v => !new Set(destEntries.map(e => e.value)).has(v));
                    return (
                      <div key={i} className="mb-2">
                        <div className="text-xs text-indigo-400 font-medium mb-1"># {dev}</div>
                        {addedSrc.map((ip, j) => (
                          <div key={`as-${j}`} className="text-xs font-mono text-green-400">set address-group source add member {ip}</div>
                        ))}
                        {addedDst.map((ip, j) => (
                          <div key={`ad-${j}`} className="text-xs font-mono text-green-400">set address-group destination add member {ip}</div>
                        ))}
                        {removedSrc.map((ip, j) => (
                          <div key={`rs-${j}`} className="text-xs font-mono text-red-400">set address-group source remove member {ip}</div>
                        ))}
                        {removedDst.map((ip, j) => (
                          <div key={`rd-${j}`} className="text-xs font-mono text-red-400">set address-group destination remove member {ip}</div>
                        ))}
                        {addedSrc.length === 0 && addedDst.length === 0 && removedSrc.length === 0 && removedDst.length === 0 && (
                          <div className="text-xs font-mono text-gray-500"># No group member changes for this device</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : fwDeviceInfo.firewall_path_info && fwDeviceInfo.firewall_path_info.length > 0 ? (
              <div className="p-2 bg-blue-50 rounded-lg">
                <div className="text-xs text-blue-700 font-medium mb-1">Traffic Path (informational — no FW rule deployment needed)</div>
                <div className="flex items-center gap-1 flex-wrap">
                  {fwDeviceInfo.firewall_path_info.map((fw, i) => (
                    <span key={i} className="inline-flex items-center gap-1">
                      {i > 0 && <span className="text-gray-400 text-xs">&rarr;</span>}
                      <span className="px-2 py-0.5 rounded bg-white border border-blue-200 text-xs font-mono text-blue-700">{fw}</span>
                    </span>
                  ))}
                </div>
                <div className="text-[10px] text-blue-500 mt-1">Permitted per birthright — group changes applied locally only</div>
              </div>
            ) : (
              <div className="text-xs text-gray-500 italic">No firewall device deployment required — same zone permitted traffic</div>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
        <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
        <button onClick={handleSave} disabled={!hasDeltaChanges} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
          {fwDeviceInfo?.firewall_devices_needed?.length ? 'Save & Deploy to FW Devices' : 'Save Changes'}
        </button>
      </div>
    </Modal>
  );
}
