from pathlib import Path

path = Path('e2e/mobile-agent-generation.spec.cjs')
text = path.read_text()
old = """  const iframe = page.locator('[data-testid=\"preview-iframe\"]');
  await expect(iframe).toBeVisible({ timeout: FLOW_TIMEOUT });
  await expect(page.frameLocator('[data-testid=\"preview-iframe\"]').locator('body')).toContainText(`Welcome to ${scenario.appName}`, { timeout: FLOW_TIMEOUT });
  await expect(async () => {
    expect(timelineLines(logs).some(line => line.includes('generation_preview_ownership_released'))).toBe(true);
  }).toPass({ timeout: FLOW_TIMEOUT, intervals: [1_000, 2_000, 5_000] });
"""
new = """  const iframe = page.locator('[data-testid=\"preview-iframe\"]');
  await expect(iframe).toBeVisible({ timeout: FLOW_TIMEOUT });
  const preview = page.frameLocator('[data-testid=\"preview-iframe\"]');
  await expect(preview.locator('body')).toContainText(`Welcome to ${scenario.appName}`, { timeout: FLOW_TIMEOUT });

  // Stage 5 proof: the generated result must behave like an app, not merely render JSX.
  // Complete onboarding, move through the real route graph, mutate local product state,
  // and verify that another stateful screen remains connected through skeleton navigation.
  await preview.getByRole('button', { name: 'Start' }).click();
  await expect(preview.locator('body')).toContainText(scenario.marker, { timeout: FLOW_TIMEOUT });
  await preview.getByRole('link', { name: scenario.labels.create }).click();
  await expect(preview.getByRole('heading', { name: scenario.labels.create })).toBeVisible({ timeout: FLOW_TIMEOUT });
  const itemInput = preview.getByRole('textbox', { name: 'Item title' });
  await itemInput.fill('Stage 5 local item');
  await preview.getByRole('button', { name: 'Save' }).click();
  await expect(preview.locator('body')).toContainText('Created: Stage 5 local item', { timeout: FLOW_TIMEOUT });

  await preview.getByText(scenario.tabs[2], { exact: true }).click();
  await expect(preview.getByRole('heading', { name: scenario.labels.progress })).toBeVisible({ timeout: FLOW_TIMEOUT });
  await preview.getByText(scenario.tabs[3], { exact: true }).click();
  await expect(preview.getByRole('heading', { name: scenario.labels.profile })).toBeVisible({ timeout: FLOW_TIMEOUT });
  const reminders = preview.getByRole('button', { name: 'Reminders: On' });
  await reminders.click();
  await expect(preview.getByRole('button', { name: 'Reminders: Off' })).toBeVisible({ timeout: FLOW_TIMEOUT });

  await expect(async () => {
    expect(timelineLines(logs).some(line => line.includes('generation_preview_ownership_released'))).toBe(true);
  }).toPass({ timeout: FLOW_TIMEOUT, intervals: [1_000, 2_000, 5_000] });
"""
if text.count(old) != 1:
    raise SystemExit(f'expected interaction anchor once, found {text.count(old)}')
path.write_text(text.replace(old, new, 1))
print('mobile interaction proof added')
