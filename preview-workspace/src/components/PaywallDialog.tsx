import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Sparkles, Lock, CheckCircle2 } from 'lucide-react';

interface PaywallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpgrade: () => void;
}

export default function PaywallDialog({ open, onOpenChange, onUpgrade }: PaywallDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center mb-4">
            <Sparkles size={32} className="text-foreground" />
          </div>
          <DialogTitle className="text-center text-2xl font-bold">
            Разблокируйте безлимитные привычки
          </DialogTitle>
          <DialogDescription className="text-center text-muted-foreground">
            Достигайте целей быстрее с премиум-доступом
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={20} className="text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-foreground">Неограниченное количество привычек</p>
              <p className="text-sm text-muted-foreground">Создавайте сколько угодно привычек</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle2 size={20} className="text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-foreground">Детальная аналитика</p>
              <p className="text-sm text-muted-foreground">Графики, отчёты и инсайты</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle2 size={20} className="text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-foreground">Экспорт данных</p>
              <p className="text-sm text-muted-foreground">CSV и PDF отчёты</p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <Button 
            onClick={onUpgrade}
            className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90 text-foreground font-semibold py-6 rounded-xl"
          >
            <Sparkles size={18} className="mr-2" />
            Перейти на Премиум — 299 ₽/мес
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