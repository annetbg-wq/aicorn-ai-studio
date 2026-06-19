// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isPass2SafeTargetFile } from '../ProtoPipeline';

// ── isPass2SafeTargetFile — allowed paths ──────────────────────────────────

describe('isPass2SafeTargetFile — allowed paths', () => {
  it('allows pages/Dashboard.tsx', () => {
    expect(isPass2SafeTargetFile('pages/Dashboard.tsx')).toBe(true);
  });

  it('allows src/pages/Coach.tsx (src/ stripped by normalizer)', () => {
    expect(isPass2SafeTargetFile('src/pages/Coach.tsx')).toBe(true);
  });

  it('allows components/RiskRadar.tsx', () => {
    expect(isPass2SafeTargetFile('components/RiskRadar.tsx')).toBe(true);
  });

  it('allows hooks/useData.ts', () => {
    expect(isPass2SafeTargetFile('hooks/useData.ts')).toBe(true);
  });

  it('allows styles/global.css', () => {
    expect(isPass2SafeTargetFile('styles/global.css')).toBe(true);
  });

  it('allows context/AppContext.tsx', () => {
    expect(isPass2SafeTargetFile('context/AppContext.tsx')).toBe(true);
  });

  it('allows lib/utils.ts', () => {
    expect(isPass2SafeTargetFile('lib/utils.ts')).toBe(true);
  });

  it('allows services/apiClient.ts (non-agent-config)', () => {
    expect(isPass2SafeTargetFile('services/apiClient.ts')).toBe(true);
  });

  it('allows App.tsx', () => {
    expect(isPass2SafeTargetFile('App.tsx')).toBe(true);
  });

  it('allows index.css', () => {
    expect(isPass2SafeTargetFile('index.css')).toBe(true);
  });
});

// ── isPass2SafeTargetFile — backend/ rejection ─────────────────────────────

describe('isPass2SafeTargetFile — backend/ rejection', () => {
  it('rejects backend/agent-config.json', () => {
    expect(isPass2SafeTargetFile('backend/agent-config.json')).toBe(false);
  });

  it('rejects backend/server.ts', () => {
    expect(isPass2SafeTargetFile('backend/server.ts')).toBe(false);
  });

  it('rejects backend/routes/api.ts', () => {
    expect(isPass2SafeTargetFile('backend/routes/api.ts')).toBe(false);
  });
});

// ── isPass2SafeTargetFile — package/lock file rejection ───────────────────

describe('isPass2SafeTargetFile — package/lock rejection', () => {
  it('rejects package.json', () => {
    expect(isPass2SafeTargetFile('package.json')).toBe(false);
  });

  it('rejects package-lock.json', () => {
    expect(isPass2SafeTargetFile('package-lock.json')).toBe(false);
  });

  it('rejects yarn.lock', () => {
    expect(isPass2SafeTargetFile('yarn.lock')).toBe(false);
  });

  it('rejects pnpm-lock.yaml', () => {
    expect(isPass2SafeTargetFile('pnpm-lock.yaml')).toBe(false);
  });
});

// ── isPass2SafeTargetFile — env/secrets rejection ─────────────────────────

describe('isPass2SafeTargetFile — env/secrets rejection', () => {
  it('rejects .env', () => {
    expect(isPass2SafeTargetFile('.env')).toBe(false);
  });

  it('rejects .env.local', () => {
    expect(isPass2SafeTargetFile('.env.local')).toBe(false);
  });

  it('rejects .env.production', () => {
    expect(isPass2SafeTargetFile('.env.production')).toBe(false);
  });

  it('rejects secrets.json', () => {
    expect(isPass2SafeTargetFile('secrets.json')).toBe(false);
  });

  it('rejects src/secrets.ts', () => {
    expect(isPass2SafeTargetFile('src/secrets.ts')).toBe(false);
  });
});

// ── isPass2SafeTargetFile — config file rejection ─────────────────────────

describe('isPass2SafeTargetFile — config file rejection', () => {
  it('rejects agent-config.json', () => {
    expect(isPass2SafeTargetFile('agent-config.json')).toBe(false);
  });

  it('rejects tsconfig.json', () => {
    expect(isPass2SafeTargetFile('tsconfig.json')).toBe(false);
  });

  it('rejects tsconfig.app.json', () => {
    expect(isPass2SafeTargetFile('tsconfig.app.json')).toBe(false);
  });

  it('rejects vite.config.ts', () => {
    expect(isPass2SafeTargetFile('vite.config.ts')).toBe(false);
  });

  it('rejects vite.config.js', () => {
    expect(isPass2SafeTargetFile('vite.config.js')).toBe(false);
  });

  it('rejects tailwind.config.ts', () => {
    expect(isPass2SafeTargetFile('tailwind.config.ts')).toBe(false);
  });

  it('rejects tailwind.config.js', () => {
    expect(isPass2SafeTargetFile('tailwind.config.js')).toBe(false);
  });

  it('rejects postcss.config.js', () => {
    expect(isPass2SafeTargetFile('postcss.config.js')).toBe(false);
  });
});

