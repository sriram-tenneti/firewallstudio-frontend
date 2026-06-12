import { useState, type KeyboardEvent } from 'react';
import { autoPrefix } from '@/lib/utils';

export interface MemberChip {
  type?: 'ip' | 'cidr' | 'subnet' | 'range' | 'group';
  value: string;
  description?: string;
  dc_id?: string;
}

interface Props {
  chips: (MemberChip | string)[];
  onChange: (next: MemberChip[]) => void;
  placeholder?: string;
  /** When true, the editor is rendered in a compact single-line layout. */
  compact?: boolean;
  disabled?: boolean;
  /** Optional accent colour: emerald for egress, sky for ingress. */
  accent?: 'emerald' | 'sky' | 'amber' | 'gray';
  ariaLabel?: string;
}

const ACCENT: Record<string, { chipBg: string; chipBorder: string; chipText: string; addBtn: string }> = {
  emerald: {
    chipBg: 'bg-emerald-50',
    chipBorder: 'border-emerald-200',
    chipText: 'text-emerald-800',
    addBtn: 'bg-emerald-600 hover:bg-emerald-700',
  },
  sky: {
    chipBg: 'bg-sky-50',
    chipBorder: 'border-sky-200',
    chipText: 'text-sky-800',
    addBtn: 'bg-sky-600 hover:bg-sky-700',
  },
  amber: {
    chipBg: 'bg-amber-50',
    chipBorder: 'border-amber-200',
    chipText: 'text-amber-800',
    addBtn: 'bg-amber-600 hover:bg-amber-700',
  },
  gray: {
    chipBg: 'bg-gray-50',
    chipBorder: 'border-gray-200',
    chipText: 'text-gray-700',
    addBtn: 'bg-gray-600 hover:bg-gray-700',
  },
};

function inferType(v: string): MemberChip['type'] {
  const s = v.trim();
  if (!s) return 'ip';
  const lower = s.toLowerCase();
  if (lower.startsWith('grp-') || lower.startsWith('g-')) return 'group';
  if (s.includes('/')) return 'cidr';
  // svr-/rng- are NGDC-prefixed atoms; classify by prefix
  if (lower.startsWith('rng-')) return 'range';
  if (lower.startsWith('svr-')) return 'ip';
  if (s.includes('-') && /\d/.test(s)) return 'range';
  return 'ip';
}

export default function MemberChipList({
  chips,
  onChange,
  placeholder = 'IP / CIDR / range — press Enter',
  compact,
  disabled,
  accent = 'gray',
  ariaLabel,
}: Props) {
  const [input, setInput] = useState('');
  const palette = ACCENT[accent];
  // Normalise input chips → always render dict shape internally
  const norm: MemberChip[] = chips.map((c) =>
    typeof c === 'string' ? { value: c, type: inferType(c) } : c,
  );

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    // Allow comma- or space-separated multi-paste in one go.
    const tokens = trimmed.split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean);
    const seen = new Set(norm.map((c) => `${c.type ?? ''}:${c.value}`));
    const next = [...norm];
    for (const tok of tokens) {
      const t = inferType(tok);
      // Normalise IP / CIDR / range tokens to the NGDC prefix
      // convention (svr-, net-, rng-) so Heritage and NGDC presence
      // chips render consistently across the portal. Group references
      // and already-prefixed atoms are passed through unchanged by
      // ``autoPrefix``.
      const valueType: 'ip' | 'cidr' | 'subnet' | 'range' | 'group' =
        t === 'cidr' ? 'cidr' : t === 'range' ? 'range' : t === 'group' ? 'group' : 'ip';
      const value = autoPrefix(tok, valueType);
      const k = `${t}:${value}`;
      if (seen.has(k)) continue;
      next.push({ type: t, value });
      seen.add(k);
    }
    onChange(next);
    setInput('');
  };

  const remove = (idx: number) => {
    onChange(norm.filter((_, i) => i !== idx));
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault();
      commit(input);
    } else if (e.key === 'Backspace' && !input && norm.length > 0) {
      remove(norm.length - 1);
    }
  };

  return (
    <div
      aria-label={ariaLabel}
      className={`flex flex-wrap items-center gap-1 px-2 py-1 border border-gray-300 rounded ${
        compact ? 'min-h-[28px]' : 'min-h-[36px]'
      } bg-white ${disabled ? 'opacity-60' : ''}`}
    >
      {norm.map((c, i) => (
        <span
          key={`${c.type}-${c.value}-${i}`}
          className={`inline-flex items-center gap-1 rounded border ${palette.chipBorder} ${palette.chipBg} ${palette.chipText} px-2 py-0.5 text-[11px] font-medium`}
          title={c.type ? `${c.type}: ${c.value}` : c.value}
        >
          {c.value}
          {!disabled && (
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-current opacity-60 hover:opacity-100"
              aria-label={`Remove ${c.value}`}
            >
              ×
            </button>
          )}
        </span>
      ))}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => commit(input)}
        placeholder={norm.length === 0 ? placeholder : ''}
        disabled={disabled}
        className="flex-1 min-w-[120px] text-[11px] outline-none px-1 py-0.5 bg-transparent"
      />
    </div>
  );
}
