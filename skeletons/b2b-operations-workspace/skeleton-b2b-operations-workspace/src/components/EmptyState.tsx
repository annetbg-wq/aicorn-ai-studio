import { Button } from '@/components/ui/Button';
export function EmptyState({ title, text, action, onAction }: { title: string; text: string; action?: string; onAction?: () => void }) {
  return <section className="card pad stack"><strong>{title}</strong><p className="subtitle">{text}</p>{action ? <Button variant="secondary" onClick={onAction}>{action}</Button> : null}</section>;
}