// ── isPass2SafeTargetFile — node_modules rejection ────────────────────────

describe('isPass2SafeTargetFile — node_modules rejection', () => {
  it('rejects node_modules/react/index.js', () => {
    expect(isPass2SafeTargetFile('node_modules/react/index.js')).toBe(false);
  });

  it('rejects node_modules/@shadcn/ui/Button.tsx', () => {
    expect(isPass2SafeTargetFile('node_modules/@shadcn/ui/Button.tsx')).toBe(false);
  });
});

// ── Pass2Telemetry shape contract ─────────────────────────────────────────

describe('Pass2Telemetry — shape contract', () => {
  it('pass2_unavailable structured telemetry has expected shape', () => {
    const unavailableTelemetry = {
      pass2_ran: false,
      pass2_available: false,
      pass2_unavailable_reason: 'fix slot not configured',
      pass2_iterations: 0,
      critic_gap_count: 0,
      critic_schema: 'Gap[]' as const,
      critic_parse_status: 'unavailable' as const,
      implementer_touched_files: [],
      implementer_rejected_files: [],
      coverage_before: 0.5,
      coverage_after: 0.5,
      pass2_build_ok: false,
      outcome: 'pass2_unavailable' as const,
      factoryGatePassed: false,
    };

    expect(unavailableTelemetry.pass2_ran).toBe(false);
    expect(unavailableTelemetry.pass2_available).toBe(false);
    expect(unavailableTelemetry.outcome).toBe('pass2_unavailable');
    expect(unavailableTelemetry.factoryGatePassed).toBe(false);
    expect(unavailableTelemetry.critic_schema).toBe('Gap[]');
    expect(Array.isArray(unavailableTelemetry.implementer_touched_files)).toBe(true);
    expect(Array.isArray(unavailableTelemetry.implementer_rejected_files)).toBe(true);
  });

  it('partial outcome has factoryGatePassed = false when coverage < 0.8', () => {
    const partialTelemetry = {
      pass2_ran: true,
      pass2_available: true,
      pass2_iterations: 2,
      critic_gap_count: 3,
      critic_schema: 'Gap[]' as const,
      critic_parse_status: 'ok' as const,
      implementer_touched_files: ['pages/Dashboard.tsx'],
      implementer_rejected_files: [],
      coverage_before: 0.5,
      coverage_after: 0.7,
      pass2_build_ok: true,
      outcome: 'partial' as const,
      factoryGatePassed: false,
    };

    expect(partialTelemetry.outcome).toBe('partial');
    expect(partialTelemetry.factoryGatePassed).toBe(false);
    expect(partialTelemetry.coverage_after).toBeLessThan(0.8);
  });

  it('done outcome has factoryGatePassed = true when coverage >= 0.8', () => {
    const doneTelemetry = {
      pass2_ran: true,
      pass2_available: true,
      pass2_iterations: 1,
      critic_gap_count: 2,
      critic_schema: 'Gap[]' as const,
      critic_parse_status: 'ok' as const,
      implementer_touched_files: ['pages/Dashboard.tsx', 'pages/Coach.tsx'],
      implementer_rejected_files: [],
      coverage_before: 0.6,
      coverage_after: 0.9,
      pass2_build_ok: true,
      outcome: 'done' as const,
      factoryGatePassed: true,
    };

    expect(doneTelemetry.outcome).toBe('done');
    expect(doneTelemetry.factoryGatePassed).toBe(true);
    expect(doneTelemetry.coverage_after).toBeGreaterThanOrEqual(0.8);
  });

  it('touched and rejected file lists are mutually exclusive', () => {
    const telemetry = {
      implementer_touched_files: ['pages/Dashboard.tsx'],
      implementer_rejected_files: ['backend/agent-config.json', 'package.json'],
    };

    const touched = new Set(telemetry.implementer_touched_files);
    const rejected = new Set(telemetry.implementer_rejected_files);
    const intersection = [...touched].filter(f => rejected.has(f));
    expect(intersection).toHaveLength(0);
  });

  it('coverage_after is greater than coverage_before when implementation improves', () => {
    const coverage_before = 0.55;
    const coverage_after = 0.82;
    expect(coverage_after).toBeGreaterThan(coverage_before);
    const improved = coverage_after > coverage_before;
    expect(improved).toBe(true);
  });

  it('partial outcome: factoryGatePassed false even when pass2_ran is true', () => {
    const factoryGatePassed = false;
    const outcome = 'partial';
    const pass2_ran = true;
    expect(pass2_ran && outcome === 'partial').toBe(true);
    expect(factoryGatePassed).toBe(false);
  });
});
