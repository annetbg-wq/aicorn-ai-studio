// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
  selectDocumentPackageFiles,
  buildDocumentPackageZip,
} from '../DocumentPackageArchive';
import type { TopicMarker } from '../ProductDocumentSet';

const marker: TopicMarker = {
  key: 'tm1_saas-dashboard_abc', label: 'finance copilot', skeletonId: 'saas-dashboard',
  domain: 'finance', signals: ['budgets', 'finance'], version: 1,
};

describe('selectDocumentPackageFiles', () => {
  it('keeps only docs/architect entries (with or without src/ prefix)', () => {
    const files = {
      'docs/architect/vision.md': '# v',
      'src/docs/architect/flows.md': '# f',
      'src/pages/Home.tsx': 'x',
      'src/hooks/useFinance.ts': 'y',
    };
    const docs = selectDocumentPackageFiles(files);
    expect(Object.keys(docs).sort()).toEqual(['docs/architect/vision.md', 'src/docs/architect/flows.md']);
  });
});

describe('buildDocumentPackageZip', () => {
  it('produces a zip with the docs under a clean folder and a MANIFEST at root', async () => {
    const blob = await buildDocumentPackageZip(
      { 'docs/architect/vision.md': '# Vision', 'docs/architect/backend-architecture.md': '# Backend' },
      { appName: 'Finance Copilot', marker },
    );
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const paths = Object.keys(zip.files).filter(p => !zip.files[p].dir);
    expect(paths).toContain('finance-copilot-docs/vision.md');
    expect(paths).toContain('finance-copilot-docs/backend-architecture.md');
    expect(paths).toContain('finance-copilot-docs/MANIFEST.json');
    const manifest = JSON.parse(await zip.file('finance-copilot-docs/MANIFEST.json')!.async('string'));
    expect(manifest.topicMarker.key).toBe(marker.key);
  });

  it('preserves an existing MANIFEST.json rather than overwriting it', async () => {
    const blob = await buildDocumentPackageZip(
      { 'docs/architect/MANIFEST.json': '{"existing":true}', 'docs/architect/vision.md': '# v' },
      { appName: 'App', marker },
    );
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const manifest = await zip.file('app-docs/MANIFEST.json')!.async('string');
    expect(manifest).toContain('"existing":true');
  });
});
