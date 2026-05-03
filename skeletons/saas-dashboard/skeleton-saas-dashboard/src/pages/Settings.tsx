import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { Avatar, AvatarFallback } from '@/components/ui/Avatar';
import type { ThemeChoice } from '@/data/types';

export default function Settings(): JSX.Element {
  const { profile, themeChoice, setTheme, updateProfile } = useApp();
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);

  function handleSaveGeneral(): void {
    updateProfile({ name, email });
  }

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your workspace, team, and preferences.
        </p>
      </header>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="api">API</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>Your display name and contact email.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field label="Display name">
                <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={120}
                />
              </Field>
              <div>
                <Button onClick={handleSaveGeneral}>Save changes</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>Theme used across the workspace.</CardDescription>
            </CardHeader>
            <CardContent>
              <Field label="Theme">
                <Select
                  value={themeChoice}
                  onValueChange={(v) => setTheme(v as ThemeChoice)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select theme" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system">Match system</SelectItem>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="team">
          <Card>
            <CardHeader>
              <CardTitle>Team members</CardTitle>
              <CardDescription>People with access to this workspace.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {/* SEED: agent injects real team members. */}
                <TeamMember name={profile.name} email={profile.email} role="Owner" />
              </ul>
              <div className="mt-4">
                <Button variant="outline" size="sm">
                  Invite member
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing">
          <Card>
            <CardHeader>
              <CardTitle>Plan</CardTitle>
              <CardDescription>Manage your subscription and invoices.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-md border border-border p-4">
                <div>
                  <p className="font-medium">Pro</p>
                  <p className="text-sm text-muted-foreground">$49/month, billed monthly</p>
                </div>
                <Badge>Active</Badge>
              </div>
              <Button variant="outline" size="sm">
                Change plan
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api">
          <Card>
            <CardHeader>
              <CardTitle>API keys</CardTitle>
              <CardDescription>
                Programmatic access tokens for this workspace.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* PRODUCT: render real keys with copy + revoke actions. */}
              <div className="flex items-center justify-between rounded-md border border-border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Production key</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    sk_live_••••••••••••••
                  </p>
                </div>
                <Button variant="outline" size="sm">
                  Copy
                </Button>
              </div>
              <Button variant="outline" size="sm">
                Generate new key
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface FieldProps {
  label: string;
  children: React.ReactNode;
}

function Field({ label, children }: FieldProps): JSX.Element {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

interface TeamMemberProps {
  name: string;
  email: string;
  role: string;
}

function TeamMember({ name, email, role }: TeamMemberProps): JSX.Element {
  return (
    <li className="flex items-center gap-3 rounded-md border border-border p-3">
      <Avatar className="h-9 w-9">
        <AvatarFallback className="text-xs">{name[0]?.toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{email}</p>
      </div>
      <Badge variant="secondary">{role}</Badge>
    </li>
  );
}
