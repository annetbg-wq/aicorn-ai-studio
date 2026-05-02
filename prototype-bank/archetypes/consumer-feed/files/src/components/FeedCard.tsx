interface FeedItem {
  id: string;
  title: string;
  category: string;
  date: string;
  image: string;
  likes: number;
  saved: boolean;
}

interface FeedCardProps {
  item: FeedItem;
  onClick: () => void;
  onSave: () => void;
}

export default function FeedCard({ item, onClick, onSave }: FeedCardProps) {
  return (
    <div onClick={onClick} style={{ borderRadius: 16, overflow: 'hidden', background: '#0d0d12', border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer' }}>
      <img src={item.image} alt={item.title} style={{ width: '100%', height: 180, objectFit: 'cover' }} />
      <div style={{ padding: '14px 14px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ padding: '3px 8px', borderRadius: 12, background: 'rgba(167,139,250,0.12)', color: '#a78bfa', fontSize: 11, fontWeight: 600 }}>{item.category}</span>
          <span style={{ fontSize: 11, color: '#6b6b7a' }}>{item.date}</span>
        </div>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#e5e5ea', margin: '0 0 12px', lineHeight: 1.4 }}>{item.title}</h3>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#6b6b7a' }}>❤️ {item.likes}</span>
          <button onClick={e => { e.stopPropagation(); onSave(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>
            {item.saved ? '🔖' : '🏷️'}
          </button>
        </div>
      </div>
    </div>
  );
}
