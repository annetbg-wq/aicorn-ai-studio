import { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { Button } from './ui/button';

interface PaywallModalProps {
  trigger: ReactNode;
}

export default function PaywallModal({ trigger }: PaywallModalProps) {
  const handleUpgrade = () => {
    localStorage.setItem('is_premium', 'true');
    window.location.reload();
  };

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center text-lg">
            Unlock Predictive Pricing
          </DialogTitle>
          <DialogDescription className="text-center text-sm text-muted-foreground mt-2">
            You've saved 5 routes — great planning! Upgrade to unlock historical rate analytics and predictive pricing models so you can lock in rates before they spike.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 mt-4">
          <div className="bg-muted/50 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <span className="text-emerald-400">✓</span> Historical rate trends (12 months)
            </div>
            <div className="flex items-center gap-2 text-sm text-foreground">
              <span className="text-emerald-400">✓</span> Predictive pricing models
            </div>
            <div className="flex items-center gap-2 text-sm text-foreground">
              <span className="text-emerald-400">✓</span> Unlimited saved routes
            </div>
          </div>
          <Button onClick={handleUpgrade} className="w-full active:scale-95 transition-transform duration-100">
            Upgrade to Pro
          </Button>
          <Button variant="ghost" className="w-full text-muted-foreground">
            Maybe later
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}