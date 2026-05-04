import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, CreditCard, MapPin, Package } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent } from '@/components/ui/Card';
import { ROUTES } from '@/config/routes';
import { APP_CONFIG } from '@/config/app';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/cn';

type Step = 'address' | 'payment' | 'review';

const STEP_ORDER: readonly Step[] = ['address', 'payment', 'review'];

export default function Checkout(): JSX.Element {
  const navigate = useNavigate();
  const { cart } = useApp();

  const [step, setStep] = useState<Step>('address');
  const [name, setName] = useState('');
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('');
  const [postal, setPostal] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [exp, setExp] = useState('');
  const [cvc, setCvc] = useState('');

  const stepIndex = STEP_ORDER.indexOf(step);

  const canAdvance =
    (step === 'address' && name && line1 && city && postal) ||
    (step === 'payment' && cardNumber.length >= 12 && exp && cvc) ||
    step === 'review';

  function handleNext(event?: FormEvent): void {
    if (event) event.preventDefault();
    if (!canAdvance) return;

    if (step === 'review') {
      cart.clear();
      navigate(ROUTES.home);
      return;
    }
    setStep(STEP_ORDER[stepIndex + 1]);
  }

  const shipping = cart.subtotal >= APP_CONFIG.freeShippingThreshold ? 0 : 8;
  const tax = Math.round(cart.subtotal * 0.08);
  const total = cart.subtotal + shipping + tax;

  return (
    <div className="flex min-h-full flex-col safe-top">
      <header className="flex items-center justify-between border-b border-border px-4 pb-3 pt-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => (stepIndex > 0 ? setStep(STEP_ORDER[stepIndex - 1]) : navigate(-1))}
          className="-ml-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <h1 className="text-sm font-semibold tracking-tight">Checkout</h1>
        <span className="w-16" aria-hidden />
      </header>

      <div className="flex items-center gap-2 px-5 py-3 text-xs">
        {STEP_ORDER.map((s, i) => {
          const done = i < stepIndex;
          const active = i === stepIndex;
          const label = s === 'address' ? 'Address' : s === 'payment' ? 'Payment' : 'Review';
          const Icon = s === 'address' ? MapPin : s === 'payment' ? CreditCard : Package;
          return (
            <div key={s} className="flex items-center gap-2">
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold',
                  done && 'bg-success text-primary-foreground',
                  active && 'bg-primary text-primary-foreground',
                  !done && !active && 'bg-muted text-muted-foreground',
                )}
              >
                {done ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
              </span>
              <span className={cn(active && 'font-medium')}>{label}</span>
              {i < STEP_ORDER.length - 1 && <span className="text-muted-foreground">·</span>}
            </div>
          );
        })}
      </div>

      <main className="flex-1 px-4 pb-32">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="space-y-3"
          >
            {step === 'address' && (
              <form onSubmit={handleNext} className="space-y-3">
                <Field label="Full name">
                  <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                </Field>
                <Field label="Street address">
                  <Input value={line1} onChange={(e) => setLine1(e.target.value)} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="City">
                    <Input value={city} onChange={(e) => setCity(e.target.value)} />
                  </Field>
                  <Field label="Postal code">
                    <Input
                      value={postal}
                      onChange={(e) => setPostal(e.target.value)}
                      inputMode="numeric"
                    />
                  </Field>
                </div>
              </form>
            )}

            {step === 'payment' && (
              <form onSubmit={handleNext} className="space-y-3">
                <Field label="Card number">
                  <Input
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    inputMode="numeric"
                    autoFocus
                    placeholder="1234 5678 9012 3456"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Expiration">
                    <Input
                      value={exp}
                      onChange={(e) => setExp(e.target.value)}
                      placeholder="MM / YY"
                    />
                  </Field>
                  <Field label="CVC">
                    <Input
                      value={cvc}
                      onChange={(e) => setCvc(e.target.value)}
                      inputMode="numeric"
                    />
                  </Field>
                </div>
              </form>
            )}

            {step === 'review' && (
              <Card>
                <CardContent className="space-y-3 p-4 text-sm">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Ship to</p>
                    <p>{name}</p>
                    <p className="text-muted-foreground">
                      {line1}, {city} {postal}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Pay with</p>
                    <p>•••• {cardNumber.slice(-4)}</p>
                  </div>
                  <div className="border-t border-border pt-3">
                    <Row label="Subtotal" value={formatPrice(cart.subtotal)} />
                    <Row
                      label="Shipping"
                      value={shipping === 0 ? 'Free' : formatPrice(shipping)}
                    />
                    <Row label="Tax" value={formatPrice(tax)} />
                    <div className="mt-1 flex items-baseline justify-between border-t border-border pt-2 text-base font-semibold">
                      <span>Total</span>
                      <span className="tabular-nums">{formatPrice(total)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md border-t border-border bg-card/95 p-4 backdrop-blur safe-bottom">
        <Button size="lg" className="w-full" disabled={!canAdvance} onClick={handleNext}>
          {step === 'review' ? `Place order — ${formatPrice(total)}` : 'Continue'}
          {step !== 'review' && <ArrowRight className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

interface FieldProps {
  label: string;
  children: React.ReactNode;
}

function Field({ label, children }: FieldProps): JSX.Element {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

interface RowProps {
  label: string;
  value: string;
}

function Row({ label, value }: RowProps): JSX.Element {
  return (
    <div className="flex items-baseline justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
