import { describe, it, expect } from 'vitest';
import {
  extractComponentProps,
  extractAppRouteUsages,
  validatePropWiring,
  formatPropWiringIssues,
} from '../PropWiringValidator';

describe('extractComponentProps', () => {
  it('extracts required and optional props from interface', () => {
    const content = `
interface ProfileProps {
  profile: UserProfile;
  onUpdateProfile: (p: Partial<UserProfile>) => void;
  title?: string;
  children?: React.ReactNode;
}
export default function Profile({ profile, onUpdateProfile }: ProfileProps) {}
`;
    const result = extractComponentProps(content);
    expect(result.required).toContain('profile');
    expect(result.required).toContain('onUpdateProfile');
    expect(result.optional).toContain('title');
    expect(result.required).not.toContain('children');
  });

  it('extracts required props from type alias', () => {
    const content = `
type ChatProps = {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  userProfile: UserProfile;
  isPremium: boolean;
  onSetPremium?: (value: boolean) => void;
};
export default function Chat({ messages, onSendMessage }: ChatProps) {}
`;
    const result = extractComponentProps(content);
    expect(result.required).toContain('messages');
    expect(result.required).toContain('onSendMessage');
    expect(result.required).toContain('userProfile');
    expect(result.required).toContain('isPremium');
    expect(result.optional).toContain('onSetPremium');
  });

  it('returns empty arrays for component with no props', () => {
    const content = `
export default function Home() {
  return <div>Hello</div>;
}
`;
    const result = extractComponentProps(content);
    expect(result.required).toHaveLength(0);
    expect(result.optional).toHaveLength(0);
  });
});

describe('extractAppRouteUsages', () => {
  it('extracts props passed to components in Route elements', () => {
    const appContent = `
export default function App() {
  const [profile, setProfile] = useState({ name: '' });
  return (
    <Routes>
      <Route path="/" element={<Chat messages={messages} onSendMessage={handleSend} userProfile={profile} isPremium={false} />} />
      <Route path="/profile" element={<Profile profile={profile} onUpdateProfile={handleUpdate} />} />
    </Routes>
  );
}
`;
    const usages = extractAppRouteUsages(appContent);
    const chat = usages.find(u => u.componentName === 'Chat');
    const profile = usages.find(u => u.componentName === 'Profile');

    expect(chat).toBeDefined();
    expect(chat!.passedProps).toContain('messages');
    expect(chat!.passedProps).toContain('userProfile');

    expect(profile).toBeDefined();
    expect(profile!.passedProps).toContain('profile');
    expect(profile!.passedProps).toContain('onUpdateProfile');
  });

  it('detects component rendered without props', () => {
    const appContent = `
<Route path="/profile" element={<Profile />} />
`;
    const usages = extractAppRouteUsages(appContent);
    const profile = usages.find(u => u.componentName === 'Profile');
    expect(profile).toBeDefined();
    expect(profile!.passedProps).toHaveLength(0);
  });
});

describe('validatePropWiring', () => {
  it('detects missing required props', () => {
    const files: Record<string, string> = {
      'App.tsx': `
import Profile from './pages/Profile';
export default function App() {
  return (
    <Routes>
      <Route path="/profile" element={<Profile />} />
    </Routes>
  );
}
`,
      'pages/Profile.tsx': `
interface ProfileProps {
  profile: UserProfile;
  onUpdateProfile: (p: Partial<UserProfile>) => void;
}
export default function Profile({ profile, onUpdateProfile }: ProfileProps) {
  return <div>{profile.name}</div>;
}
`,
    };

    const issues = validatePropWiring(files);
    expect(issues).toHaveLength(1);
    expect(issues[0].componentName).toBe('Profile');
    expect(issues[0].missingProps).toContain('profile');
    expect(issues[0].missingProps).toContain('onUpdateProfile');
  });

  it('passes when all required props are provided', () => {
    const files: Record<string, string> = {
      'App.tsx': `
import Profile from './pages/Profile';
export default function App() {
  const [profile, setProfile] = useState({ name: '' });
  return (
    <Routes>
      <Route path="/profile" element={<Profile profile={profile} onUpdateProfile={setProfile} />} />
    </Routes>
  );
}
`,
      'pages/Profile.tsx': `
interface ProfileProps {
  profile: UserProfile;
  onUpdateProfile: (p: Partial<UserProfile>) => void;
}
export default function Profile({ profile, onUpdateProfile }: ProfileProps) {
  return <div>{profile.name}</div>;
}
`,
    };

    const issues = validatePropWiring(files);
    expect(issues).toHaveLength(0);
  });

  it('ignores components without required props', () => {
    const files: Record<string, string> = {
      'App.tsx': `
<Route path="/" element={<Home />} />
`,
      'pages/Home.tsx': `
export default function Home() {
  return <div>Hello</div>;
}
`,
    };

    const issues = validatePropWiring(files);
    expect(issues).toHaveLength(0);
  });

  it('ignores missing App.tsx', () => {
    const files: Record<string, string> = {
      'pages/Profile.tsx': `
interface ProfileProps { profile: UserProfile; }
export default function Profile({ profile }: ProfileProps) { return null; }
`,
    };

    const issues = validatePropWiring(files);
    expect(issues).toHaveLength(0);
  });
});

describe('formatPropWiringIssues', () => {
  it('returns empty string for no issues', () => {
    expect(formatPropWiringIssues([])).toBe('');
  });

  it('formats issues with missing props', () => {
    const issues = [{
      componentFile: 'pages/Profile.tsx',
      componentName: 'Profile',
      requiredProps: ['profile', 'onUpdateProfile'],
      passedProps: [],
      missingProps: ['profile', 'onUpdateProfile'],
    }];

    const result = formatPropWiringIssues(issues);
    expect(result).toContain('Profile');
    expect(result).toContain('profile');
    expect(result).toContain('onUpdateProfile');
    expect(result).toContain('MISSING');
  });
});
