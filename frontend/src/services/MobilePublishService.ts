import { ConfigService } from './ConfigService';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RNConversionConfig {
  files:       Record<string, string>;
  projectName: string;
  apiKey:      string;
  onLog?:      (msg: string) => void;
  onStream?:   (chunk: string) => void;
}

export interface ASCCredentials {
  issuerId:   string;
  keyId:      string;
  privateKey: string;
}

export interface GoogleCredentials {
  serviceAccountJson: string;
}

export interface ValidationResult {
  valid:     boolean;
  username?: string;
  error?:    string;
}

// ── React Native generation ───────────────────────────────────────────────────

export class MobilePublishService {

  static async generateRNCode(config: RNConversionConfig): Promise<Record<string, string>> {
    const log = config.onLog ?? (() => {});

    const analysis = this.analyzeWebProject(config.files);
    log(`[Mobile] Analyzing: ${analysis.pageCount} pages, ${analysis.shadcnUsed.join(', ') || 'no shadcn'}`);

    const webCode = Object.entries(config.files)
      .map(([path, content]) => `// FILE: ${path}\n${content}`)
      .join('\n\n')
      .slice(0, 30000);

    const prompt = `Convert this React web application to React Native (Expo SDK 51).

WEB CODE:
${webCode}

ANALYSIS:
- Pages: ${analysis.pages.join(', ') || 'App.tsx only'}
- shadcn components: ${analysis.shadcnUsed.join(', ') || 'none'}
- Navigation: ${analysis.hasRouter ? 'react-router-dom (convert to react-navigation)' : 'none'}

OUTPUT RULES:
- Use <!--FILE:path--> markers for each file
- Required files: App.tsx, app.json, package.json
- Pages → screens/ directory
- div → View, p/span → Text, img → Image, button → TouchableOpacity or Pressable
- className → StyleSheet.create() styles
- onClick → onPress
- Input (shadcn) → TextInput (react-native)
- Button (shadcn) → Button (react-native-paper)
- Card (shadcn) → Card (react-native-paper)
- localStorage → AsyncStorage (@react-native-async-storage/async-storage)
- react-router-dom → @react-navigation/native
- All TypeScript types and business logic — preserve exactly
- StyleSheet must be complete — no missing styles
- app.json: name="${config.projectName}", sdkVersion="51.0.0"
- package.json: include all required Expo/RN dependencies

Output ONLY file markers and code. No explanation.`;

    const modelId  = ConfigService.resolveModel('build');
    const apiKey   = ConfigService.getKeyForAgent('build') || config.apiKey;
    const agentCfg = ConfigService.getAgentConfig('agent_build');
    const provider = agentCfg?.provider ?? 'openrouter';

    const ENDPOINTS: Record<string, string> = {
      openrouter: 'https://openrouter.ai/api/v1/chat/completions',
      anthropic:  'https://api.anthropic.com/v1/messages',
      openai:     'https://api.openai.com/v1/chat/completions',
      google:     'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    };
    const endpoint = ENDPOINTS[provider] ?? ENDPOINTS.openrouter;

    log(`[Mobile] Generating RN code via ${provider}/${modelId}...`);

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://aic-rg.studio',
      },
      body: JSON.stringify({
        model:      modelId,
        max_tokens: 16000,
        stream:     true,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    if (!resp.ok) throw new Error(`LLM error: ${resp.status} ${await resp.text()}`);

    const reader  = resp.body!.getReader();
    const decoder = new TextDecoder();
    let raw = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const clean = line.replace(/^data: /, '').trim();
        if (!clean || clean === '[DONE]') continue;
        try {
          const chunk = JSON.parse(clean).choices?.[0]?.delta?.content ?? '';
          if (chunk) { raw += chunk; config.onStream?.(chunk); }
        } catch { /* skip non-JSON lines */ }
      }
    }

    const files: Record<string, string> = {};
    const regex = /<!--FILE:(.*?)-->([\s\S]*?)(?=<!--FILE:|$)/g;
    let match;
    while ((match = regex.exec(raw)) !== null) {
      const [, path, content] = match;
      if (path?.trim() && content?.trim()) {
        files[path.trim()] = content.trim();
      }
    }

    log(`[Mobile] Generated ${Object.keys(files).length} files`);
    return files;
  }

  static analyzeWebProject(files: Record<string, string>) {
    const allCode = Object.values(files).join('\n');
    const pages   = Object.keys(files).filter(p => p.startsWith('pages/'))
                      .map(p => p.replace('pages/', '').replace('.tsx', ''));
    const shadcnComponents = [
      'Button','Card','Input','Badge','Dialog','Select','Progress',
      'Tabs','Sheet','Switch','Textarea','Label','Separator','Skeleton',
    ].filter(c => allCode.includes(`@/components/ui/${c.toLowerCase()}`));

    return {
      pageCount:  pages.length,
      pages,
      shadcnUsed: shadcnComponents,
      hasRouter:  allCode.includes('react-router-dom'),
    };
  }

  // ── Download ZIP ──────────────────────────────────────────────────────────

