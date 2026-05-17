import { Card } from '@/components/ui/Card';
export function KPICard({ label, value, hint }: { label: string; value: string; hint: string }) { return <Card><span className="eyebrow">{label}</span><strong style={{ fontSize: 28 }}>{value}</strong><p className="subtitle">{hint}</p></Card>; }
