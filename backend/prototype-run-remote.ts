import crypto from 'crypto';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { PassThrough } from 'stream';
import archiver from 'archiver';
import * as unzipper from 'unzipper';
import { createClient } from '@supabase/supabase-js';
import type { PrototypeRunRecord } from './prototype-run-registry';

export const REMOTE_ARTIFACT_CHUNK_BYTES = 384 * 1024;
export const MAX_REMOTE_ARTIFACT_BYTES = 32 * 1024 * 1024;

export type PrototypeRemoteRpc = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export interface RemoteArtifactManifest {
  buildId: string;
  sessionToken: string;
  sessionFingerprint: string;
  artifactStatus: 'uploading' | 'ready' | 'failed';
  sha256: string | null;
  sizeBytes: number | null;
  chunkCount: number | null;
  updatedAt: string;
}

function config(env: NodeJS.ProcessEnv = process.env) {
  return {
    url: env.AIC_PROTOTYPE_SUPABASE_URL?.trim() ?? '',
    key: env.AIC_PROTOTYPE_SUPABASE_KEY?.trim() ?? '',
    secret: env.AIC_PROTOTYPE_BACKEND_SECRET?.trim() ?? '',
  };
}

export function remotePrototypeDurabilityConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const c = config(env);
  return Boolean(c.url && c.key && c.secret);
}

function defaultRpc(): PrototypeRemoteRpc {
  const c = config();
  if (!c.url || !c.key || !c.secret) throw new Error('external prototype durability is not configured');
  return createClient(c.url, c.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }) as unknown as PrototypeRemoteRpc;
}

