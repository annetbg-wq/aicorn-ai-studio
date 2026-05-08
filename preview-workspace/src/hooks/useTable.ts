import { useMemo, useState } from 'react';
import type { DataRow, RowStatus } from '@/data/types';

export type SortColumn = 'title' | 'status' | 'value' | 'createdAt' | 'owner';
export type SortDirection = 'asc' | 'desc';

export interface TableState {
  rows: readonly DataRow[];
  sort: { column: SortColumn; direction: SortDirection };
  filter: { status: RowStatus | 'all'; query: string };
  page: number;
  pageSize: number;
  pageCount: number;
  totalRows: number;
  setSort: (column: SortColumn) => void;
  setStatusFilter: (status: RowStatus | 'all') => void;
  setQuery: (q: string) => void;
  setPage: (page: number) => void;
}

interface UseTableInput {
  source: readonly DataRow[];
  pageSize?: number;
}

/**
 * Pure, memoized table state. Sort, filter, paginate.
 * No effects, no fetching — agent wires real data on top.
 */
export function useTable({ source, pageSize = 8 }: UseTableInput): TableState {
  const [sort, setSortState] = useState<TableState['sort']>({
    column: 'createdAt',
    direction: 'desc',
  });
  const [filter, setFilter] = useState<TableState['filter']>({ status: 'all', query: '' });
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = filter.query.trim().toLowerCase();
    return source.filter((row) => {
      if (filter.status !== 'all' && row.status !== filter.status) return false;
      if (q && !row.title.toLowerCase().includes(q) && !row.owner.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [source, filter]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    const dir = sort.direction === 'asc' ? 1 : -1;
    copy.sort((a, b) => {
      const av = a[sort.column];
      const bv = b[sort.column];
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
    return copy;
  }, [filtered, sort]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visible = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);

  function setSort(column: SortColumn): void {
    setSortState((prev) =>
      prev.column === column
        ? { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: 'desc' },
    );
    setPage(0);
  }

  return {
    rows: visible,
    sort,
    filter,
    page: safePage,
    pageSize,
    pageCount,
    totalRows: sorted.length,
    setSort,
    setStatusFilter: (status) => {
      setFilter((prev) => ({ ...prev, status }));
      setPage(0);
    },
    setQuery: (query) => {
      setFilter((prev) => ({ ...prev, query }));
      setPage(0);
    },
    setPage,
  };
}
