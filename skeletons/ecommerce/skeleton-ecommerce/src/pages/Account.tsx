import {
  ChevronRight,
  CreditCard,
  HelpCircle,
  LogOut,
  MapPin,
  Package,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Avatar, AvatarFallback } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import type { ThemeChoice } from '@/data/types';

interface RowDef {
  icon: typeof Package;
  label: string;
  hint: string;
}

const ROWS: readonly RowDef[] = [
  { icon: Package, label: 'Orders', hint: 'Track and review past orders' },
  { icon: MapPin, label: 'Addresses', hint: 'Saved shipping locations' },
  { icon: CreditCard, label: 'Payment methods', hint: 'Cards and stored details' },
  { icon: HelpCircle, label: 'Help', hint: 'Returns, shipping, contact' },
];

export default function Account(): JSX.Element {
  const { themeChoice, setTheme } = useApp();

  return (
    <div className="flex min-h-full flex-col safe-top">
      <header className="border-b border-border px-5 pb-3 pt-6">
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
      </header>

      <main className="flex-1 space-y-6 px-5 pb-32 pt-4">
        {/* PRODUCT: replace with real session profile. */}
        <section className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
          <Avatar className="h-12 w-12">
            <AvatarFallback>G</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold">Guest</p>
            <p className="text-xs text-muted-foreground">Sign in to sync orders across devices.</p>
          </div>
          <Button size="sm">Sign in</Button>
        </section>

        <section className="space-y-2">
          {ROWS.map((row) => (
            <button
              key={row.label}
              type="button"
              className="group flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted"
            >
              <div className="flex items-center gap-3">
                <row.icon className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{row.label}</p>
                  <p className="text-xs text-muted-foreground">{row.hint}</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
          ))}
        </section>

        <section className="space-y-2">
          <h2 className="px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Preferences
          </h2>
          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">Theme</span>
            </div>
            <Select value={themeChoice} onValueChange={(value) => setTheme(value as ThemeChoice)}>
              <SelectTrigger>
                <SelectValue placeholder="Select theme" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">Match system</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </section>

        <section>
          <Button variant="outline" className="w-full">
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </section>
      </main>
    </div>
  );
}
