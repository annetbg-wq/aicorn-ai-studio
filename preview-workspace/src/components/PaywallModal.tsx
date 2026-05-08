import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Crown, Sparkles } from 'lucide-react';

interface PaywallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpgrade: () => void;
}

export default function PaywallModal({ open, onOpenChange, onUpgrade }: PaywallModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
            <Crown size={24} className="text-primary" />
          </div>
          <DialogTitle className="text-center text-xl">Больше задач — больше порядка</DialogTitle>
          <DialogDescription className="text-center text-muted-foreground">
            Открой безлимитный режим и управляй задачами без ограничений
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          <div className="flex items-center gap-3 px-4 py-3 bg-accent/30 rounded-xl">
            <Sparkles size={18} className="text-primary" />
            <span className="text-sm font-medium">Безлимитные задачи</span>
          </div>
          <div className="flex items-center gap-3 px-4 py-3 bg-accent/30 rounded-xl">
            <Sparkles size={18} className="text-primary" />
            <span className="text-sm font-medium">5 тем оформления</span>
          </div>
          <div className="flex items-center gap-3 px-4 py-3 bg-accent/30 rounded-xl">
            <Sparkles size={18} className="text-primary" />
            <span className="text-sm font-medium">Категории и приоритеты</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button
            onClick={onUpgrade}
            className="w-full gap-2 bg-primary text-primary-foreground rounded-xl py-2.5 font-semibold shadow-sm hover:opacity-90 active:scale-95 transition-all duration-150"
          >
            <Crown size={18} />
            Улучшить до Premium
          </Button>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="w-full text-muted-foreground"
          >
            Может, позже
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}