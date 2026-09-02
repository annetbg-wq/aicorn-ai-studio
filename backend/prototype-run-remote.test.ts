import fs from 'fs';
import fsPromises from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  persistBuildArtifactRemote,
  restoreBuildArtifactRemote,
  remotePrototypeDurabilityConfigured,
  type PrototypeRemoteRpc,
} from './prototype-run-remote';
import { fingerprintPreviewSession } from './prototype-run-registry';

const roots: string[] = [];

function tempRoot(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

function fakeRemote() {
  const manifests = new Map<string, any>();
  const chunks = new Map<string, Map<number, string>>();

  const rpc: PrototypeRemoteRpc = {
    async rpc(name, args) {
      const buildId = String(args.p_build_id ?? '');
      if (name === 'aic_prototype_begin_artifact') {
        manifests.set(buildId, {
          buildId,
          sessionToken: String(args.p_session_token),
          sessionFingerprint: String(args.p_session_fingerprint),
          artifactStatus: 'uploading',
          sha256: null,
          sizeBytes: null,
          chunkCount: null,
          updatedAt: new Date().toISOString(),
        });
        chunks.set(buildId, new Map());
        return { data: true, error: null };
      }
      if (name === 'aic_prototype_put_artifact_chunk') {
        chunks.get(buildId)?.set(Number(args.p_ordinal), String(args.p_payload_base64));
        return { data: true, error: null };
      }
      if (name === 'aic_prototype_finalize_artifact') {
        const manifest = manifests.get(buildId);
        manifest.artifactStatus = 'ready';
        manifest.sha256 = String(args.p_sha256);
        manifest.sizeBytes = Number(args.p_size_bytes);
        manifest.chunkCount = Number(args.p_chunk_count);
        return { data: true, error: null };
      }
      if (name === 'aic_prototype_get_artifact_manifest') {
        return { data: manifests.get(buildId) ?? null, error: null };
      }
      if (name === 'aic_prototype_get_artifact_chunk') {
        return { data: chunks.get(buildId)?.get(Number(args.p_ordinal)) ?? null, error: null };
      }
      return { data: null, error: { message: `unexpected RPC ${name}` } };
    },
  };

  return { rpc, manifests, chunks };
}

describe('external prototype durability', () => {
  it('requires URL, publishable key, and backend secret together', () => {
    expect(remotePrototypeDurabilityConfigured({})).toBe(false);
    expect(remotePrototypeDurabilityConfigured({
      AIC_PROTOTYPE_SUPABASE_URL: 'https://example.supabase.co',
      AIC_PROTOTYPE_SUPABASE_KEY: 'publishable',
    })).toBe(false);
    expect(remotePrototypeDurabilityConfigured({
      AIC_PROTOTYPE_SUPABASE_URL: 'https://example.supabase.co',
      AIC_PROTOTYPE_SUPABASE_KEY: 'publishable',
      AIC_PROTOTYPE_BACKEND_SECRET: 'server-secret',
    })).toBe(true);
  });

  it('persists and restores the exact immutable build artifact', async () => {
    const buildId = 'remote-build-0001';
    const token = 'remote-preview-session-token-123456789';
    const sourceRoot = tempRoot('prototype-remote-source-');
    const sourceBuild = path.join(sourceRoot, buildId);
    const restoredRoot = tempRoot('prototype-remote-restored-');
    await fsPromises.mkdir(path.join(sourceBuild, 'assets'), { recursive: true });
    await fsPromises.writeFile(path.join(sourceBuild, 'index.html'), '<main id="root">Persistent</main>');
    await fsPromises.writeFile(path.join(sourceBuild, 'assets', 'index.js'), 'window.__REMOTE_BUILD__ = 1;\n');

    const remote = fakeRemote();
    const persisted = await persistBuildArtifactRemote(
      buildId,
      sourceBuild,
      token,
      fingerprintPreviewSession(token),
      remote.rpc,
    );

    expect(persisted.sizeBytes).toBeGreaterThan(0);
    expect(persisted.chunkCount).toBeGreaterThan(0);
    expect(remote.manifests.get(buildId)?.artifactStatus).toBe('ready');

    await fsPromises.rm(sourceBuild, { recursive: true, force: true });
    const manifest = await restoreBuildArtifactRemote(buildId, restoredRoot, remote.rpc);

    expect(manifest?.sessionToken).toBe(token);
    expect(await fsPromises.readFile(path.join(restoredRoot, buildId, 'index.html'), 'utf8'))
      .toBe('<main id="root">Persistent</main>');
    expect(await fsPromises.readFile(path.join(restoredRoot, buildId, 'assets', 'index.js'), 'utf8'))
      .toBe('window.__REMOTE_BUILD__ = 1;\n');
  });

  it('rejects a remotely corrupted artifact before extraction', async () => {
    const buildId = 'remote-build-0002';
    const token = 'remote-preview-session-token-abcdef123456';
    const sourceRoot = tempRoot('prototype-remote-corrupt-source-');
    const sourceBuild = path.join(sourceRoot, buildId);
    const restoredRoot = tempRoot('prototype-remote-corrupt-restored-');
    await fsPromises.mkdir(sourceBuild, { recursive: true });
    await fsPromises.writeFile(path.join(sourceBuild, 'index.html'), '<main>Checksum</main>');

    const remote = fakeRemote();
    await persistBuildArtifactRemote(
      buildId,
      sourceBuild,
      token,
      fingerprintPreviewSession(token),
      remote.rpc,
    );
    const first = remote.chunks.get(buildId)?.get(0);
    if (!first) throw new Error('fixture chunk missing');
    remote.chunks.get(buildId)?.set(0, Buffer.from('corrupted').toString('base64'));

    await expect(restoreBuildArtifactRemote(buildId, restoredRoot, remote.rpc)).rejects.toThrow(/size mismatch|checksum mismatch/);
    expect(fs.existsSync(path.join(restoredRoot, buildId))).toBe(false);
  });
});
