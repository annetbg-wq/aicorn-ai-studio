import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { useProfile } from '@/hooks/useProfile';
import { useHabits } from '@/hooks/useHabits';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { User, Calendar, Target, Flame, LogOut, Edit3, Camera } from 'lucide-react';

const AVATARS = [
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Salem',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Mia',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Leo',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Zoe',
];

export default function Profile() {
  const navigate = useNavigate();
  const { resetProfile } = useApp();
  const { profile, updateProfile, updateAvatar } = useProfile();
  const { habits } = useHabits();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(profile.name);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);

  const totalHabits = habits.length;
  const longestStreak = Math.max(...habits.map(h => h.streak), 0);
  const joinDate = new Date(profile.joinDate).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const handleSaveName = () => {
    if (editName.trim()) {
      updateProfile({ name: editName.trim() });
      setIsEditing(false);
    }
  };

  const handleResetOnboarding = () => {
    resetProfile();
    navigate('/onboarding', { replace: true });
  };

  const initials = profile.name
    ? profile.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <div className="pb-20">
      <div className="p-4 space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Профиль</h1>

        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col items-center">
              <div className="relative">
                <Avatar className="w-20 h-20 ring-2 ring-primary/20 ring-offset-2">
                  {profile.avatar ? (
                    <AvatarImage src={profile.avatar} alt={profile.name} />
                  ) : (
                    <AvatarFallback className="bg-primary/10 text-primary text-xl">
                      {initials}
                    </AvatarFallback>
                  )}
                </Avatar>
                <button
                  className="absolute -bottom-1 -right-1 w-7 h-7 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-md"
                  onClick={() => setShowAvatarPicker(true)}
                >
                  <Camera className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="mt-4 text-center">
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="text-center"
                      autoFocus
                    />
                    <Button size="sm" onClick={handleSaveName}>
                      Сохранить
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 justify-center">
                    <h2 className="text-xl font-bold text-foreground">{profile.name || 'Пользователь'}</h2>
                    <button onClick={() => { setEditName(profile.name); setIsEditing(true); }}>
                      <Edit3 className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                    </button>
                  </div>
                )}
                <div className="flex items-center justify-center gap-1 mt-1 text-sm text-muted-foreground">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>С {joinDate}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <Target className="w-5 h-5 mx-auto mb-1 text-primary" />
              <div className="text-xl font-bold">{totalHabits}</div>
              <div className="text-xs text-muted-foreground">всего привычек</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Flame className="w-5 h-5 mx-auto mb-1 text-warning" />
              <div className="text-xl font-bold">{longestStreak}</div>
              <div className="text-xs text-muted-foreground">лучшая серия</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Настройки</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={handleResetOnboarding}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Пройти обучение заново
            </Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showAvatarPicker} onOpenChange={setShowAvatarPicker}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Выберите аватар</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-4 py-4">
            {AVATARS.map((avatar, index) => (
              <button
                key={index}
                className={`p-2 rounded-xl transition-all ${
                  profile.avatar === avatar
                    ? 'ring-2 ring-primary ring-offset-2 bg-primary/5'
                    : 'hover:bg-muted'
                }`}
                onClick={() => {
                  updateAvatar(avatar);
                  setShowAvatarPicker(false);
                }}
              >
                <Avatar className="w-16 h-16 mx-auto">
                  <AvatarImage src={avatar} />
                  <AvatarFallback>A</AvatarFallback>
                </Avatar>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
