import React from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

type FilterType = 'all' | 'income' | 'expense';

interface TypeFilterProps {
  value: FilterType;
  onChange: (value: FilterType) => void;
}

export function TypeFilter({ value, onChange }: TypeFilterProps) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as FilterType)}>
      <TabsList className="grid grid-cols-3 w-full max-w-xs">
        <TabsTrigger value="all">Все</TabsTrigger>
        <TabsTrigger value="income">Доходы</TabsTrigger>
        <TabsTrigger value="expense">Расходы</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
<!--END-->