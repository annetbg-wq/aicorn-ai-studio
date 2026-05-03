import { useApp } from '@/context/AppContext';
import { DataTable } from '@/components/DataTable';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { useTable } from '@/hooks/useTable';
import { SEED_ROWS } from '@/data/seed';
import { Plus } from 'lucide-react';

export default function DataView(): JSX.Element {
  const { loadingState } = useApp();
  /* SEED: replace with rows from your storage / API layer. */
  const table = useTable({ source: SEED_ROWS });

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {/* PRODUCT: rename to match the entity (Customers, Deals, Documents...). */}
          <h1 className="text-2xl font-semibold tracking-tight">Data</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse, sort, and filter your records.
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4" />
          New record
        </Button>
      </header>

      {loadingState === 'loading' ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <DataTable table={table} />
      )}
    </div>
  );
}
