import React, { useState, useRef, useEffect } from 'react';
import { MobilePublishService } from '../services/MobilePublishService';
import { ConfigService }        from '../services/ConfigService';
import type { FileMap }         from '../hooks/useStudio';

interface CloudPanelProps {
  files:       FileMap;
  projectName: string;
  addLog:      (msg: string) => void;
}

export const CloudPanel: React.FC<CloudPanelProps> = ({
  files, projectName, addLog,
}) => {

  // ── RN code ───────────────────────────────────────────────────────────────
  const [rnFiles,      setRnFiles]      = useState<Record<string, string>>({});
  const [isConverting, setIsConverting] = useState(false);
  const [streamLen,    setStreamLen]    = useState(0);

  // ── Credentials ─────────────────────────────────────────────────────────
  const [easToken,    setEasToken]    = useState(() => ConfigService.getEASToken());
  const [easStatus,   setEasStatus]   = useState<{ valid: boolean; username?: string; error?: string } | null>(null);
  const [validatingEAS, setValidatingEAS] = useState(false);

  const [ascIssuerId,   setAscIssuerId]   = useState(() => ConfigService.getASCIssuerId());
  const [ascKeyId,      setAscKeyId]      = useState(() => ConfigService.getASCKeyId());
  const [ascPrivateKey, setAscPrivateKey] = useState(() => ConfigService.getASCPrivateKey());
  const [ascStatus,     setAscStatus]     = useState<{ valid: boolean; error?: string } | null>(null);
  const [validatingASC, setValidatingASC] = useState(false);

  const [googleSA,     setGoogleSA]     = useState(() => ConfigService.getGoogleServiceAccount());
  const [googleStatus, setGoogleStatus] = useState<{ valid: boolean; username?: string; error?: string } | null>(null);
  const [validatingGoogle, setValidatingGoogle] = useState(false);

  const p8Ref         = useRef<HTMLInputElement>(null);
  const googleJsonRef = useRef<HTMLInputElement>(null);

  const hasWebProject = Object.keys(files).length > 0;
  const hasRNCode     = Object.keys(rnFiles).length > 0;

  useEffect(() => {
    if (ascIssuerId && ascKeyId && ascPrivateKey) {
      setAscStatus({ valid: true });
    }
    if (googleSA) {
      try {
        const sa = JSON.parse(googleSA);
        if (sa.client_email) setGoogleStatus({ valid: true, username: sa.client_email });
      } catch { /* invalid JSON — ignore */ }
    }
    if (easToken) {
      setEasStatus({ valid: true });
    }
  }, []);

  // ── Styles ──────────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px',
    background: 'var(--background)', color: 'var(--foreground)',
    border: '1px solid var(--border)', borderRadius: 6,
    fontSize: 12, fontFamily: 'inherit', outline: 'none',
    boxSizing: 'border-box',
  };
  const monoInputStyle: React.CSSProperties = {
    ...inputStyle, fontFamily: 'monospace', fontSize: 11,
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11, color: 'var(--muted-foreground)',
    display: 'block', marginBottom: 4,
  };
  const sectionStyle: React.CSSProperties = {
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '14px 16px', marginBottom: 12,
  };
  const sectionTitleStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: 'var(--foreground)',
    marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6,
  };
  const primaryBtn: React.CSSProperties = {
    padding: '7px 14px', borderRadius: 6, cursor: 'pointer',
    background: 'var(--primary)', color: 'var(--primary-foreground)',
    border: 'none', fontSize: 12, fontWeight: 500,
  };
  const secondaryBtn: React.CSSProperties = {
    padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
    background: 'transparent', color: 'var(--muted-foreground)',
    border: '1px solid var(--border)', fontSize: 12,
  };
  const statusBox = (valid: boolean): React.CSSProperties => ({
    marginTop: 8, padding: '6px 10px', borderRadius: 6, fontSize: 11,
    background: valid ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
    color:      valid ? '#22c55e'             : '#ef4444',
    border:    `1px solid ${valid ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
  });

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleGenerateRN = async () => {
    if (!hasWebProject) return;
    setIsConverting(true);
    setStreamLen(0);
    try {
      const result = await MobilePublishService.generateRNCode({
        files, projectName, apiKey: ConfigService.getApiKey(),
        onLog: addLog,
        onStream: chunk => setStreamLen(prev => prev + chunk.length),
      });
      setRnFiles(result);
    } catch (err) {
      addLog(`[Mobile] Error: ${String(err)}`);
    } finally {
      setIsConverting(false);
    }
  };

  const handleDownloadZip = async () => {
    if (!hasRNCode) return;
    await MobilePublishService.downloadZip(rnFiles, projectName);
  };

  const handleOpenSnack = async () => {
    if (!hasRNCode) return;
    try {
      await MobilePublishService.openInSnack(rnFiles, projectName, addLog);
    } catch (err) {
      addLog(`[Snack] Error: ${String(err)}`);
    }
  };

  const handleValidateEAS = async () => {
    setValidatingEAS(true);
    const result = await MobilePublishService.validateEAS(easToken);
    setEasStatus(result);
    if (result.valid) ConfigService.setEASToken(easToken);
    setValidatingEAS(false);
  };

  const handleValidateASC = async () => {
    setValidatingASC(true);
    const result = await MobilePublishService.validateASC({
      issuerId: ascIssuerId, keyId: ascKeyId, privateKey: ascPrivateKey,
    });
    setAscStatus(result);
    if (result.valid) {
      ConfigService.setASCIssuerId(ascIssuerId);
      ConfigService.setASCKeyId(ascKeyId);
      ConfigService.setASCPrivateKey(ascPrivateKey);
    }
    setValidatingASC(false);
  };

  const handleGoogleJsonUpload = async (file: File) => {
    const text = await file.text();
    setGoogleSA(text);
    setValidatingGoogle(true);
    const result = await MobilePublishService.validateGooglePlay({ serviceAccountJson: text });
    setGoogleStatus(result);
    if (result.valid) ConfigService.setGoogleServiceAccount(text);
    setValidatingGoogle(false);
  };

  const handleP8Upload = async (file: File) => {
    const text = await file.text();
    setAscPrivateKey(text);
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div style={{
      height: '100%', overflowY: 'auto', padding: 16,
      background: 'var(--background)',
    }}>

      {/* Section 1: React Native conversion */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>
          React Native
        </div>

        {!hasWebProject ? (
          <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
            Generate a web project first, then convert to React Native.
          </div>
        ) : (
          <>
            {!hasRNCode ? (
              <button
                onClick={handleGenerateRN}
                disabled={isConverting}
                style={primaryBtn}
              >
                {isConverting
                  ? `Converting... (${(streamLen / 1000).toFixed(0)}k chars)`
                  : 'Convert to React Native'}
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={handleDownloadZip} style={primaryBtn}>
                  Download ZIP
                </button>
                <button onClick={handleOpenSnack} style={secondaryBtn}>
                  Preview in Expo Snack
                </button>
                <button onClick={handleGenerateRN} style={secondaryBtn}>
                  Regenerate
                </button>
              </div>
            )}

            {hasRNCode && (
              <div style={{
                marginTop: 8, fontSize: 11, color: 'var(--muted-foreground)',
              }}>
                {Object.keys(rnFiles).length} files generated
                {' · '}
                {Object.values(rnFiles).reduce((s, c) => s + c.split('\n').length, 0)} lines
              </div>
            )}
          </>
        )}
      </div>

      {/* Section 2: EAS (Expo Application Services) */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>
          EAS Build & Submit
          <span style={{
            fontSize: 10, padding: '1px 6px', borderRadius: 10,
            background: 'rgba(99,102,241,0.15)', color: '#818cf8',
          }}>
            Available June 2025
          </span>
        </div>

        <label style={labelStyle}>
          Personal Access Token
          <span style={{ marginLeft: 6, opacity: 0.6 }}>
            (expo.dev &rarr; Account &rarr; Access Tokens)
          </span>
        </label>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <input
            type="password"
            placeholder="expo_........................"
            value={easToken}
            onChange={e => setEasToken(e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            onClick={handleValidateEAS}
            disabled={!easToken || validatingEAS}
            style={secondaryBtn}
          >
            {validatingEAS ? '...' : 'Validate'}
          </button>
        </div>

        {easStatus && (
          <div style={statusBox(easStatus.valid)}>
            {easStatus.valid
              ? `Connected${easStatus.username ? ` as ${easStatus.username}` : ''}`
              : easStatus.error}
          </div>
        )}

        <div style={{
          marginTop: 12, padding: '10px 12px', borderRadius: 6,
          background: 'rgba(99,102,241,0.06)', fontSize: 11,
          color: 'var(--muted-foreground)', lineHeight: 1.5,
        }}>
          Connect now — Cloud build & submit will activate in June.
          EAS builds iOS without a Mac, Android without Android Studio.
        </div>
      </div>

      {/* Section 3: App Store Connect */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>
          App Store Connect API
        </div>

        <div style={{ marginBottom: 8 }}>
          <label style={labelStyle}>
            Issuer ID
            <span style={{ marginLeft: 6, opacity: 0.6 }}>
              (App Store Connect &rarr; Users & Access &rarr; Integrations)
            </span>
          </label>
          <input
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            value={ascIssuerId}
            onChange={e => setAscIssuerId(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 8 }}>
          <label style={labelStyle}>
            Key ID
            <span style={{ marginLeft: 6, opacity: 0.6 }}>
              (10-character code shown next to your API key)
            </span>
          </label>
          <input
            placeholder="XXXXXXXXXX"
            value={ascKeyId}
            onChange={e => setAscKeyId(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>
            Private Key (.p8)
            <span style={{ marginLeft: 6, opacity: 0.6 }}>
              (downloaded once when creating the key)
            </span>
          </label>
          <textarea
            placeholder={'-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----'}
            value={ascPrivateKey}
            onChange={e => setAscPrivateKey(e.target.value)}
            rows={3}
            style={{ ...monoInputStyle, resize: 'vertical', display: 'block' }}
          />
          <input
            type="file" accept=".p8" ref={p8Ref} style={{ display: 'none' }}
            onChange={e => { if (e.target.files?.[0]) handleP8Upload(e.target.files[0]); }}
          />
          <button
            onClick={() => p8Ref.current?.click()}
            style={{ ...secondaryBtn, marginTop: 6 }}
          >
            Upload .p8 file
          </button>
        </div>

        <button
          onClick={handleValidateASC}
          disabled={!ascIssuerId || !ascKeyId || !ascPrivateKey || validatingASC}
          style={primaryBtn}
        >
          {validatingASC ? 'Validating...' : 'Validate & Save'}
        </button>

        {ascStatus && (
          <div style={statusBox(ascStatus.valid)}>
            {ascStatus.valid ? 'App Store Connect API connected' : ascStatus.error}
          </div>
        )}
      </div>

      {/* Section 4: Google Play */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>
          Google Play Console
        </div>

        <label style={labelStyle}>
          Service Account JSON
          <span style={{ marginLeft: 6, opacity: 0.6 }}>
            (Play Console &rarr; Setup &rarr; API access &rarr; Create service account &rarr; Download JSON)
          </span>
        </label>

        <input
          type="file" accept=".json" ref={googleJsonRef} style={{ display: 'none' }}
          onChange={e => { if (e.target.files?.[0]) handleGoogleJsonUpload(e.target.files[0]); }}
        />
        <button
          onClick={() => googleJsonRef.current?.click()}
          style={{ ...secondaryBtn, marginBottom: 8 }}
        >
          Upload service-account.json
        </button>

        {validatingGoogle && (
          <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
            Validating...
          </div>
        )}

        {googleStatus && (
          <div style={statusBox(googleStatus.valid)}>
            {googleStatus.valid
              ? `Connected — ${googleStatus.username}`
              : googleStatus.error}
          </div>
        )}

        {googleStatus?.valid && (
          <div style={{
            marginTop: 8, fontSize: 11, color: 'var(--muted-foreground)',
            lineHeight: 1.5,
          }}>
            Make sure this service account has Release Manager role
            in Play Console &rarr; Users and permissions.
          </div>
        )}
      </div>

    </div>
  );
};
