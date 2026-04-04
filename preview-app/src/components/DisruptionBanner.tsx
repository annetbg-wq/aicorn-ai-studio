import { Button } from "@/components/ui/button";
import { AlertTriangle, X } from 'lucide-react';
import { Alert } from '../data/seed';

interface DisruptionBannerProps {
  alerts: Alert[];
  visible: boolean;
  onDismiss: () => void;
}

export default function DisruptionBanner({ alerts, visible, onDismiss }: DisruptionBannerProps) {
  if (!visible || alerts.length === 0) return null;

  const unread = alerts.filter(a => !a.isRead);
  const latest = unread.length > 0 ? unread[0] : alerts[0];

  return (
    <div className="animate-in slide-in-from-top-2 duration-300 bg-amber-500/15 border border-amber-500/30 rounded-xl px-4 py-3 mb-3">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-amber-300">Disruption Alert</p>
          <p className="text-xs text-amber-200/80 mt-1 line-clamp-2">{latest.message}</p>
          {unread.length > 1 && (
            <p className="text-xs text-amber-400/60 mt-1">+{unread.length - 1} more alert{unread.length > 2 ? 's' : ''}</p>
          )}
        </div>
        <Button
          onClick={onDismiss}
          className="shrink-0 p-1 rounded-md hover:bg-amber-500/20 transition-colors"
          aria-label="Dismiss alert"
        >
          <X className="h-4 w-4 text-amber-400" />
        </Button>
      </div>
    </div>
  );
}