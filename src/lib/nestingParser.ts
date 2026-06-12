/**
 * Shared nesting parser for Source/Destination expanded text.
 *
 * This module is the single source of truth for converting raw + expanded
 * text into a structured hierarchy.  It is used by:
 *   - FirewallManagementPage (View detail modal + Modify modal)
 *   - MigrationStudioPage (detail modal)
 *   - LegacyRuleDetailModal
 *
 * Nesting rules (mirrors Excel dump semantics):
 *   1. Indented hierarchy  – child groups are detected by deeper indentation;
 *      when indentation returns to the parent-member level, entries belong to
 *      the parent group again.
 *   2. Flat expansion       – all entries at the same indent.  The raw
 *      Source/Destination column is used to distinguish parent-level leaves
 *      (present in raw) from sub-group children (not present in raw).
 *   3. Multiple top-level groups – each raw group-valued entry after the
 *      current parent already has members starts a new top-level group.
 */

import type { FirewallGroup } from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────

export interface GroupMemberEntry {
  type: string;
  value: string;
  children?: GroupMemberEntry[];
}

export interface ResourceEntry {
  id: string;
  type: 'ip' | 'subnet' | 'range' | 'group';
  value: string;
  groupMembers?: GroupMemberEntry[];
  isNew?: boolean;
  isModified?: boolean;
}

export type DisplayLine = {
  text: string;
  indent: number;
  type: 'group' | 'ip' | 'subnet' | 'range';
};

// ── Constants ──────────────────────────────────────────────────────────────

const IP_REGEX = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const CIDR_REGEX = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/;

const LEGACY_GROUP_PREFIXES = [
  'g-', 'grp-', 'ggrp-', 'gapigr-', 'grp_', 'g_',
  'group-', 'group_', 'netgrp-', 'netgrp_', 'addrgrp-',
];

// ── Helpers ────────────────────────────────────────────────────────────────

export function isLegacyGroupName(name: string): boolean {
  const lower = name.trim().toLowerCase();
  return LEGACY_GROUP_PREFIXES.some(pfx => lower.startsWith(pfx));
}

export function detectEntryType(value: string, allGroupNames?: Set<string>): 'ip' | 'subnet' | 'range' | 'group' {
  const v = value.trim();
  const vl = v.toLowerCase();
  if (isLegacyGroupName(v)) return 'group';
  if (allGroupNames && allGroupNames.has(v)) return 'group';
  if (vl.includes('-networks') || vl.includes('_networks') || vl.includes('-global')
      || vl.includes('_global') || vl.endsWith('-svrs') || vl.endsWith('-servers')
      || vl.startsWith('gapingr-') || vl.startsWith('dcms') || vl.startsWith('dcma-')
      || vl.startsWith('protected-')) return 'group';
  if (vl.startsWith('grp-')) return 'group';
  if (vl.startsWith('rng-')) return 'range';
  if (vl.startsWith('net-')) return 'subnet';
  if (vl.startsWith('sub-')) return 'subnet';
  if (vl.startsWith('svr-')) return 'ip';
  if (vl.startsWith('gsvr-')) return 'ip';
  if (CIDR_REGEX.test(v)) return 'subnet';
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\s*-\s*\d/.test(v)) return 'range';
  if (IP_REGEX.test(v)) return 'ip';
  if (v.includes('/')) return 'subnet';
  if (vl.startsWith('rmg-')) return 'range';
  return 'ip';
}

// ── Core parser ────────────────────────────────────────────────────────────

