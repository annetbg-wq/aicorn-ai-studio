import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { APP_CONFIG } from '@/config/app';
import { ROUTES } from '@/config/routes';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Progress } from '@/components/ui/Progress';

interface StepDefinition {
  id: 'welcome' | 'name' | 'goal';
  title: string;
  subtitle: string;
}

const STEPS: readonly StepDefinition[] = [
  {
    id: 'welcome',
    title: `Welcome to ${APP_CONFIG.name}`,
    /* PRODUCT: replace with the value-prop sentence the founder wrote. */
    subtitle: APP_CONFIG.tagline,
  },
  {
    id: 'name',
    title: 'What should we call you?',
    subtitle: "We'll use this to keep things personal.",
  },
  {
    id: 'goal',
    title: 'What brings you here?',
    /* PRODUCT: replace placeholder examples with domain-specific ones. */
    subtitle: 'A short note in your own words is enough.',
  },
] as const;

export default function Onboarding(): JSX.Element {
  const navigate = useNavigate();
  const { completeOnboarding } = useApp();

  const [stepIndex, setStepIndex] = useState(0);
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');

  const step = STEPS[stepIndex];
  const progress = ((stepIndex + 1) / STEPS.length) * 100;
  const canAdvance =
    step.id === 'welcome' ||
    (step.id === 'name' && name.trim().length >= 2) ||
    (step.id === 'goal' && goal.trim().length >= 3);

  function handleNext(event?: FormEvent): void {
    if (event) event.preventDefault();
    if (!canAdvance) return;

    if (stepIndex < STEPS.length - 1) {
      setStepIndex(stepIndex + 1);
      return;
    }
    completeOnboarding({ name, goal });
    navigate(ROUTES.home, { replace: true });
  }

  return (
    <div className="flex min-h-full flex-col safe-top">
      <div className="px-6 pt-6">
        <Progress value={progress} aria-label="Onboarding progress" />
      </div>

      <form onSubmit={handleNext} className="flex flex-1 flex-col justify-between px-6 pb-8 pt-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={step.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="space-y-6"
          >
            <div className="space-y-3">
              {step.id === 'welcome' && (
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Sparkles className="h-6 w-6" />
                </div>
              )}
              <h1 className="text-2xl font-semibold leading-tight tracking-tight">{step.title}</h1>
              <p className="text-base text-muted-foreground">{step.subtitle}</p>
            </div>

            {step.id === 'name' && (
              <Input
                autoFocus
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-label="Your name"
                maxLength={40}
              />
            )}

            {step.id === 'goal' && (
              <Input
                autoFocus
                /* PRODUCT: replace with a domain example. */
                placeholder="e.g. Build a calmer morning routine"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                aria-label="Your goal"
                maxLength={120}
              />
            )}
          </motion.div>
        </AnimatePresence>

        <div className="flex flex-col gap-2">
          <Button type="submit" size="lg" disabled={!canAdvance} className="w-full">
            {stepIndex < STEPS.length - 1 ? 'Continue' : 'Start'}
            <ArrowRight className="h-4 w-4" />
          </Button>
          {stepIndex > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setStepIndex(stepIndex - 1)}
              className="w-full"
            >
              Back
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
