import React, { useMemo } from 'react';
import type { ProjectRecord } from '../../../services/ProjectRepository';
import {
  buildBranchArchitectureViewModel,
  getArchitectCopy,
  type BranchArchitectureViewModel,
} from '../architectureViewModel';

interface BranchArchitectureScreenProps {
  theme: 'dark' | 'medium' | 'light';
  project: ProjectRecord;
  appLanguage: string;
}

function useTheme(theme: 'dark' | 'medium' | 'light') {
  const isDark = theme !== 'light';
  return {
    isDark,
    page: isDark ? '#08080e' : '#f8fafc',
    panel: isDark ? '#0f1118' : '#ffffff',
    panelAlt: isDark ? '#121520' : '#f8fafc',
    border: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.10)',
    borderStrong: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.16)',
    text: isDark ? '#e5e7eb' : '#111827',
    sub: isDark ? '#9ca3af' : '#6b7280',
    muted: isDark ? '#6b7280' : '#94a3b8',
    accent: isDark ? '#a78bfa' : '#7c3aed',
    accentBg: isDark ? 'rgba(167,139,250,0.12)' : 'rgba(124,58,237,0.08)',
    accentBorder: isDark ? 'rgba(167,139,250,0.26)' : 'rgba(124,58,237,0.22)',
    success: '#22c55e',
    warn: '#f59e0b',
    danger: '#ef4444',
    info: isDark ? '#60a5fa' : '#2563eb',
  };
}

