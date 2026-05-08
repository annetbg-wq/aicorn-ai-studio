import React from 'react';
import { Transaction, Category } from '@/data/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TransactionItemProps {
  transaction: Transaction;
  category?: Category;
  onDelete?: (id: string) => void;
}

export function TransactionItem({ transaction, category, onDelete }: TransactionItemProps) {
  const isIncome = transaction.type === 'income';

  return (
    <div className="flex items-center gap-3 px-4 py-3.5 hover:bg-accent/50 active:bg-accent transition-colors cursor-pointer group">
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0"
        style={{
          backgroundColor: (category?.color || '#6b7280') + '20',
          color: category?.color || '#6b7280',
        }}
      >
        {category?.icon || '💰'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground truncate">
          {transaction.note || category?.name || 'Без категории'}
        </p>
        <p className="text-sm text-muted-foreground">{formatDate(transaction.date)}</p>
      </div>
      <div className="flex items-center gap-2">
        <p
          className={`font-semibold tabular-nums ${
            isIncome ? 'text-emerald-600' : 'text-red-500'
          }`}
        >
          {isIncome ? '+' : '-'}
          {formatCurrency(transaction.amount)}
        </p>
        {onDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => onDelete(transaction.id)}
          >
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        )}
      </div>
    </div>
  );
}
<!--END-->