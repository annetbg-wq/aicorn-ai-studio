import React, { useState } from 'react';
import { OnboardingStep } from './OnboardingStep';

interface Step {
  title: string;
  description: string;
  options?: string[];
}

interface OnboardingWizardProps {
  steps: Step[];
  onComplete: (answers: Record<number, string[]>) => void;
}

export function OnboardingWizard({ steps, onComplete }: OnboardingWizardProps) {
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string[]>>({});

  const defaultSteps: Step[] = steps.length > 0 ? steps : [
    { title: 'Добро пожаловать!', description: 'Давайте настроим приложение под вас. Это займёт 30 секунд.' },
    { title: 'Что вас интересует?', description: 'Выберите основные направления.', options: ['Продуктивность', 'Здоровье', 'Финансы', 'Обучение'] },
    { title: 'Почти готово', description: 'Ваш персональный профиль создан. Начнём!' },
  ];

  const total = defaultSteps.length;
  const step = defaultSteps[current];

  const toggleOption = (option: string) => {
    setAnswers(prev => {
      const cur = prev[current] ?? [];
      return { ...prev, [current]: cur.includes(option) ? cur.filter(o => o !== option) : [...cur, option] };
    });
  };

  const next = () => {
    if (current < total - 1) setCurrent(c => c + 1);
    else onComplete(answers);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', maxWidth: 430, margin: '0 auto' }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <OnboardingStep
          step={current} total={total}
          title={step.title} description={step.description}
          options={step.options}
          selectedOptions={answers[current]}
          onSelect={toggleOption}
        />
      </div>
      <div style={{ padding: '16px 24px 32px', display: 'flex', gap: 10 }}>
        {current > 0 && (
          <button onClick={() => setCurrent(c => c - 1)} style={{ flex: 1, padding: '14px', borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e5ea', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Назад
          </button>
        )}
        <button onClick={next} style={{ flex: 2, padding: '14px', borderRadius: 12, background: '#a78bfa', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          {current < total - 1 ? 'Продолжить' : 'Начать'}
        </button>
      </div>
    </div>
  );
}