function SectionCard({
  title,
  subtitle,
  children,
  theme,
  testId,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  theme: ReturnType<typeof useTheme>;
  testId?: string;
}) {
  return (
    <section
      data-testid={testId}
      style={{
        border: `1px solid ${theme.border}`,
        borderRadius: 16,
        background: theme.panel,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '14px 16px 10px',
          borderBottom: `1px solid ${theme.border}`,
          background: theme.panelAlt,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>{title}</div>
        {subtitle ? (
          <div style={{ marginTop: 4, fontSize: 12, color: theme.sub }}>{subtitle}</div>
        ) : null}
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </section>
  );
}

function stateColor(theme: ReturnType<typeof useTheme>, state: string): string {
  switch (state) {
    case 'implemented':
    case 'accepted':
      return theme.success;
    case 'deferred':
      return theme.warn;
    case 'missing':
    case 'superseded':
    case 'blocked':
      return theme.danger;
    case 'open':
    case 'planned':
    case 'unknown':
    default:
      return theme.info;
  }
}

function Badge({
  label,
  state,
  theme,
}: {
  label: string;
  state: string;
  theme: ReturnType<typeof useTheme>;
}) {
  const color = stateColor(theme, state);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 8px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        color,
        border: `1px solid ${color}33`,
        background: `${color}14`,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

function EmptyText({
  text,
  theme,
}: {
  text: string;
  theme: ReturnType<typeof useTheme>;
}) {
  return <div style={{ fontSize: 13, color: theme.sub, lineHeight: 1.6 }}>{text}</div>;
}

function localizePlannedState(model: BranchArchitectureViewModel, value: string): string {
  switch (value) {
    case 'required':
      return model.copy.required;
    case 'planned':
      return model.copy.planned;
    case 'optional':
      return model.copy.optional;
    case 'deferred':
      return model.copy.deferred;
    case 'not_planned':
    default:
      return model.copy.notPlanned;
  }
}

function localizeActualState(model: BranchArchitectureViewModel, value: string): string {
  switch (value) {
    case 'implemented':
      return model.copy.implemented;
    case 'detected':
      return model.copy.detected;
    case 'partially_implemented':
      return model.copy.partial;
    case 'missing':
      return model.copy.missing;
    case 'unknown':
    default:
      return model.copy.unknown;
  }
}

function localizeCombinedState(model: BranchArchitectureViewModel, value: string): string {
  switch (value) {
    case 'implemented':
      return model.copy.implemented;
    case 'deferred':
      return model.copy.deferred;
    case 'planned':
      return model.copy.planned;
    case 'unknown':
    default:
      return model.copy.unknown;
  }
}

function localizePlanStepState(model: BranchArchitectureViewModel, value: string): string {
  switch (value) {
    case 'implemented':
      return model.copy.implemented;
    case 'deferred':
      return model.copy.deferred;
    case 'blocked':
      return model.copy.missing;
    case 'in_progress':
      return model.copy.partial;
    case 'planned':
    default:
      return model.copy.planned;
  }
}

function localizeSnapshotLabel(model: BranchArchitectureViewModel, value: string): string {
  switch (value) {
    case 'plan':
      return model.copy.planned;
    case 'actual':
      return model.copy.reality;
    default:
      return '—';
  }
}

function localizeSource(model: BranchArchitectureViewModel, value: string): string {
  switch (value) {
    case 'manual':
      return model.copy.planned;
    case 'detected':
      return model.copy.detected;
    case 'mixed':
      return `${model.copy.planned} + ${model.copy.detected}`;
    case 'derived':
    default:
      return model.copy.reality;
  }
}

function localizePhase(model: BranchArchitectureViewModel, value: string): string {
  switch (value) {
    case 'post_build_actual':
      return model.copy.reality;
    case 'pre_build_draft':
    default:
      return model.copy.planned;
  }
}

function localizeArchitectureStatus(model: BranchArchitectureViewModel, value: string): string {
  switch (value) {
    case 'accepted':
      return model.copy.accepted;
    case 'superseded':
      return model.copy.superseded;
    case 'deferred':
      return model.copy.deferred;
    case 'proposed':
      return model.copy.proposedDraft;
    case 'open':
    default:
      return model.copy.open;
  }
}

function resolveCapabilityTitle(model: BranchArchitectureViewModel, capabilityId: string): string {
  return model.capabilities.find(capability => capability.id === capabilityId)?.title ?? capabilityId;
}

export const BranchArchitectureScreen: React.FC<BranchArchitectureScreenProps> = ({
  theme,
  project,
  appLanguage,
}) => {
  const colors = useTheme(theme);
  const model = useMemo(
    () => buildBranchArchitectureViewModel(project, appLanguage),
    [project, appLanguage],
  );
  const copy = model?.copy ?? getArchitectCopy(appLanguage);

  if (!model) {
    return (
      <div style={{ padding: 24 }}>
        <SectionCard title={copy.noBranchTitle} subtitle={copy.noBranchBody} theme={colors}>
          <EmptyText text={copy.noBranchBody} theme={colors} />
        </SectionCard>
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: 20,
        background: colors.page,
      }}
    >
      <div style={{ display: 'grid', gap: 20 }}>
        <SectionCard
          title={model.header.projectName}
          subtitle={`${copy.branch}: ${model.header.branchName}`}
          theme={colors}
          testId="architect-branch-brief"
        >
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <Badge label={model.generationTrust.modeLabel} state="planned" theme={colors} />
              {model.header.status === 'proposed' ? (
                <Badge label={copy.proposedDraft} state="open" theme={colors} />
              ) : null}
              <Badge label={`${localizeCombinedState(model, 'planned')}: ${model.stateCounts.planned}`} state="planned" theme={colors} />
              <Badge label={`${localizeCombinedState(model, 'implemented')}: ${model.stateCounts.implemented}`} state="implemented" theme={colors} />
              <Badge label={`${localizeCombinedState(model, 'deferred')}: ${model.stateCounts.deferred}`} state="deferred" theme={colors} />
              <Badge label={`${localizeCombinedState(model, 'unknown')}: ${model.stateCounts.unknown}`} state="unknown" theme={colors} />
            </div>

            <div
              data-testid="architect-generation-trust"
              style={{
                display: 'grid',
                gap: 10,
                padding: '12px 14px',
                borderRadius: 12,
                border: `1px solid ${colors.border}`,
                background: colors.panelAlt,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {copy.generationTrust}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 14, fontWeight: 700, color: colors.text }}>
                    {model.generationTrust.modeLabel}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: colors.sub }}>
                  {copy.trustBasis}: {model.generationTrust.trustLabel}
                </div>
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.6, color: colors.sub }}>
                {model.generationTrust.summary}
              </div>
              {model.generationTrust.conflictSummary ? (
                <div style={{ fontSize: 12, lineHeight: 1.5, color: colors.warn }}>
                  {model.generationTrust.conflictSummary}
                </div>
              ) : null}
              {model.generationTrust.indicators.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {model.generationTrust.indicators.map(indicator => (
                    <Badge key={indicator.id} label={indicator.label} state={indicator.state} theme={colors} />
                  ))}
                  {model.generationTrust.conflictLabel ? (
                    <Badge label={model.generationTrust.conflictLabel} state="open" theme={colors} />
                  ) : null}
                </div>
              ) : null}
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: colors.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {copy.branchBrief}
              </div>
              <div style={{ marginTop: 8, fontSize: 16, lineHeight: 1.6, color: colors.text }}>
                {model.header.summary}
              </div>
            </div>

            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
              <div>
                <div style={{ fontSize: 11, color: colors.muted, textTransform: 'uppercase' }}>{copy.branch}</div>
                <div style={{ marginTop: 6, fontSize: 13, color: colors.text }}>{model.header.branchId}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: colors.muted, textTransform: 'uppercase' }}>{copy.status}</div>
                <div style={{ marginTop: 6, fontSize: 13, color: colors.text }}>
                  {localizeArchitectureStatus(model, model.header.status)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: colors.muted, textTransform: 'uppercase' }}>{copy.snapshot}</div>
                <div style={{ marginTop: 6, fontSize: 13, color: colors.text }}>{localizeSnapshotLabel(model, model.header.snapshotLabel)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: colors.muted, textTransform: 'uppercase' }}>{copy.revision}</div>
                <div style={{ marginTop: 6, fontSize: 13, color: colors.text }}>{model.header.revisionId ?? '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: colors.muted, textTransform: 'uppercase' }}>{copy.updatedAt}</div>
                <div style={{ marginTop: 6, fontSize: 13, color: colors.text }}>{model.header.updatedAt}</div>
              </div>
            </div>
          </div>
        </SectionCard>

        {model.branchReality ? (
          <SectionCard
            title={model.branchReality.ui.sectionTitle}
            subtitle={model.branchReality.ui.summary}
            theme={colors}
            testId="architect-branch-reality"
          >
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <Badge
                  label={model.branchReality.ui.stateLabel}
                  state={
                    model.branchReality.state === 'aligned'
                      ? 'implemented'
                      : model.branchReality.state === 'partial'
                        ? 'planned'
                        : 'blocked'
                  }
                  theme={colors}
                />
                <Badge
                  label={`${model.branchReality.ui.alignedLabel}: ${model.branchReality.alignedItems.length}`}
                  state="implemented"
                  theme={colors}
                />
                <Badge
                  label={`${model.branchReality.ui.missingLabel}: ${model.branchReality.missingItems.length}`}
                  state="planned"
                  theme={colors}
                />
                <Badge
                  label={`${model.branchReality.ui.driftingLabel}: ${model.branchReality.driftingItems.length}`}
                  state="blocked"
                  theme={colors}
                />
              </div>

              <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                {[
                  {
                    label: model.branchReality.ui.alignedLabel,
                    items: model.branchReality.ui.alignedItems,
                    empty: model.branchReality.ui.alignedEmpty,
                  },
                  {
                    label: model.branchReality.ui.missingLabel,
                    items: model.branchReality.ui.missingItems,
                    empty: model.branchReality.ui.missingEmpty,
                  },
                  {
                    label: model.branchReality.ui.driftingLabel,
                    items: model.branchReality.ui.driftingItems,
                    empty: model.branchReality.ui.driftingEmpty,
                  },
                ].map(section => (
                  <div
                    key={section.label}
                    style={{
                      border: `1px solid ${colors.border}`,
                      borderRadius: 12,
                      padding: '12px 14px',
                      background: colors.panelAlt,
                      display: 'grid',
                      gap: 10,
                    }}
                  >
                    <div style={{ fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      {section.label}
                    </div>
                    {section.items.length > 0 ? (
                      <div style={{ display: 'grid', gap: 8 }}>
                        {section.items.map(item => (
                          <div key={item.id} style={{ display: 'grid', gap: 4 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>{item.title}</div>
                            <div style={{ fontSize: 12, color: colors.sub, lineHeight: 1.5 }}>{item.summary}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyText text={section.empty} theme={colors} />
                    )}
                  </div>
                ))}

                <div
                  style={{
                    border: `1px solid ${colors.border}`,
                    borderRadius: 12,
                    padding: '12px 14px',
                    background: colors.panelAlt,
                    display: 'grid',
                    gap: 8,
                  }}
                >
                  <div style={{ fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {model.branchReality.ui.nextPassLabel}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>
                    {model.branchReality.ui.nextPassTitle}
                  </div>
                  <div style={{ fontSize: 12, color: colors.sub, lineHeight: 1.5 }}>
                    {model.branchReality.ui.nextPassSummary}
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>
        ) : null}

        <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)' }}>
          <SectionCard title={copy.currentPlan} subtitle={model.plan?.summary} theme={colors} testId="architect-plan">
            {model.plan ? (
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: colors.text }}>{model.plan.title}</div>
                {model.plan.steps.map((step, index) => (
                  <div
                    key={step.id}
                    style={{
                      border: `1px solid ${colors.border}`,
                      borderRadius: 12,
                      padding: '12px 14px',
                      background: colors.panelAlt,
                    }}
                  >
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: colors.accent, minWidth: 20 }}>
                        {index + 1}
                      </div>
                      <div style={{ flex: 1, display: 'grid', gap: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: colors.text }}>{step.title}</div>
                          <Badge label={localizePlanStepState(model, step.state)} state={step.state} theme={colors} />
                        </div>
                        {step.summary ? (
                          <div style={{ fontSize: 12, color: colors.sub }}>{step.summary}</div>
                        ) : null}
                        {step.capabilityIds.length > 0 ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {step.capabilityIds.map(capabilityId => (
                              <Badge
                                key={capabilityId}
                                label={model.capabilities.find(capability => capability.id === capabilityId)?.title ?? capabilityId}
                                state="planned"
                                theme={colors}
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyText text={copy.noPlan} theme={colors} />
            )}
          </SectionCard>

          <SectionCard title={copy.actualState} subtitle={model.actualStateSummary.narrative} theme={colors} testId="architect-actual-state">
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
                {model.actualStateSummary.facts.map(fact => (
                  <div
                    key={fact.label}
                    style={{
                      border: `1px solid ${colors.border}`,
                      borderRadius: 12,
                      padding: '12px 13px',
                      background: colors.panelAlt,
                    }}
                  >
                    <div style={{ fontSize: 11, color: colors.muted, textTransform: 'uppercase' }}>{fact.label}</div>
                    <div style={{ marginTop: 6, fontSize: 18, fontWeight: 700, color: colors.text }}>{fact.value}</div>
                  </div>
                ))}
              </div>

              {model.actualStateSummary.routes.length > 0 ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ fontSize: 11, color: colors.muted, textTransform: 'uppercase' }}>{copy.routes}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {model.actualStateSummary.routes.map(route => (
                      <span
                        key={route}
                        style={{
                          fontSize: 12,
                          color: colors.text,
                          padding: '4px 8px',
                          borderRadius: 10,
                          border: `1px solid ${colors.border}`,
                          background: colors.panelAlt,
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        }}
                      >
                        {route}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {model.actualStateSummary.surfaces.length > 0 ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ fontSize: 11, color: colors.muted, textTransform: 'uppercase' }}>{copy.observedSurfaces}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {model.actualStateSummary.surfaces.map(surface => (
                      <Badge
                        key={surface.id}
                        label={`${surface.title}: ${localizeActualState(model, surface.state)}`}
                        state={surface.state}
                        theme={colors}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {model.actualStateSummary.packages.length > 0 ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ fontSize: 11, color: colors.muted, textTransform: 'uppercase' }}>{copy.packages}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {model.actualStateSummary.packages.map(pkg => (
                      <span
                        key={pkg}
                        style={{
                          fontSize: 12,
                          color: colors.text,
                          padding: '4px 8px',
                          borderRadius: 10,
                          border: `1px solid ${colors.border}`,
                          background: colors.panelAlt,
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        }}
                      >
                        {pkg}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {model.actualStateSummary.envVars.length > 0 ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ fontSize: 11, color: colors.muted, textTransform: 'uppercase' }}>{copy.envVars}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {model.actualStateSummary.envVars.map(envVar => (
                      <span
                        key={envVar}
                        style={{
                          fontSize: 12,
                          color: colors.text,
                          padding: '4px 8px',
                          borderRadius: 10,
                          border: `1px solid ${colors.border}`,
                          background: colors.panelAlt,
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        }}
                      >
                        {envVar}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {model.actualStateSummary.keyFiles.length > 0 ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ fontSize: 11, color: colors.muted, textTransform: 'uppercase' }}>{copy.keyFiles}</div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {model.actualStateSummary.keyFiles.map(filePath => (
                      <div
                        key={filePath}
                        style={{
                          fontSize: 12,
                          color: colors.text,
                          padding: '8px 10px',
                          borderRadius: 10,
                          border: `1px solid ${colors.border}`,
                          background: colors.panelAlt,
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        }}
                      >
                        {filePath}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </SectionCard>
        </div>

        <SectionCard title={copy.capabilityManifest} theme={colors} testId="architect-capabilities">
          {model.capabilities.length > 0 ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {model.capabilities.map(capability => (
                <div
                  key={capability.id}
                  style={{
                    border: `1px solid ${colors.border}`,
                    borderRadius: 12,
                    padding: '12px 14px',
                    background: colors.panelAlt,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: colors.text }}>{capability.title}</div>
                      {capability.description ? (
                        <div style={{ marginTop: 4, fontSize: 12, color: colors.sub }}>{capability.description}</div>
                      ) : null}
                    </div>
                    <Badge
                      label={localizeCombinedState(model, capability.combinedState)}
                      state={capability.combinedState}
                      theme={colors}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                    <Badge
                      label={`${copy.planned}: ${localizePlannedState(model, capability.plannedState)}`}
                      state="planned"
                      theme={colors}
                    />
                    <Badge
                      label={`${copy.reality}: ${localizeActualState(model, capability.actualState)}`}
                      state={capability.actualState}
                      theme={colors}
                    />
                    <Badge
                      label={`${copy.source}: ${localizeSource(model, capability.source)}`}
                      state={capability.source === 'detected' ? 'implemented' : 'unknown'}
                      theme={colors}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyText text={copy.noCapabilities} theme={colors} />
          )}
        </SectionCard>

        <SectionCard title={copy.decisions} theme={colors} testId="architect-decisions">
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            {([
              ['accepted', copy.accepted],
              ['open', copy.open],
              ['superseded', copy.superseded],
            ] as const).map(([key, title]) => {
              const items = model.decisions[key];
              return (
                <div key={key} style={{ display: 'grid', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: colors.text }}>{title}</div>
                    <Badge label={String(items.length)} state={key} theme={colors} />
                  </div>
                  {items.length > 0 ? items.map(item => (
                    <div
                      key={item.id}
                      style={{
                        border: `1px solid ${colors.border}`,
                        borderRadius: 12,
                        padding: '12px 14px',
                        background: colors.panelAlt,
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, color: colors.text }}>{item.title}</div>
                      <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.6, color: colors.sub }}>{item.summary}</div>
                      <div style={{ marginTop: 10, display: 'grid', gap: 4 }}>
                        {item.meta.map(meta => (
                          <div key={meta} style={{ fontSize: 11, color: colors.muted }}>{meta}</div>
                        ))}
                      </div>
                    </div>
                  )) : (
                    <EmptyText text={copy.noDecisions} theme={colors} />
                  )}
                </div>
              );
            })}
          </div>
        </SectionCard>

        <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 1.1fr)' }}>
          <SectionCard title={copy.deferredItems} theme={colors} testId="architect-deferred">
            {model.deferredItems.length > 0 ? (
              <div style={{ display: 'grid', gap: 10 }}>
                {model.deferredItems.map(item => (
                  <div
                    key={item.id}
                    style={{
                      border: `1px solid ${colors.border}`,
                      borderRadius: 12,
                      padding: '12px 14px',
                      background: colors.panelAlt,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: colors.text }}>{item.title}</div>
                      <Badge label={copy.deferred} state="deferred" theme={colors} />
                    </div>
                    <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.6, color: colors.sub }}>{item.summary}</div>
                    <div style={{ marginTop: 10, display: 'grid', gap: 4 }}>
                      {item.reason ? (
                        <div style={{ fontSize: 11, color: colors.muted }}>{copy.reason}: {item.reason}</div>
                      ) : null}
                      {item.untilPhase ? (
                        <div style={{ fontSize: 11, color: colors.muted }}>{copy.untilPhase}: {localizePhase(model, item.untilPhase)}</div>
                      ) : null}
                      {item.capabilityIds.length > 0 ? (
                        <div style={{ fontSize: 11, color: colors.muted }}>
                          {copy.affectedCapabilities}: {item.capabilityIds.map(capabilityId => resolveCapabilityTitle(model, capabilityId)).join(', ')}
                        </div>
                      ) : null}
                      {item.meta.map(meta => (
                        <div key={meta} style={{ fontSize: 11, color: colors.muted }}>{meta}</div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyText text={copy.noDeferred} theme={colors} />
            )}
          </SectionCard>

          <div style={{ display: 'grid', gap: 20 }}>
            <SectionCard title={copy.suggestedNextStep} theme={colors} testId="architect-suggested-next-step">
              {model.suggestedNextStep ? (
                <div style={{ display: 'grid', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: colors.text }}>{model.suggestedNextStep.title}</div>
                    <Badge label={copy.suggestedNextStep} state="planned" theme={colors} />
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.7, color: colors.sub }}>{model.suggestedNextStep.summary}</div>
                  {model.suggestedNextStep.reasons.length > 0 ? (
                    <div style={{ display: 'grid', gap: 8 }}>
                      <div style={{ fontSize: 11, color: colors.muted, textTransform: 'uppercase' }}>{copy.whyThisNextStep}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {model.suggestedNextStep.reasons.map(reason => (
                          <Badge key={reason} label={reason} state="unknown" theme={colors} />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <EmptyText text={copy.noPlanRealityItems} theme={colors} />
              )}
            </SectionCard>

            <SectionCard title={copy.planVsReality} theme={colors} testId="architect-plan-vs-reality">
              <div style={{ display: 'grid', gap: 16 }}>
                {([
                  ['plannedNotImplemented', copy.plannedNotImplemented, model.planVsReality.plannedNotImplemented],
                  ['implementedNotPlanned', copy.implementedNotPlanned, model.planVsReality.implementedNotPlanned],
                  ['supersededDecisions', copy.supersededDecisions, model.planVsReality.supersededDecisions],
                ] as const).map(([key, title, items]) => (
                  <div key={key} style={{ display: 'grid', gap: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: colors.text }}>{title}</div>
                    {items.length > 0 ? items.map(item => (
                      <div
                        key={item.id}
                        style={{
                          border: `1px solid ${colors.border}`,
                          borderRadius: 12,
                          padding: '10px 12px',
                          background: colors.panelAlt,
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>{item.title}</div>
                        <div style={{ marginTop: 4, fontSize: 12, color: colors.sub }}>{item.summary}</div>
                      </div>
                    )) : (
                      <EmptyText text={copy.noPlanRealityItems} theme={colors} />
                    )}
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BranchArchitectureScreen;
