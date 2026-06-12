import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Check if a group name follows the NGDC naming standard: grp-{APP}-{NH}-{SZ}-{Component}
 */
export function isNgdcGroupName(name: string): boolean {
  return /^grp-[A-Za-z0-9]+-[A-Za-z0-9]+-[A-Za-z0-9]+-[A-Za-z0-9]+/.test(name);
}

/**
 * Auto-prefix a value based on its entry type.
 * - 'ip' entries get 'svr-' prefix (server / host IP)
 * - 'group' entries get 'grp-' prefix (only in NGDC contexts)
 * - 'subnet' / 'cidr' entries get 'net-' prefix (NGDC standard for subnets)
 * - 'range' entries get 'rng-' prefix (IP ranges xx.xx.xx.xx-xy)
 *
 * If the value already has a recognized prefix (svr-, grp-, rng-, net-, sub-, g-),
 * it is returned as-is (sub- normalized to net-).
 *
 * When skipGroupPrefix is true, group-type values are returned as-is without
 * adding grp- prefix. This is used during legacy import to preserve original names.
 */
/**
 * Shorten an IP range to compact form.
 * e.g. "10.124.132.4-10.124.132.9" → "10.124.132.4-9"
 * If IPs share the first 3 octets, only the last octet of the end IP is kept.
 * If they share fewer octets, the differing octets of the end IP are kept.
 */
export function shortenIPRange(rangeStr: string): string {
  const m = rangeStr.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s*-\s*(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (!m) return rangeStr;
  const startParts = m[1].split('.');
  const endParts = m[2].split('.');
  // Find how many leading octets match
  let commonCount = 0;
  for (let i = 0; i < 4; i++) {
    if (startParts[i] === endParts[i]) commonCount++;
    else break;
  }
  if (commonCount === 0) return rangeStr; // completely different — keep full
  // Keep only the differing octets of the end IP
  const suffix = endParts.slice(commonCount).join('.');
  return `${m[1]}-${suffix}`;
}

export function autoPrefix(value: string, type: 'ip' | 'subnet' | 'cidr' | 'group' | 'range', skipGroupPrefix = false): string {
  const v = value.trim();
  if (!v) return v;
  const vl = v.toLowerCase();
  // Normalize legacy sub- prefix to NGDC net-
  if (vl.startsWith('sub-')) return `net-${v.slice(4)}`;
  // Already has a recognized prefix — return as-is
  if (vl.startsWith('svr-') || vl.startsWith('gsvr-') || vl.startsWith('grp-') || vl.startsWith('rng-') || vl.startsWith('net-') || vl.startsWith('g-')) {
    return v;
  }
  // Detect raw IP patterns
  const isPlainIP = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(v);
  const isCIDR = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/.test(v);
  const isIPRange = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\s*-\s*\d{1,3}(\.\d{1,3}){0,3}$/.test(v);
  if (isCIDR) {
    // CIDR notation = subnet (net- prefix)
    if (type === 'group') return `grp-${v}`;
    return `net-${v}`;
  }
  if (isIPRange) {
    // IP range = range (rng- prefix), use short format
    if (type === 'group') return `grp-${v}`;
    const shortened = shortenIPRange(v);
    return `rng-${shortened}`;
  }
  if (isPlainIP) {
    // Plain IP = server (svr- prefix)
    if (type === 'group') return `grp-${v}`;
    if (type === 'subnet' || type === 'cidr') return `net-${v}`;
    if (type === 'range') return `rng-${v}`;
    return `svr-${v}`;
  }
  // Named value without prefix — add based on type
  if (type === 'group') return skipGroupPrefix ? v : `grp-${v}`;
  if (type === 'subnet' || type === 'cidr') return `net-${v}`;
  if (type === 'range') return `rng-${v}`;
  return `svr-${v}`;
}
