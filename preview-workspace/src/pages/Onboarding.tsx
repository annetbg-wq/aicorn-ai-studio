import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Check } from 'lucide-react';

interface Step {
  question: string;
  type: 'multi-choice' | 'single-choice';
  options: string[];
  storesIn: string;
}

const steps: Step[] = [
  {
    question: 'Какие мероприятия вы хотите организовывать?',
    type: 'multi-choice',
    options: ['Мастер-классы', 'Социальные встречи', 'Волонтёрство', 'Здоровье и фитнес'],
    storesIn: 'interests',
  },
  {
    question: 'Сколько людей вы обычно привлекаете?',
    type: 'single-choice',
    options: ['1–10', '11–50', '51–100', '100+'],
    storesIn: 'groupSize',
  },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});

  const step = steps[currentStep];
  const progress = ((currentStep + 1) / steps.length) * 100;

  const toggleOption = (option: string) => {
    const key = step.storesIn;
    const current = answers[key] || [];

    if (step.type === 'multi-choice') {
      setAnswers({
        ...answers,
        [key]: current.includes(option)
          ? current.filter((o) => o !== option)
          : [...current, option],
      });
    } else {
      setAnswers({ ...answers, [key]: [option] });
    }
  };

  const isSelected = (option: string) => {
    return (answers[step.storesIn] || []).includes(option);
  };

  const canProceed = (answers[step.storesIn] || []).length > 0;

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      const profile = {
        interests: answers['interests'] || [],
        groupSize: (answers['groupSize'] || [''])[0],
        name: '',
      };
      localStorage.setItem('userProfile', JSON.stringify(profile));
      localStorage.setItem('onboarding_complete', 'true');
      navigate('/');
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-250">
      <div className="mx-auto max-w-md py-8">
        {/* Progress */}
        <div className="mb-8">
          <div className="mb-2 flex items-center justify-between text-sm text-muted-foreground">
            <span>Шаг {currentStep + 1} из {steps.length}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Question */}
        <h2 className="mb-2 text-xl font-semibold text-foreground" style={{ fontFamily: 'Georgia, serif' }}>
          {step.question}
        </h2>
        <p className="mb-6 text-sm text-muted-foreground">
          {step.type === 'multi-choice'
            ? 'Выберите один или несколько вариантов'
            : 'Выберите один вариант'}
        </p>

        {/* Options */}
        <div className="space-y-3">
          {step.options.map((option) => {
            const selected = isSelected(option);
            return (
              <Button
                key={option}
                onClick={() => toggleOption(option)}
                className={`flex w-full items-center justify-between rounded-xl border-2 px-4 py-4 text-left text-sm font-medium transition-all duration-200 active:scale-[0.98] ${
                  selected
                    ? 'border-primary bg-primary/5 text-foreground'
                    : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent/30'
                }`}
              >
                <span>{option}</span>
                {selected && (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary">
                    <Check className="h-3.5 w-3.5 text-primary-foreground" />
                  </div>
                )}
              </Button>
            );
          })}
        </div>

        {/* Actions */}
        <div className="mt-8 flex gap-3">
          {currentStep > 0 && (
            <Button
              variant="outline"
              onClick={() => setCurrentStep(currentStep - 1)}
              className="flex-1"
            >
              Назад
            </Button>
          )}
          <Button
            onClick={handleNext}
            disabled={!canProceed}
            className="flex-1"
          >
            {currentStep === steps.length - 1 ? 'Начать' : 'Далее'}
          </Button>
        </div>
      </div>
    </div>
  );
}