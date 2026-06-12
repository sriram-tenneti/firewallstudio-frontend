/**
 * Auto-create Legacy Groups from imported legacy rules.
 *
 * After importing legacy firewall rules, this module:
 *   1. Scans rule_source / rule_destination fields for group names
 *   2. Parses rule_source_expanded / rule_destination_expanded to discover
 *      nested sub-groups and their IP/subnet/range members
 *   3. Creates each group (and nested sub-groups) via the createGroup API
 *      with full member association
 *   4. Skips groups that already exist (idempotent)
 *
 * The result is a set of Legacy Groups immediately visible in the
 * Legacy Groups modal of Firewall Management.
 */

import type { LegacyRule } from '@/types';
import { createGroup, getGroups, addGroupMember } from '@/lib/api';
import { isLegacyGroupName, detectEntryType } from '@/lib/nestingParser';

type MemberType = 'ip' | 'subnet' | 'cidr' | 'group' | 'range';

interface ExtractedGroup {
  name: string;
  appId: string;
  members: { type: MemberType; value: string }[];
  children: { name: string; members: { type: MemberType; value: string }[] }[];
}

/**
 * Parse an expanded text column to extract the hierarchy of groups,
 * nested sub-groups, and leaf members (IPs, subnets, ranges).
 */
function parseExpandedForGroups(
  raw: string,
  expanded: string
): { name: string; members: { type: MemberType; value: string }[]; children: { name: string; members: { type: MemberType; value: string }[] }[] }[] {
  const groups: { name: string; members: { type: MemberType; value: string }[]; children: { name: string; members: { type: MemberType; value: string }[] }[] }[] = [];

  if (!expanded || !expanded.trim()) {
    // No expanded text - just check if raw values are group names
    const rawLines = (raw || '').split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of rawLines) {
      const entryType = detectEntryType(line);
      if (entryType === 'group') {
        groups.push({ name: line, members: [], children: [] });
      }
    }
    return groups;
  }

  // Parse expanded text with indentation to build group hierarchy
  const lines: { indent: number; value: string }[] = [];
  for (const line of expanded.split('\n')) {
    if (!line.trim()) continue;
    const indent = line.startsWith('\t')
      ? (line.length - line.replace(/^\t+/, '').length) * 4
      : line.length - line.trimStart().length;
    const v = line.trim();
    // Strip trailing parenthetical annotations like "(5 IPs)"
    const valueClean = v.includes('(') ? v.substring(0, v.indexOf('(')).trim() : v;
    if (valueClean) lines.push({ indent, value: valueClean });
  }

  if (lines.length === 0) return groups;

  const rawValues = new Set((raw || '').split('\n').map(l => l.trim()).filter(Boolean));

  let currentGroup: { name: string; members: { type: MemberType; value: string }[]; children: { name: string; members: { type: MemberType; value: string }[] }[] } | null = null;
  let currentSubGroup: { name: string; members: { type: MemberType; value: string }[] } | null = null;
  let groupIndent = 0;
  let memberIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    const { indent, value } = lines[i];
    const entryType = detectEntryType(value);
    const hasChildLine = i + 1 < lines.length && lines[i + 1].indent > indent;
    const isGroup = entryType === 'group' || isLegacyGroupName(value) || (rawValues.has(value) && hasChildLine);

    if (currentGroup === null) {
      if (isGroup) {
        currentGroup = { name: value, members: [], children: [] };
        currentSubGroup = null;
        groupIndent = indent;
        memberIndent = hasChildLine ? lines[i + 1].indent : indent;
      }
      // Non-group top-level entries are just IPs/subnets, not groups to create
      continue;
    }

    // Check if we've left the current group's scope
    if (indent <= groupIndent && (rawValues.has(value) || isGroup)) {
      // Flush current sub-group
      if (currentSubGroup) {
        currentGroup.children.push(currentSubGroup);
        currentSubGroup = null;
      }
      groups.push(currentGroup);
      currentGroup = null;

      if (isGroup) {
        currentGroup = { name: value, members: [], children: [] };
        currentSubGroup = null;
        groupIndent = indent;
        memberIndent = hasChildLine ? lines[i + 1].indent : indent;
      }
      continue;
    }

    // We're inside the current group - determine if this is a sub-group or leaf member
    const memberType = detectEntryType(value);

    if (memberType === 'group' || isLegacyGroupName(value) || hasChildLine) {
      // This is a nested sub-group
      if (currentSubGroup) {
        currentGroup.children.push(currentSubGroup);
      }
      currentSubGroup = { name: value, members: [] };
      memberIndent = indent;
    } else if (currentSubGroup !== null && indent > memberIndent) {
      // This is a member of the current sub-group
      currentSubGroup.members.push({ type: memberType as MemberType, value });
    } else {
      // Direct member of the parent group
      if (currentSubGroup) {
        currentGroup.children.push(currentSubGroup);
        currentSubGroup = null;
      }
      currentGroup.members.push({ type: memberType as MemberType, value });
    }
  }

  // Flush remaining
  if (currentSubGroup && currentGroup) {
    currentGroup.children.push(currentSubGroup);
  }
  if (currentGroup) {
    groups.push(currentGroup);
  }

  return groups;
}

/**
 * Extract all unique groups (with members and nested sub-groups) from
 * a set of imported legacy rules by scanning source/destination columns.
 */
