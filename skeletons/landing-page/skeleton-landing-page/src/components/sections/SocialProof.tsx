import { SOCIAL_PROOF_LOGOS } from '@/data/content';

export function SocialProof(): JSX.Element {
  return (
    <section aria-label="Trusted by" className="border-y border-border bg-muted/30 py-10">
      <div className="mx-auto max-w-6xl px-4">
        <p className="text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Trusted by teams at
        </p>
        <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4 md:grid-cols-8">
          {SOCIAL_PROOF_LOGOS.map((name) => (
            <div
              key={name}
              className="flex items-center justify-center text-sm font-semibold tracking-tight text-muted-foreground"
            >
              {name}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
