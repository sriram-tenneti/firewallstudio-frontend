import { useState, useMemo } from 'react';
import { Search, ArrowUpDown, ArrowUp, ArrowDown, Filter } from 'lucide-react';
import { Pagination } from './Pagination';

export interface Column<T = Record<string, unknown>> {
  key: string;
  header: string;
  width?: string;
  sortable?: boolean;
  render?: (value: unknown, item: T) => React.ReactNode;
  getValue?: (item: T) => string | number;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyField: string;
  searchPlaceholder?: string;
  searchFields?: string[];
  selectedIds?: Set<string>;
  onSelect?: (id: string) => void;
  onSelectAll?: (visibleIds?: string[]) => void;
  onRowClick?: (item: T) => void;
  onRowDoubleClick?: (item: T) => void;
  pageSize?: number;
  defaultPageSize?: number;
  emptyMessage?: string;
  toolbar?: React.ReactNode;
  compact?: boolean;
}

type SortDir = 'asc' | 'desc' | null;

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((acc: unknown, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/** Recursively extract all string/number leaf values from an object */
function getAllLeafValues(obj: unknown): string[] {
  const values: string[] = [];
  if (obj === null || obj === undefined) return values;
  if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') {
    values.push(String(obj));
  } else if (Array.isArray(obj)) {
    for (const item of obj) values.push(...getAllLeafValues(item));
  } else if (typeof obj === 'object') {
    for (const val of Object.values(obj as Record<string, unknown>)) {
      values.push(...getAllLeafValues(val));
    }
  }
  return values;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function DataTable<T extends Record<string, any>>({
  data, columns, keyField, searchPlaceholder = 'Search...', searchFields,
  selectedIds, onSelect, onSelectAll, onRowClick, onRowDoubleClick,
  pageSize: initialPageSize, defaultPageSize = 50, emptyMessage = 'No records found.', toolbar, compact = false,
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize ?? defaultPageSize);
  const [showFilters, setShowFilters] = useState(false);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});

  const filteredData = useMemo(() => {
    let result = data;
    if (search) {
      const q = search.toLowerCase();
      const fields = searchFields || columns.map(c => c.key);
      result = result.filter(item =>
        fields.some(f => {
          const val = getNestedValue(item, f);
          if (val === undefined) return false;
          // Deep search: if value is an object, search all nested leaf values
          if (typeof val === 'object' && val !== null) {
            return getAllLeafValues(val).some(leaf => leaf.toLowerCase().includes(q));
          }
          return String(val).toLowerCase().includes(q);
        })
      );
    }
    for (const [key, filterVal] of Object.entries(columnFilters)) {
      if (filterVal) {
        result = result.filter(item => {
          const val = getNestedValue(item, key);
          return val !== undefined && String(val).toLowerCase().includes(filterVal.toLowerCase());
        });
      }
    }
    return result;
  }, [data, search, searchFields, columns, columnFilters]);

  const sortedData = useMemo(() => {
    if (!sortKey || !sortDir) return filteredData;
    const col = columns.find(c => c.key === sortKey);
    return [...filteredData].sort((a, b) => {
      const aVal = col?.getValue ? col.getValue(a) : String(getNestedValue(a, sortKey) ?? '');
      const bVal = col?.getValue ? col.getValue(b) : String(getNestedValue(b, sortKey) ?? '');
      const cmp = typeof aVal === 'number' && typeof bVal === 'number'
        ? aVal - bVal
        : String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filteredData, sortKey, sortDir, columns]);

  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const paginatedData = sortedData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : sortDir === 'desc' ? null : 'asc');
      if (sortDir === 'desc') setSortKey(null);
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const allSelected = selectedIds && paginatedData.length > 0 &&
    paginatedData.every(item => selectedIds.has(String(item[keyField])));
  const someSelected = selectedIds &&
    paginatedData.some(item => selectedIds.has(String(item[keyField]))) && !allSelected;

  const cellPad = compact ? 'px-3 py-1.5' : 'px-4 py-2.5';
  const headPad = compact ? 'px-3 py-2' : 'px-4 py-3';

  return (
    <div className="flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Search & Toolbar */}
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 bg-slate-50/50 px-4 py-3">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input type="text" value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              placeholder={searchPlaceholder}
              className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
          </div>
          <button onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              showFilters ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
            }`}>
            <Filter className="h-4 w-4" />
            Filters
          </button>
          <span className="text-sm text-slate-500">{sortedData.length.toLocaleString()} record(s)</span>
        </div>
        {toolbar && <div className="flex items-center gap-2">{toolbar}</div>}
      </div>

      {/* Selection count */}
      {selectedIds && selectedIds.size > 0 && (
        <div className="flex items-center gap-3 border-b border-blue-200 bg-blue-50 px-4 py-2">
          <span className="text-sm font-semibold text-blue-800">{selectedIds.size} selected</span>
        </div>
      )}

      {/* Column filters */}
      {showFilters && (
        <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 flex-wrap">
          {columns.map(col => (
            <div key={col.key} className="flex items-center gap-1">
              <label className="text-xs font-medium text-slate-500">{col.header}:</label>
              <input type="text" value={columnFilters[col.key] || ''}
                onChange={(e) => { setColumnFilters(prev => ({ ...prev, [col.key]: e.target.value })); setCurrentPage(1); }}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs w-24" placeholder="Filter..." />
            </div>
          ))}
          <button onClick={() => { setColumnFilters({}); setCurrentPage(1); }}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium">Clear All</button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto flex-1">
        <table className="w-full">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-slate-200 bg-slate-100">
              {onSelect && (
                <th className={`${headPad} w-10`}>
                  <input type="checkbox" checked={allSelected || false}
                    ref={el => { if (el) el.indeterminate = someSelected || false; }}
                    onChange={() => onSelectAll?.(sortedData.map(item => String(item[keyField])))}
                    className="rounded border-slate-400 text-blue-600 focus:ring-blue-500" />
                </th>
              )}
              {columns.map(col => (
                <th key={col.key}
                  className={`${headPad} text-left text-xs font-bold uppercase tracking-wider text-slate-600 ${col.width || ''} ${
                    col.sortable !== false ? 'cursor-pointer select-none hover:bg-slate-200/50' : ''
                  }`}
                  onClick={() => col.sortable !== false && handleSort(col.key)}>
                  <div className="flex items-center gap-1.5">
                    {col.header}
                    {col.sortable !== false && (
                      sortKey === col.key
                        ? (sortDir === 'asc'
                          ? <ArrowUp className="h-3.5 w-3.5 text-blue-600" />
                          : <ArrowDown className="h-3.5 w-3.5 text-blue-600" />)
                        : <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (onSelect ? 1 : 0)}
                  className="px-6 py-16 text-center text-sm text-slate-400">
                  {emptyMessage}
                </td>
              </tr>
            ) : paginatedData.map(item => {
              const id = String(item[keyField]);
              const isSelected = selectedIds?.has(id);
              return (
                <tr key={id}
                  className={`transition-colors ${isSelected ? 'bg-blue-50/60' : 'hover:bg-slate-50'} ${onRowClick ? 'cursor-pointer' : ''}`}
                  onClick={() => onRowClick?.(item)}
                  onDoubleClick={() => onRowDoubleClick?.(item)}>
                  {onSelect && (
                    <td className={cellPad} onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={isSelected || false}
                        onChange={() => onSelect(id)}
                        className="rounded border-slate-400 text-blue-600 focus:ring-blue-500" />
                    </td>
                  )}
                  {columns.map(col => (
                    <td key={col.key} className={`${cellPad} text-sm text-slate-700 ${col.width || ''}`}>
                      {col.render ? col.render(getNestedValue(item, col.key), item) : String(getNestedValue(item, col.key) ?? '-')}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={sortedData.length}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }}
      />
    </div>
  );
}
