import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';

interface UserProfile {
  sleepQuality: string;
  sleepHours: number;
}

export default function Home() {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    const profile = localStorage.getItem('user_profile');
    if (profile) {
      setUserProfile(JSON.parse(profile));
    } else {
      setShowOnboarding(true);
    }
  }, []);

  useEffect(() => {
    if (userProfile) {
      // Fetch recommendations based on userProfile
      setRecommendations([
        'Увеличьте время сна до 7-8 часов.',
        'Избегайте кофеина перед сном.',
        'Создайте рутину перед сном.'
      ]);
    }
  }, [userProfile]);

  return (
    <div className='max-w-md mx-auto min-h-screen p-4'>
      <h1 className='text-2xl font-bold'>Улучшите свой сон</h1>
      {recommendations.length > 0 ? (
        recommendations.map((rec, index) => (
          <Card key={index} className='my-2'>
            {rec}
          </Card>
        ))
      ) : (
        <div className='flex flex-col items-center justify-center py-16 text-muted-foreground'>
          <span className='text-4xl mb-3'>📋</span>
          <p className='text-sm font-medium'>Добавьте записи о сне, чтобы получить рекомендации.</p>
        </div>
      )}
      <Dialog open={showOnboarding} onOpenChange={setShowOnboarding}>
        <Dialog.Trigger asChild>
          <Button>Начать</Button>
        </Dialog.Trigger>
        <Dialog.Content>
          <Dialog.Title>Онбординг</Dialog.Title>
          <Dialog.Description>
            Пожалуйста, заполните информацию о вашем сне.
          </Dialog.Description>
          {/* Onboarding form goes here */}
        </Dialog.Content>
      </Dialog>
    </div>
  );
}