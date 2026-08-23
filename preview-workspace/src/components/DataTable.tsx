import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/Select';
import { EmptyState } from './EmptyState';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { TableState, SortColumn } from '@/hooks/useTable';
import type { RowStatus } from '@/data/types';

interface DataTableProps {
  table: TableState;
}

const STATUS_VARIANT: Record<RowStatus, 'success' | 'warning' | 'secondary'> = {
  active: 'success',
  pending: 'warning',
  archived: 'secondary',
};

const COLUMNS: ReadonlyArray<{ key: SortColumn; label: string; align?: 'right' }> = [
  { key: 'title', label: 'Title' },
  { key: 'status', label: 'Status' },
  { key: 'owner', label: 'Owner' },
  { key: 'value', label: 'Value', align: 'right' },
  { key: 'createdAt', label: 'Created' },
];

const DATE_FMT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const NUM_FMT = new Intl.NumberFormat(undefined);

export function DataTable({ table }: DataTableProps): JSX.Element {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          placeholder="Filter by title or owner..."
          value={table.filter.query}
          onChange={(e) => table.setQuery(e.target.value)}
          className="max-w-xs"
        />
        <Select
          value={table.filter.status}
          onValueChange={(v) => table.setStatusFilter(v as RowStatus | 'all')}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <span className="ml-auto text-xs text-muted-foreground">
          {table.totalRows} {table.totalRows === 1 ? 'row' : 'rows'}
        </span>
      </div>

      {table.totalRows === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No matching rows"
          description="Try a different filter or search term."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                {COLUMNS.map((col) => {
                  const active = table.sort.column === col.key;
                  const Icon = table.sort.direction === 'asc' ? ArrowUp : ArrowDown;
                  return (
                    <th
                      key={col.key}
                      className={cn(
                        'px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground',
                        col.align === 'right' && 'text-right',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => table.setSort(col.key)}
                        className={cn(
                          'inline-flex items-center gap-1 transition-colors hover:text-foreground',
                          active && 'text-foreground',
                        )}
                      >
                        {col.label}
                        {active && <Icon className="h-3 w-3" />}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border last:border-0 transition-colors hover:bg-muted/40"
                >
                  <td className="px-3 py-2.5 font-medium">{row.title}</td>
                  <td className="px-3 py-2.5">
                    <Badge variant={STATUS_VARIANT[row.status]}>{row.status}</Badge>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{row.owner}</td>
                  <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                    ${NUM_FMT.format(row.value)}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {DATE_FMT.format(new Date(row.createdAt))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {table.pageCount > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {table.page + 1} of {table.pageCount}
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={table.page === 0}
              onClick={() => table.setPage(table.page - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={table.page >= table.pageCount - 1}
              onClick={() => table.setPage(table.page + 1)}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
