import { useMemo, useState } from 'react';
import type {
  Environment,
  SharedService,
  SharedServiceCategory,
  SharedServicePresence,
} from '@/types';

interface SharedServicesSidebarProps {
  services: SharedService[];
  presences: Record<string, SharedServicePresence[]>;
  environment: Environment;
  selectedServiceId?: string | null;
  onSelect: (service: SharedService) => void;
  onDragStart?: (service: SharedService, e: React.DragEvent) => void;
}

const CATEGORY_STYLES: Record<
  SharedServiceCategory,
  { grad: string; ring: string; chip: string; text: string; tint: string }
> = {
  Messaging:     { grad: 'from-sky-200 to-sky-300',       ring: 'ring-sky-100',     chip: 'bg-sky-50 text-sky-700 border-sky-100',         text: 'text-sky-700',     tint: 'bg-sky-50/60' },
  Database:      { grad: 'from-pink-200 to-rose-300',     ring: 'ring-pink-100',    chip: 'bg-pink-50 text-pink-700 border-pink-100',      text: 'text-pink-700',    tint: 'bg-pink-50/60' },
  Observability: { grad: 'from-amber-200 to-orange-300',  ring: 'ring-orange-100',  chip: 'bg-orange-50 text-orange-700 border-orange-100', text: 'text-orange-700',  tint: 'bg-orange-50/60' },
  Identity:      { grad: 'from-violet-200 to-purple-300', ring: 'ring-violet-100',  chip: 'bg-violet-50 text-violet-700 border-violet-100', text: 'text-violet-700',  tint: 'bg-violet-50/60' },
  Cache:         { grad: 'from-rose-200 to-red-300',      ring: 'ring-rose-100',    chip: 'bg-rose-50 text-rose-700 border-rose-100',      text: 'text-rose-700',    tint: 'bg-rose-50/60' },
  Other:         { grad: 'from-slate-200 to-slate-300',   ring: 'ring-slate-100',   chip: 'bg-slate-50 text-slate-700 border-slate-100',   text: 'text-slate-700',   tint: 'bg-slate-50/60' },
};

const ALL_CATEGORIES: ('all' | SharedServiceCategory)[] = [
  'all', 'Messaging', 'Database', 'Observability', 'Identity', 'Cache', 'Other',
];

export function SharedServicesSidebar({
  services,
  presences,
  environment,
  selectedServiceId,
  onSelect,
  onDragStart,
}: SharedServicesSidebarProps) {
  const [category, setCategory] = useState<'all' | SharedServiceCategory>('all');
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    return services.filter((s) => {
      if (!(s.environments || []).includes(environment)) return false;
      if (category !== 'all' && s.category !== category) return false;
      if (q) {
        const ql = q.toLowerCase();
        const hay = `${s.service_id} ${s.name} ${s.description ?? ''}`.toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      return true;
    });
  }, [services, category, q, environment]);

  const handleDragStart = (s: SharedService) => (e: React.DragEvent) => {
    e.dataTransfer.setData('application/x-shared-service', s.service_id);
    e.dataTransfer.setData('text/plain', s.service_id);
    e.dataTransfer.effectAllowed = 'copy';
    onDragStart?.(s, e);
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-gradient-to-b from-white to-slate-50/60 shadow-sm p-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Shared Services</div>
          <div className="text-[11px] text-gray-500">Drag onto destination · {environment}</div>
        </div>
        <div className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
          {filtered.length}
        </div>
      </div>
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search…"
        className="w-full mb-2 px-2 py-1 text-xs border border-gray-200 rounded focus:ring-2 focus:ring-indigo-300"
      />
      <div className="flex flex-wrap gap-1 mb-2">
        {ALL_CATEGORIES.map((c) => {
          const on = category === c;
          const style = c !== 'all' ? CATEGORY_STYLES[c] : null;
          return (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`text-[10px] px-1.5 py-0.5 rounded-full border transition ${
                on
                  ? 'bg-gray-900 text-white border-gray-900'
                  : style
                    ? `${style.chip} hover:shadow`
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {c === 'all' ? 'All' : c}
            </button>
          );
        })}
      </div>
      <div className="space-y-2 max-h-[30rem] overflow-y-auto pr-1">
        {filtered.map((s) => {
          const style = CATEGORY_STYLES[s.category] ?? CATEGORY_STYLES.Other;
          const presCount = (presences[s.service_id] || []).filter(
            (p) => p.environment === environment,
          ).length;
          const dcs = Array.from(
            new Set(
              (presences[s.service_id] || [])
                .filter((p) => p.environment === environment)
                .map((p) => p.dc_id),
            ),
          );
          const isSelected = selectedServiceId === s.service_id;
          return (
            <div
              key={s.service_id}
              draggable
              onDragStart={handleDragStart(s)}
              onClick={() => onSelect(s)}
              className={`group relative rounded-lg overflow-hidden border cursor-grab active:cursor-grabbing transition-all ${
                isSelected
                  ? `ring-2 ${style.ring} border-gray-300 shadow`
                  : 'border-gray-200 hover:shadow-md hover:-translate-y-0.5'
              }`}
            >
              <div className={`absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${style.grad}`} />
              <div className="p-2.5 pl-3 bg-white">
                <div className="flex items-start gap-2">
                  <div
                    className={`w-8 h-8 shrink-0 rounded-md bg-gradient-to-br ${style.grad} ${style.text} flex items-center justify-center text-base shadow-sm ring-1 ${style.ring}`}
                  >
                    {s.icon || '🧩'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <code className="text-[10px] font-mono text-gray-500">{s.service_id}</code>
                      <span className={`text-[9px] px-1 py-0.5 rounded-full border ${style.chip}`}>
                        {s.category}
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-gray-900 truncate">{s.name}</div>
                    {s.description && (
                      <div className="text-[11px] text-gray-500 line-clamp-1">{s.description}</div>
                    )}
                    <div className="mt-1 flex items-center gap-1 flex-wrap">
                      <span className="text-[9px] px-1 py-0.5 rounded bg-slate-50 text-slate-600 border border-slate-200">
                        {presCount} presence{presCount === 1 ? '' : 's'}
                      </span>
                      {dcs.slice(0, 3).map((d) => (
                        <span key={d} className={`text-[9px] px-1 py-0.5 rounded ${style.chip}`}>
                          {d.replace('_NGDC', '')}
                        </span>
                      ))}
                      {dcs.length > 3 && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200">
                          +{dcs.length - 3}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 select-none">
                    ⋮⋮
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-xs text-gray-400 italic p-4 text-center">
            No shared services match the filters.
          </div>
        )}
      </div>
    </div>
  );
}

export default SharedServicesSidebar;
