import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Sparkles, Target, User } from 'lucide-react';

export default function Onboarding() {
  const { completeOnboarding } = useApp();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');

  const steps = [
    {
      title: 'Добро пожаловать в Привычки!',
      description: 'Отслеживайте свои ежедневные привычки, создавайте серии и достигайте целей. Начните свой путь к лучшей версии себя!',
      icon: Sparkles,
    },
    {
      title: 'Ваша первая привычка',
      description: 'Какую привычку вы хотите выработать? Например: "Пить 2 литра воды" или "Читать 20 минут"',
      icon: Target,
      content: (
        <div className="space-y-3">
          <Input
            placeholder="Название привычки"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            className="text-center"
          />
          <p className="text-xs text-muted-foreground text-center">
            Вы сможете добавить больше привычек позже
          </p>
        </div>
      ),
    },
    {
      title: 'Как к вам обращаться?',
      description: 'Укажите ваше имя, чтобы мы могли персонализировать приложение',
      icon: User,
      content: (
        <div className="space-y-3">
          <Input
            placeholder="Ваше имя"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-center"
          />
        </div>
      ),
    },
  ];

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      completeOnboarding({
        name: name || 'Пользователь',
        goal: goal || 'Развиваться каждый день',
      });
      navigate('/', { replace: true });
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  const canProceed = () => {
    if (step === 1 && !goal.trim()) return false;
    if (step === 2 && !name.trim()) return false;
    return true;
  };

  const StepIcon = steps[step].icon;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8">
        <Progress value={((step + 1) / steps.length) * 100} className="h-1.5" />

        <Card className="border-0 shadow-none bg-transparent">
          <CardHeader className="text-center pb-4">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <StepIcon className="w-8 h-8 text-primary" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold">{steps[step].title}</CardTitle>
            <CardDescription className="text-base mt-2">{steps[step].description}</CardDescription>
          </CardHeader>
          <CardContent>
            {steps[step].content}

            <div className="flex gap-3 mt-8">
              {step > 0 && (
                <Button variant="outline" onClick={handleBack} className="flex-1">
                  Назад
                </Button>
              )}
              <Button
                onClick={handleNext}
                disabled={!canProceed()}
                className="flex-1"
              >
                {step === steps.length - 1 ? 'Начать' : 'Далее'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-center gap-2">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === step ? 'bg-primary' : 'bg-muted'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
