import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Category } from '@/data/types';
import { formatCurrency } from '@/lib/utils';

interface CategoryCardProps {
  category: Category;
  total?: number;
  onClick?: () => void;
}

export function CategoryCard({ category, total, onClick }: CategoryCardProps) {
  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-all duration-200 active:scale-[0.98]"
      onClick={onClick}
    >
      <CardContent className="p-4 flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
          style={{ backgroundColor: category.color + '20', color: category.color }}
        >
          {category.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground truncate">{category.name}</p>
          {total !== undefined && (
            <p className="text-sm text-muted-foreground">{formatCurrency(total)}</p>
          )}
        </div>
        <Badge variant={category.type === 'income' ? 'default' : 'secondary'}>
          {category.type === 'income' ? 'Доход' : 'Расход'}
        </Badge>
      </CardContent>
    </Card>
  );
}
<!--END-->