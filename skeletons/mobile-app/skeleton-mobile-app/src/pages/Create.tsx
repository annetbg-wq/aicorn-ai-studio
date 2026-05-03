import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { ROUTES } from '@/config/routes';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

/**
 * Compose a new feed item. Skeleton form — agent extends with
 * domain-specific fields (category picker, attachments, etc.).
 */
export default function Create(): JSX.Element {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');

  const canSubmit = title.trim().length > 0;

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    if (!canSubmit) return;
    /* PRODUCT: persist the new item, then route back to home. */
    navigate(ROUTES.home);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="flex min-h-full flex-col safe-top"
    >
      <header className="flex items-center justify-between px-4 pt-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="-ml-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <span className="text-xs text-muted-foreground">New item</span>
      </header>

      <main className="flex-1 px-5 pb-32 pt-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <CardTitle>What are you adding?</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="create-title" className="text-xs font-medium text-muted-foreground">
                  Title
                </label>
                <Input
                  id="create-title"
                  autoFocus
                  /* PRODUCT: replace placeholder with a domain example. */
                  placeholder="Short, descriptive name"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={60}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="create-subtitle" className="text-xs font-medium text-muted-foreground">
                  Description (optional)
                </label>
                <Input
                  id="create-subtitle"
                  placeholder="One-line note"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  maxLength={120}
                />
              </div>
            </CardContent>
          </Card>
        </form>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md border-t border-border bg-card/95 p-4 backdrop-blur safe-bottom">
        <Button size="lg" className="w-full" disabled={!canSubmit} onClick={handleSubmit as () => void}>
          Save
        </Button>
      </div>
    </motion.div>
  );
}
