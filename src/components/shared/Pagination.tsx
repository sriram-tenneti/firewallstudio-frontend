import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export function Pagination({ currentPage, totalPages, totalItems, pageSize, onPageChange, onPageSizeChange }: PaginationProps) {
  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-3">
      <div className="flex items-center gap-4">
        <span className="text-sm text-slate-600">
          Showing <span className="font-semibold text-slate-900">{start}</span> to <span className="font-semibold text-slate-900">{end}</span> of <span className="font-semibold text-slate-900">{totalItems.toLocaleString()}</span> records
        </span>
        <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700">
          {[25, 50, 100, 250].map(s => <option key={s} value={s}>{s} per page</option>)}
        </select>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={() => onPageChange(1)} disabled={currentPage === 1}
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed">
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1}
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="px-3 text-sm font-medium text-slate-700">
          Page {currentPage} of {totalPages}
        </span>
        <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages}
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed">
          <ChevronRight className="h-4 w-4" />
        </button>
        <button onClick={() => onPageChange(totalPages)} disabled={currentPage === totalPages}
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed">
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