  static async downloadZip(
    rnFiles: Record<string, string>,
    projectName: string,
  ): Promise<void> {
    const JSZip = (await import('jszip')).default;
    const zip   = new JSZip();
    for (const [path, content] of Object.entries(rnFiles)) {
      zip.file(path, content);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${projectName}-expo.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Expo Snack ────────────────────────────────────────────────────────────

  static async openInSnack(
    rnFiles: Record<string, string>,
    projectName: string,
    onLog?: (msg: string) => void,
  ): Promise<void> {
    onLog?.('[Snack] Creating preview...');
    const files: Record<string, { type: string; contents: string }> = {};
    for (const [path, contents] of Object.entries(rnFiles)) {
      files[path] = { type: 'CODE', contents };
    }
    const resp = await fetch('https://exp.host/--/api/v2/snack/save', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        manifest: { name: projectName, sdkVersion: '51.0.0' },
        code:     files,
        dependencies: {
          'react-native-paper':                    { version: '^5.12.3' },
          '@react-navigation/native':              { version: '^6.1.17' },
          '@react-navigation/bottom-tabs':         { version: '^6.5.20' },
          '@react-navigation/native-stack':        { version: '^6.9.26' },
          'react-native-safe-area-context':        { version: '4.10.1'  },
          'react-native-screens':                  { version: '3.31.1'  },
          '@expo/vector-icons':                    { version: '^14.0.0' },
          '@react-native-async-storage/async-storage': { version: '^1.23.1' },
        },
      }),
    });
    if (!resp.ok) throw new Error(`Snack API: ${resp.status}`);
    const data = await resp.json();
    const url  = `https://snack.expo.dev/${data.id}`;
    onLog?.(`[Snack] Opened: ${url}`);
    window.open(url, '_blank');
  }

  // ── App Store Connect JWT (Web Crypto API) ────────────────────────────────

  static async generateASCJWT(creds: ASCCredentials): Promise<string> {
    const pem = creds.privateKey
      .replace('-----BEGIN PRIVATE KEY-----', '')
      .replace('-----END PRIVATE KEY-----', '')
      .replace(/\s/g, '');

    const keyData  = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8', keyData,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false, ['sign'],
    );

    const b64url = (obj: object) =>
      btoa(JSON.stringify(obj))
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

    const now     = Math.floor(Date.now() / 1000);
    const header  = b64url({ alg: 'ES256', kid: creds.keyId, typ: 'JWT' });
    const payload = b64url({
      iss: creds.issuerId,
      iat: now,
      exp: now + 1200,
      aud: 'appstoreconnect-v1',
    });

    const input = `${header}.${payload}`;
    const sig   = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      cryptoKey,
      new TextEncoder().encode(input),
    );
    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

    return `${input}.${sigB64}`;
  }

  static async validateASC(creds: ASCCredentials): Promise<ValidationResult> {
    try {
      const token = await this.generateASCJWT(creds);
      const resp  = await fetch(
        'https://api.appstoreconnect.apple.com/v1/apps?limit=1',
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (resp.status === 401) return { valid: false, error: 'Invalid credentials' };
      if (resp.status === 403) return { valid: false, error: 'Need App Manager role in App Store Connect' };
      if (!resp.ok)            return { valid: false, error: `API error ${resp.status}` };
      return { valid: true };
    } catch (err) {
      return { valid: false, error: String(err) };
    }
  }

  // ── Google Play OAuth2 (Service Account JWT) ──────────────────────────────

  static async validateGooglePlay(creds: GoogleCredentials): Promise<ValidationResult> {
    try {
      const sa = JSON.parse(creds.serviceAccountJson);

      for (const f of ['type','project_id','private_key','client_email']) {
        if (!sa[f]) return { valid: false, error: `Missing field: ${f}` };
      }
      if (sa.type !== 'service_account') {
        return { valid: false, error: 'Must be service_account type' };
      }

      const b64url = (obj: object) =>
        btoa(JSON.stringify(obj))
          .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

      const now     = Math.floor(Date.now() / 1000);
      const header  = b64url({ alg: 'RS256', typ: 'JWT' });
      const payload = b64url({
        iss:   sa.client_email,
        scope: 'https://www.googleapis.com/auth/androidpublisher',
        aud:   'https://oauth2.googleapis.com/token',
        iat:   now,
        exp:   now + 3600,
      });

      const pem = sa.private_key
        .replace('-----BEGIN PRIVATE KEY-----', '')
        .replace('-----END PRIVATE KEY-----', '')
        .replace(/\s/g, '');
      const keyData   = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
      const cryptoKey = await crypto.subtle.importKey(
        'pkcs8', keyData,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false, ['sign'],
      );

      const input = `${header}.${payload}`;
      const sig   = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5', cryptoKey,
        new TextEncoder().encode(input),
      );
      const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

      const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${input}.${sigB64}`,
      });

      if (!tokenResp.ok) {
        const e = await tokenResp.json();
        return { valid: false, error: e.error_description ?? 'OAuth2 failed' };
      }
      return { valid: true, username: sa.client_email };
    } catch (err) {
      return { valid: false, error: String(err) };
    }
  }

  // ── EAS token validation ──────────────────────────────────────────────────

  static async validateEAS(token: string): Promise<ValidationResult> {
    try {
      const resp = await fetch('https://api.expo.dev/v2/auth/userInfo', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) return { valid: false, error: `EAS error ${resp.status}` };
      const data = await resp.json();
      return { valid: true, username: data.data?.username };
    } catch (err) {
      return { valid: false, error: String(err) };
    }
  }
}
