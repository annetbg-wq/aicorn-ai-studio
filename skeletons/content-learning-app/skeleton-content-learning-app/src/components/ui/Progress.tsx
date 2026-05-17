export function Progress({ value }: { value: number }) {
  const safeValue = Math.max(0, Math.min(100, value));
  return <div className="progress" aria-label={`Progress ${safeValue}%`}><span style={{ width: `${safeValue}%` }} /></div>;
}
