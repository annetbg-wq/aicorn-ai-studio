import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Crown, Check, Sparkles } from 'lucide-react';
import { useApp } from '../App';

interface PaywallModalProps {
  trigger: React.ReactNode;
}

const FEATURES = [
  'Безлимитные мероприятия',
  'Расширенная аналитика посещаемости',
  'Приоритетная поддержка',
  'Экспорт списков участников',
  'Персональные рекомендации',
];

export default function PaywallModal({ trigger }: PaywallModalProps) {
  const [open, setOpen] = useState(false);
  const { setIsPremium } = useApp();

  const handleUpgrade = () => {
    setIsPremium(true);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="rounded-2xl sm:max-w-sm">
        <DialogHeader>
          <div className="mx-auto w-14 h-14 rounded-2xl bg-accent/15 flex items-center justify-center mb-3">
            <Crown className="w-7 h-7 text-accent" />
          </div>
          <DialogTitle className="text-center text-xl" style={{ fontFamily: 'Georgia, serif' }}>
            Разблокируйте больше возможностей
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <p className="text-sm text-muted-foreground text-center">
            Управляйте мероприятиями без ограничений с Community Connect Pro.
          </p>
          <div className="space-y-3">
            {FEATURES.map((feature) => (
              <div key={feature} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Check className="w-3 h-3 text-primary" />
                </div>
                <span className="text-sm text-foreground">{feature}</span>
              </div>
            ))}
          </div>
          <Button
            onClick={handleUpgrade}
            className="w-full rounded-xl min-h-[52px] text-base font-semibold active:scale-[0.98] transition-transform duration-100"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Активировать Pro
          </Button>
          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
            className="w-full rounded-xl text-muted-foreground"
          >
            Может быть позже
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}