export function parseToResourceEntries(raw: string, groups: FirewallGroup[], expanded?: string): ResourceEntry[] {
  if (!raw && !expanded) return [];
  const groupNameSet = new Set(groups.map(g => g.name));

  const rawValues = new Set(
    (raw || '').split('\n').map(l => l.trim()).filter(Boolean)
  );

  if (expanded && expanded.trim()) {
    const parsedLines: { indent: number; value: string }[] = [];
    for (const line of expanded.split('\n')) {
      if (!line.trim()) continue;
      const indent = line.startsWith('\t')
        ? (line.length - line.replace(/^\t+/, '').length) * 4
        : line.length - line.trimStart().length;
      const v = line.trim();
      const valueClean = v.includes('(') ? v.substring(0, v.indexOf('(')).trim() : v;
      if (valueClean) parsedLines.push({ indent, value: valueClean });
    }

    if (parsedLines.length === 0) return [];

    const expandedValues = new Set(parsedLines.map(p => p.value));

    const expansionHasExtraValues = (() => {
      for (const ev of expandedValues) {
        if (!rawValues.has(ev)) return true;
      }
      return false;
    })();
    const isSourceGroupByComparison = (val: string) =>
      rawValues.has(val) && expansionHasExtraValues && rawValues.size < expandedValues.size;

    const hasChildren = (idx: number) => idx + 1 < parsedLines.length && parsedLines[idx + 1].indent > parsedLines[idx].indent;
    const isKnownGroup = (val: string) => groupNameSet.has(val) || groups.some(g => g.name === val);
    const isGroupEntry = (idx: number, val: string) =>
      hasChildren(idx) || isKnownGroup(val) || isSourceGroupByComparison(val);

    const entries: ResourceEntry[] = [];
    let currentGroup: ResourceEntry | null = null;
    let currentSubGroup: GroupMemberEntry | null = null;
    let groupIndent = 0;
    let memberIndent = 0;

    for (let i = 0; i < parsedLines.length; i++) {
      const { indent, value } = parsedLines[i];

      if (currentGroup === null) {
        if (isGroupEntry(i, value)) {
          const matchedGroup = groups.find(g => g.name === value);
          currentGroup = {
            id: `entry-${entries.length}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: 'group',
            value,
            groupMembers: matchedGroup
              ? matchedGroup.members.map(m => ({ type: m.type, value: m.value }))
              : [],
          };
          currentSubGroup = null;
          groupIndent = indent;
          memberIndent = hasChildren(i) ? parsedLines[i + 1].indent : indent;
        } else {
          const type = detectEntryType(value, groupNameSet);
          entries.push({
            id: `entry-${entries.length}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type,
            value,
          });
        }
        continue;
      }

      const isFlatExpansion = memberIndent === groupIndent;
      const currentMemberType = detectEntryType(value, groupNameSet);
      const currentGroupHasMembers = (currentGroup.groupMembers || []).length > 0;
      const startsNextFlatTopLevelGroup = isFlatExpansion
        && rawValues.has(value)
        && currentMemberType === 'group'
        && currentGroupHasMembers;
      const isStillMember = isFlatExpansion
        ? !startsNextFlatTopLevelGroup
        : indent > groupIndent;

      if (!isStillMember) {
        entries.push(currentGroup);
        currentGroup = null;
        currentSubGroup = null;
        if (isGroupEntry(i, value)) {
          const matchedGroup = groups.find(g => g.name === value);
          currentGroup = {
            id: `entry-${entries.length}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: 'group',
            value,
            groupMembers: matchedGroup
              ? matchedGroup.members.map(m => ({ type: m.type, value: m.value }))
              : [],
          };
          currentSubGroup = null;
          groupIndent = indent;
          memberIndent = hasChildren(i) ? parsedLines[i + 1].indent : indent;
        } else {
          const type = detectEntryType(value, groupNameSet);
          entries.push({
            id: `entry-${entries.length}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type,
            value,
          });
        }
        continue;
      }

      const memberType = currentMemberType;
      const mType = memberType === 'group' ? 'group' : memberType === 'subnet' ? 'subnet' : memberType === 'range' ? 'range' : 'ip';

      if (!isFlatExpansion && indent <= memberIndent) {
        currentSubGroup = null;
      }

      if (!isFlatExpansion && indent >= memberIndent && hasChildren(i)) {
        const subGroupEntry: GroupMemberEntry = { type: 'group', value, children: [] };
        currentSubGroup = subGroupEntry;
        if (!currentGroup.groupMembers) currentGroup.groupMembers = [];
        currentGroup.groupMembers.push(subGroupEntry);
      } else if (!isFlatExpansion && currentSubGroup !== null && indent > memberIndent) {
        if (!currentSubGroup.children) currentSubGroup.children = [];
        currentSubGroup.children.push({ type: mType, value });
      } else if (mType === 'group') {
        const subGroupEntry: GroupMemberEntry = { type: 'group', value, children: [] };
        currentSubGroup = subGroupEntry;
        if (!currentGroup.groupMembers) currentGroup.groupMembers = [];
        currentGroup.groupMembers.push(subGroupEntry);
      } else if (isFlatExpansion && currentSubGroup !== null) {
        if (rawValues.has(value)) {
          currentSubGroup = null;
          if (!currentGroup.groupMembers) currentGroup.groupMembers = [];
          currentGroup.groupMembers.push({ type: mType, value });
        } else {
          if (!currentSubGroup.children) currentSubGroup.children = [];
          currentSubGroup.children.push({ type: mType, value });
        }
      } else {
        if (!currentGroup.groupMembers) currentGroup.groupMembers = [];
        currentGroup.groupMembers.push({ type: mType, value });
      }
    }
    if (currentGroup) entries.push(currentGroup);
    return entries;
  }

  // Fallback: parse flat raw text (no expansion column available)
  return raw.split('\n').filter(Boolean).map((line, i) => {
    const v = line.trim();
    const type = detectEntryType(v, groupNameSet);
    const matchedGroup = type === 'group' ? groups.find(g => g.name === v) : undefined;
    return {
      id: `entry-${i}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      value: v,
      groupMembers: matchedGroup
        ? matchedGroup.members.map(m => ({ type: m.type, value: m.value }))
        : type === 'group' ? [] : undefined,
    };
  });
}

// ── Display helpers ────────────────────────────────────────────────────────

function normalizeType(type: string): 'group' | 'ip' | 'subnet' | 'range' {
  if (type === 'group' || type === 'subnet' || type === 'range') return type;
  return 'ip';
}

export function entriesToDisplayLines(entries: ResourceEntry[], level = 0): DisplayLine[] {
  const lines: DisplayLine[] = [];
  for (const entry of entries) {
    lines.push({ text: entry.value, indent: level, type: normalizeType(entry.type) });
    if (entry.type === 'group') {
      for (const member of (entry.groupMembers || [])) {
        lines.push({ text: member.value, indent: level + 1, type: normalizeType(member.type) });
        if (member.type === 'group' && member.children) {
          for (const child of member.children) {
            lines.push({ text: child.value, indent: level + 2, type: normalizeType(child.type) });
          }
        }
      }
    }
  }
  return lines;
}

/**
 * Convenience: parse raw + expanded text and return DisplayLine[] for rendering.
 * This is the single entry point for View detail modals across all pages.
 */
export function parseExpandedToDisplayLines(raw: string, expanded: string): DisplayLine[] {
  // When expanded/details column is empty, fall back to raw source/destination column
  if (!expanded || !expanded.trim()) {
    if (!raw || !raw.trim()) return [];
    // Parse raw text as flat entries (no hierarchy, just list each value)
    return raw.split('\n').filter(l => l.trim()).map(line => {
      const v = line.trim();
      const type = detectEntryType(v);
      return { text: v, indent: 0, type: type === 'group' ? 'group' : type === 'subnet' ? 'subnet' : type === 'range' ? 'range' : 'ip' } as DisplayLine;
    });
  }
  return entriesToDisplayLines(parseToResourceEntries(raw || '', [], expanded || ''));
}
