import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Crown, LogOut, Shield, Sparkles } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { ROUTES } from '@/config/routes';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Avatar, AvatarFallback } from '@/components/ui/Avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { PaywallSheet } from '@/components/PaywallSheet';
import type { ThemeChoice } from '@/data/types';

const PLAN_LABEL: Record<string, string> = {
  free: 'Free',
  pro: 'Pro',
  premium: 'Premium',
};

export default function Profile(): JSX.Element {
  const navigate = useNavigate();
  const { profile, isPremium, themeChoice, setTheme, setPlan, resetProfile } = useApp();
  const [paywallOpen, setPaywallOpen] = useState(false);

  function handleSignOut(): void {
    resetProfile();
    navigate(ROUTES.onboarding, { replace: true });
  }

  return (
    <div className="flex min-h-full flex-col safe-top">
      <header className="px-5 pb-4 pt-6">
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
      </header>

      <main className="flex-1 space-y-6 px-5 pb-32">
        <section className="flex items-center gap-4 rounded-lg border border-border bg-card p-4">
          <Avatar className="h-14 w-14">
            <AvatarFallback className="text-lg">
              {(profile.name[0] ?? '·').toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold">{profile.name || 'Guest'}</p>
            <p className="truncate text-sm text-muted-foreground">
              {profile.goal || 'No goal set'}
            </p>
          </div>
          <Badge variant={isPremium ? 'default' : 'secondary'}>{PLAN_LABEL[profile.plan]}</Badge>
        </section>

        <section className="space-y-2">
          <h2 className="px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Subscription
          </h2>
          {isPremium ? (
            <button
              type="button"
              onClick={() => setPlan('free')}
              className="group flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted"
            >
              <div className="flex items-center gap-3">
                <Crown className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-medium">Manage subscription</p>
                  <p className="text-xs text-muted-foreground">
                    Currently on {PLAN_LABEL[profile.plan]}
                  </p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setPaywallOpen(true)}
              className="group flex w-full items-center justify-between rounded-lg border border-primary bg-primary/5 px-4 py-3 text-left transition-colors hover:bg-primary/10"
            >
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-medium">Upgrade to Pro</p>
                  <p className="text-xs text-muted-foreground">Unlock everything</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-primary transition-transform group-hover:translate-x-0.5" />
            </button>
          )}
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
          <SettingRow icon={Shield} label="Privacy" hint="Data and permissions" />
          {/* PRODUCT: add domain-specific rows (notifications, units, integrations…). */}
        </section>

        <section className="pt-2">
          <Button variant="outline" className="w-full" onClick={handleSignOut}>
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </section>
      </main>

      <PaywallSheet
        open={paywallOpen}
        onOpenChange={setPaywallOpen}
        onSelect={(plan) => {
          setPlan(plan);
          setPaywallOpen(false);
        }}
      />
    </div>
  );
}

interface SettingRowProps {
  icon: typeof Shield;
  label: string;
  hint: string;
}

function SettingRow({ icon: Icon, label, hint }: SettingRowProps): JSX.Element {
  return (
    <button
      type="button"
      className="group flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted"
    >
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}
