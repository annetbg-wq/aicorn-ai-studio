import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { ROUTES } from '@/config/routes';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { useApp } from '@/context/AppContext';
import { UserAvatar } from '@/components/UserAvatar';

type Step = 'compose' | 'preview';

export default function Create(): JSX.Element {
  const navigate = useNavigate();
  const { currentUser } = useApp();

  const [step, setStep] = useState<Step>('compose');
  const [body, setBody] = useState('');

  const canPost = body.trim().length > 0;

  function handleNext(event?: FormEvent): void {
    if (event) event.preventDefault();
    if (!canPost) return;
    setStep('preview');
  }

  function handlePublish(): void {
    /* PRODUCT: persist the new post and route to feed. */
    navigate(ROUTES.feed);
  }

  return (
    <div className="flex min-h-full flex-col safe-top">
      <header className="flex items-center justify-between border-b border-border px-4 pb-3 pt-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => (step === 'preview' ? setStep('compose') : navigate(-1))}
          className="-ml-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {step === 'compose' ? 'New post' : 'Preview'}
        </span>
        <span className="w-16" aria-hidden />
      </header>

      <main className="flex-1 px-4 pb-32 pt-4">
        <AnimatePresence mode="wait">
          {step === 'compose' ? (
            <motion.form
              key="compose"
              onSubmit={handleNext}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="space-y-4"
            >
              <textarea
                autoFocus
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="What's on your mind?"
                maxLength={500}
                className="min-h-32 w-full resize-none rounded-md border border-input bg-background p-3 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{body.length} / 500</span>
                {/* PRODUCT: add image attach, link preview, mentions, etc. */}
              </div>
            </motion.form>
          ) : (
            <motion.div
              key="preview"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <UserAvatar user={currentUser} size="md" />
                    <div>
                      <p className="text-sm font-medium">{currentUser.name}</p>
                      <p className="text-xs text-muted-foreground">@{currentUser.handle} · just now</p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed">{body}</p>
                </CardContent>
              </Card>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Looks good? Publish below.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md border-t border-border bg-card/95 p-4 backdrop-blur safe-bottom">
        {step === 'compose' ? (
          <Button size="lg" className="w-full" disabled={!canPost} onClick={handleNext}>
            Continue
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button size="lg" className="w-full" onClick={handlePublish}>
            Publish
          </Button>
        )}
      </div>
    </div>
  );
}