async function callRpc<T>(name: string, args: Record<string, unknown>, rpc = defaultRpc()): Promise<T> {
  const { data, error } = await rpc.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message ?? String(error)}`);
  return data as T;
}

function backendSecret(): string {
  const value = config().secret;
  if (!value) throw new Error('AIC_PROTOTYPE_BACKEND_SECRET is not configured');
  return value;
}

export function sha256Buffer(value: Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export async function zipBuildDirectory(buildPath: string): Promise<Buffer> {
  if (!fs.existsSync(buildPath)) throw new Error(`build directory not found: ${buildPath}`);
  const output = new PassThrough();
  const chunks: Buffer[] = [];
  output.on('data', chunk => chunks.push(Buffer.from(chunk)));

  const archive = archiver('zip', { zlib: { level: 9 } });
  const completed = new Promise<Buffer>((resolve, reject) => {
    output.once('error', reject);
    archive.once('error', reject);
    output.once('end', () => resolve(Buffer.concat(chunks)));
  });
  archive.pipe(output);
  archive.directory(buildPath, false);
  await archive.finalize();
  const buffer = await completed;
  if (buffer.length === 0) throw new Error('compiled preview artifact is empty');
  if (buffer.length > MAX_REMOTE_ARTIFACT_BYTES) {
    throw new Error(`compiled preview artifact exceeds ${MAX_REMOTE_ARTIFACT_BYTES} bytes`);
  }
  return buffer;
}

export async function persistBuildArtifactRemote(
  buildId: string,
  buildPath: string,
  sessionToken: string,
  sessionFingerprint: string,
  rpc?: PrototypeRemoteRpc,
): Promise<{ sha256: string; sizeBytes: number; chunkCount: number }> {
  const client = rpc ?? defaultRpc();
  const secret = rpc ? (process.env.AIC_PROTOTYPE_BACKEND_SECRET || 'test-secret-1234567890') : backendSecret();
  const artifact = await zipBuildDirectory(buildPath);
  const sha256 = sha256Buffer(artifact);
  const chunks: Buffer[] = [];
  for (let offset = 0; offset < artifact.length; offset += REMOTE_ARTIFACT_CHUNK_BYTES) {
    chunks.push(artifact.subarray(offset, Math.min(artifact.length, offset + REMOTE_ARTIFACT_CHUNK_BYTES)));
  }

  await callRpc('aic_prototype_begin_artifact', {
    p_secret: secret,
    p_build_id: buildId,
    p_session_token: sessionToken,
    p_session_fingerprint: sessionFingerprint,
  }, client);

  for (let ordinal = 0; ordinal < chunks.length; ordinal += 1) {
    await callRpc('aic_prototype_put_artifact_chunk', {
      p_secret: secret,
      p_build_id: buildId,
      p_ordinal: ordinal,
      p_payload_base64: chunks[ordinal].toString('base64'),
    }, client);
  }

  await callRpc('aic_prototype_finalize_artifact', {
    p_secret: secret,
    p_build_id: buildId,
    p_sha256: sha256,
    p_size_bytes: artifact.length,
    p_chunk_count: chunks.length,
  }, client);

  return { sha256, sizeBytes: artifact.length, chunkCount: chunks.length };
}

export async function getRemoteArtifactManifest(buildId: string, rpc?: PrototypeRemoteRpc): Promise<RemoteArtifactManifest | null> {
  const client = rpc ?? defaultRpc();
  const secret = rpc ? (process.env.AIC_PROTOTYPE_BACKEND_SECRET || 'test-secret-1234567890') : backendSecret();
  return await callRpc<RemoteArtifactManifest | null>('aic_prototype_get_artifact_manifest', {
    p_secret: secret,
    p_build_id: buildId,
  }, client);
}

export async function restoreBuildArtifactRemote(
  buildId: string,
  buildsRoot: string,
  rpc?: PrototypeRemoteRpc,
): Promise<RemoteArtifactManifest | null> {
  const client = rpc ?? defaultRpc();
  const secret = rpc ? (process.env.AIC_PROTOTYPE_BACKEND_SECRET || 'test-secret-1234567890') : backendSecret();
  const manifest = await getRemoteArtifactManifest(buildId, client);
  if (!manifest || manifest.artifactStatus !== 'ready' || !manifest.sha256 || !manifest.chunkCount) return null;

  const encoded: string[] = [];
  for (let ordinal = 0; ordinal < manifest.chunkCount; ordinal += 1) {
    const payload = await callRpc<string | null>('aic_prototype_get_artifact_chunk', {
      p_secret: secret,
      p_build_id: buildId,
      p_ordinal: ordinal,
    }, client);
    if (!payload) throw new Error(`remote artifact ${buildId} is missing chunk ${ordinal}`);
    encoded.push(payload);
  }
  const archive = Buffer.concat(encoded.map(value => Buffer.from(value, 'base64')));
  if (archive.length !== manifest.sizeBytes) throw new Error(`remote artifact ${buildId} size mismatch`);
  if (sha256Buffer(archive) !== manifest.sha256) throw new Error(`remote artifact ${buildId} checksum mismatch`);

  await fsPromises.mkdir(buildsRoot, { recursive: true });
  const target = path.join(buildsRoot, buildId);
  const temp = path.join(buildsRoot, `.restore-${buildId}-${process.pid}-${Date.now()}`);
  await fsPromises.rm(temp, { recursive: true, force: true });
  await fsPromises.mkdir(temp, { recursive: true });
  try {
    const stream = PassThrough.from(archive);
    await stream.pipe(unzipper.Extract({ path: temp })).promise();
    if (!fs.existsSync(path.join(temp, 'index.html'))) throw new Error('restored preview artifact has no index.html');
    await fsPromises.rm(target, { recursive: true, force: true });
    await fsPromises.rename(temp, target);
  } catch (error) {
    await fsPromises.rm(temp, { recursive: true, force: true });
    throw error;
  }
  return manifest;
}

export async function persistPrototypeRunRemote(record: PrototypeRunRecord, rpc?: PrototypeRemoteRpc): Promise<void> {
  const client = rpc ?? defaultRpc();
  const secret = rpc ? (process.env.AIC_PROTOTYPE_BACKEND_SECRET || 'test-secret-1234567890') : backendSecret();
  await callRpc('aic_prototype_upsert_run', { p_secret: secret, p_run: record }, client);
}

export async function getPrototypeRunRemote(runId: string, rpc?: PrototypeRemoteRpc): Promise<PrototypeRunRecord | null> {
  const client = rpc ?? defaultRpc();
  const secret = rpc ? (process.env.AIC_PROTOTYPE_BACKEND_SECRET || 'test-secret-1234567890') : backendSecret();
  return await callRpc<PrototypeRunRecord | null>('aic_prototype_get_run', { p_secret: secret, p_run_id: runId }, client);
}

export async function listPrototypeRunsRemote(rpc?: PrototypeRemoteRpc): Promise<PrototypeRunRecord[]> {
  const client = rpc ?? defaultRpc();
  const secret = rpc ? (process.env.AIC_PROTOTYPE_BACKEND_SECRET || 'test-secret-1234567890') : backendSecret();
  return await callRpc<PrototypeRunRecord[]>('aic_prototype_list_runs', { p_secret: secret }, client);
}

export async function remotePrototypeDurabilityHealth(rpc?: PrototypeRemoteRpc): Promise<boolean> {
  const client = rpc ?? defaultRpc();
  const secret = rpc ? (process.env.AIC_PROTOTYPE_BACKEND_SECRET || 'test-secret-1234567890') : backendSecret();
  const data = await callRpc<{ ok?: boolean }>('aic_prototype_health', { p_secret: secret }, client);
  return data?.ok === true;
}
