'use client';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

export interface FaqItem {
  q?: string;
  a?: string;
  question?: string;
  answer?: string;
}

export function FAQ({ items = [] }: { items: FaqItem[] }) {
  return (
    <Accordion type="single" collapsible className="w-full">
      {items.map((item, i) => (
        <AccordionItem key={i} value={`item-${i}`}>
          <AccordionTrigger className="text-left">{item.q ?? item.question ?? ''}</AccordionTrigger>
          <AccordionContent className="text-muted-foreground">{item.a ?? item.answer ?? ''}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
