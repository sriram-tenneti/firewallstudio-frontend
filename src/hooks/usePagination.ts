import { useState, useMemo, useCallback } from 'react';

export interface PaginationState<T> {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  paginatedItems: T[];
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  goToFirst: () => void;
  goToLast: () => void;
}

export function usePagination<T>(items: T[], initialPageSize = 50): PaginationState<T> {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, currentPage, pageSize]);

  const setPage = useCallback((page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, Math.ceil(items.length / pageSize))));
  }, [items.length, pageSize]);

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
    setCurrentPage(1);
  }, []);

  const nextPage = useCallback(() => setPage(currentPage + 1), [currentPage, setPage]);
  const prevPage = useCallback(() => setPage(currentPage - 1), [currentPage, setPage]);
  const goToFirst = useCallback(() => setPage(1), [setPage]);
  const goToLast = useCallback(() => setPage(totalPages), [setPage, totalPages]);

  return { currentPage, pageSize, totalItems, totalPages, paginatedItems, setPage, setPageSize, nextPage, prevPage, goToFirst, goToLast };
}
