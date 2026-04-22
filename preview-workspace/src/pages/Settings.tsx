import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { User, Bell, Calendar, LogOut, Trash2, Download, Crown } from 'lucide-react';

interface UserProfile {
  name: string;
  interests: string[];
  groupSize: string;
}

export default function Settings() {
  const [profile, setProfile] = useState<UserProfile>({ name: '', interests: [], groupSize: '' });
  const [notifEvents, setNotifEvents] = useState(true);
  const [notifUpdates, setNotifUpdates] = useState(true);
  const [isPremium, setIsPremium] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('userProfile');
    if (saved) {
      setProfile(JSON.parse(saved));
    }
    setIsPremium(localStorage.getItem('is_premium') === 'true');
  }, []);

  const handleSaveName = () => {
    localStorage.setItem('userProfile', JSON.stringify(profile));
  };

  const handleExport = () => {
    const data = {
      profile: JSON.parse(localStorage.getItem('userProfile') || '{}'),
      events: JSON.parse(localStorage.getItem('events') || '[]'),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'community-connect-data.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClearData = () => {
    localStorage.removeItem('events');
    localStorage.removeItem('userProfile');
    localStorage.removeItem('onboarding_complete');
    localStorage.removeItem('is_premium');
    setClearDialogOpen(false);
    window.location.reload();
  };

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-250">
      <h1 className="mb-6 text-2xl font-bold text-foreground" style={{ fontFamily: 'Georgia, serif' }}>
        Настройки
      </h1>

      <div className="space-y-6">
        {/* Account */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4" />
              Аккаунт
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
                {(profile.name || 'U').charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{profile.name || 'Пользователь'}</p>
                <p className="text-xs text-muted-foreground">
                  {profile.interests.length > 0 ? profile.interests.join(', ') : 'Интересы не указаны'}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="settings-name">Имя</Label>
              <div className="flex gap-2">
                <Input
                  id="settings-name"
                  placeholder="Ваше имя"
                  value={profile.name}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                />
                <Button onClick={handleSaveName} variant="outline" size="sm">
                  Сохранить
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Subscription */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Crown className="h-4 w-4" />
              Подписка
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {isPremium ? 'Премиум' : 'Бесплатный план'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isPremium
                    ? 'Все расширенные функции доступны'
                    : 'До 3 мероприятий, базовые инструменты'}
                </p>
              </div>
              {!isPremium && (
                <Badge className="bg-accent text-accent-foreground">Бесплатно</Badge>
              )}
            </div>
            {!isPremium && (
              <Button
                className="mt-4 w-full"
                onClick={() => {
                  localStorage.setItem('is_premium', 'true');
                  setIsPremium(true);
                }}
              >
                Обновить до Премиум
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4" />
              Уведомления
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Новые мероприятия</p>
                <p className="text-xs text-muted-foreground">Уведомления о новых событиях рядом</p>
              </div>
              <Switch checked={notifEvents} onCheckedChange={setNotifEvents} />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Обновления сообщества</p>
                <p className="text-xs text-muted-foreground">Еженедельная сводка активности</p>
              </div>
              <Switch checked={notifUpdates} onCheckedChange={setNotifUpdates} />
            </div>
          </CardContent>
        </Card>

        {/* Data */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Download className="h-4 w-4" />
              Данные
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" className="w-full gap-2" onClick={handleExport}>
              <Download className="h-4 w-4" />
              Экспортировать данные
            </Button>
            <Dialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive" className="w-full gap-2">
                  <Trash2 className="h-4 w-4" />
                  Очистить все данные
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle>Очистить данные?</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">
                  Все мероприятия и настройки будут удалены. Это действие нельзя отменить.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setClearDialogOpen(false)} className="flex-1">
                    Отмена
                  </Button>
                  <Button variant="destructive" onClick={handleClearData} className="flex-1">
                    Удалить
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        {/* App info */}
        <div className="py-4 text-center">
          <p className="text-xs text-muted-foreground">Community Connect v1.0.0</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Платформа для местных сообществ
          </p>
        </div>
      </div>
    </div>
  );
}