function extractGroupsFromRules(rules: LegacyRule[]): ExtractedGroup[] {
  const groupMap = new Map<string, ExtractedGroup>();

  for (const rule of rules) {
    const appId = String(rule.app_distributed_id || rule.app_id || '');

    // Parse source side
    const srcGroups = parseExpandedForGroups(
      rule.rule_source || '',
      rule.rule_source_expanded || ''
    );
    for (const g of srcGroups) {
      if (!groupMap.has(g.name)) {
        groupMap.set(g.name, { name: g.name, appId, members: g.members, children: g.children });
      } else {
        // Merge members if we find more from another rule
        const existing = groupMap.get(g.name)!;
        const existingMemberValues = new Set(existing.members.map(m => m.value));
        for (const m of g.members) {
          if (!existingMemberValues.has(m.value)) {
            existing.members.push(m);
            existingMemberValues.add(m.value);
          }
        }
        // Merge child groups
        const existingChildNames = new Set(existing.children.map(c => c.name));
        for (const child of g.children) {
          if (!existingChildNames.has(child.name)) {
            existing.children.push(child);
            existingChildNames.add(child.name);
          }
        }
      }
    }

    // Parse destination side
    const dstGroups = parseExpandedForGroups(
      rule.rule_destination || '',
      rule.rule_destination_expanded || ''
    );
    for (const g of dstGroups) {
      if (!groupMap.has(g.name)) {
        groupMap.set(g.name, { name: g.name, appId, members: g.members, children: g.children });
      } else {
        const existing = groupMap.get(g.name)!;
        const existingMemberValues = new Set(existing.members.map(m => m.value));
        for (const m of g.members) {
          if (!existingMemberValues.has(m.value)) {
            existing.members.push(m);
            existingMemberValues.add(m.value);
          }
        }
        const existingChildNames = new Set(existing.children.map(c => c.name));
        for (const child of g.children) {
          if (!existingChildNames.has(child.name)) {
            existing.children.push(child);
            existingChildNames.add(child.name);
          }
        }
      }
    }
  }

  return Array.from(groupMap.values());
}

export interface AutoCreateResult {
  groupsCreated: number;
  groupsSkipped: number;
  nestedGroupsCreated: number;
  membersAdded: number;
  errors: string[];
}

/**
 * Auto-create Legacy Groups from imported rules.
 *
 * For each group found in rule source/destination:
 *   1. Check if the group already exists (skip if so)
 *   2. Create the group with description "Legacy group auto-created from import"
 *   3. Add all discovered members (IPs, subnets, ranges)
 *   4. Create nested sub-groups with their own members
 *   5. Add nested sub-groups as group-type members of the parent
 *
 * Returns a summary of what was created.
 */
export async function autoCreateLegacyGroupsFromRules(
  rules: LegacyRule[]
): Promise<AutoCreateResult> {
  const result: AutoCreateResult = {
    groupsCreated: 0,
    groupsSkipped: 0,
    nestedGroupsCreated: 0,
    membersAdded: 0,
    errors: [],
  };

  if (!rules || rules.length === 0) return result;

  const extractedGroups = extractGroupsFromRules(rules);
  if (extractedGroups.length === 0) return result;

  // Fetch all existing groups to check for duplicates
  let existingGroupNames: Set<string>;
  try {
    const existing = await getGroups();
    existingGroupNames = new Set(existing.map(g => g.name));
  } catch {
    existingGroupNames = new Set();
  }

  for (const group of extractedGroups) {
    // First, create nested sub-groups (so they exist before being referenced)
    for (const child of group.children) {
      if (existingGroupNames.has(child.name)) continue;

      try {
        await createGroup({
          name: child.name,
          app_id: group.appId,
          description: 'Legacy nested group auto-created from import',
          members: child.members.map(m => ({ type: m.type, value: m.value, description: '' })),
          skip_prefix: true, // Legacy groups: keep name as-is, no grp- prefix
        });
        existingGroupNames.add(child.name);
        result.nestedGroupsCreated++;
        result.membersAdded += child.members.length;
      } catch {
        result.errors.push(`Failed to create nested group: ${child.name}`);
      }
    }

    // Now create the parent group
    if (existingGroupNames.has(group.name)) {
      // Group exists - try to add any new members that weren't there
      try {
        const allMembers = [
          ...group.members,
          // Add child groups as group-type members of parent
          ...group.children.map(c => ({ type: 'group' as MemberType, value: c.name })),
        ];
        for (const member of allMembers) {
          try {
            await addGroupMember(group.name, { type: member.type as MemberType, value: member.value, description: '' });
            result.membersAdded++;
          } catch {
            // Member likely already exists - that's fine
          }
        }
      } catch {
        // Ignore errors when adding members to existing groups
      }
      result.groupsSkipped++;
      continue;
    }

    try {
      // Build member list: direct members + nested sub-group references
      const allMembers = [
        ...group.members.map(m => ({ type: m.type, value: m.value, description: '' })),
        ...group.children.map(c => ({ type: 'group' as MemberType, value: c.name, description: '' })),
      ];

      await createGroup({
        name: group.name,
        app_id: group.appId,
        description: 'Legacy group auto-created from import',
        members: allMembers,
        skip_prefix: true, // Legacy groups: keep name as-is, no grp- prefix
      });
      existingGroupNames.add(group.name);
      result.groupsCreated++;
      result.membersAdded += allMembers.length;
    } catch {
      result.errors.push(`Failed to create group: ${group.name}`);
    }
  }

  return result;
}
