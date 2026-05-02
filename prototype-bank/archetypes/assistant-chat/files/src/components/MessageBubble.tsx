interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  time: string;
}

export default function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', gap: 4 }}>
      <div style={{
        maxWidth: '78%', padding: '11px 14px', borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
        background: isUser ? 'linear-gradient(135deg, #a78bfa, #8b5cf6)' : '#0d0d12',
        border: isUser ? 'none' : '1px solid rgba(255,255,255,0.07)',
        color: '#e5e5ea', fontSize: 14, lineHeight: 1.5,
      }}>
        {message.text}
      </div>
      <span style={{ fontSize: 10, color: '#6b6b7a' }}>{message.time}</span>
    </div>
  );
}
