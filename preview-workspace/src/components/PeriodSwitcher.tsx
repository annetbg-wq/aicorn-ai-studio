import React from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

type Period = 'week' | 'month' | 'year';

interface PeriodSwitcherProps {
  value: Period;
  onChange: (value: Period) => void;
}

export function PeriodSwitcher({ value, onChange }: PeriodSwitcherProps) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as Period)}>
      <TabsList className="grid grid-cols-3 w-full max-w-xs">
        <TabsTrigger value="week">Неделя</TabsTrigger>
        <TabsTrigger value="month">Месяц</TabsTrigger>
        <TabsTrigger value="year">Год</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
<!--END-->