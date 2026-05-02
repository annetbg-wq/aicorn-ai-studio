import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const Home = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEvents = () => {
      const storedEvents = JSON.parse(localStorage.getItem('eventList') || '[]');
      setEvents(storedEvents);
      setLoading(false);
    };
    fetchEvents();
  }, []);

  return (
    <div className="max-w-2xl mx-auto py-6">
      <h1 className="text-2xl font-bold mb-4">Ближайшие события</h1>
      {loading ? (
        <p>Загрузка...</p>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <span className="text-4xl mb-3">📋</span>
          <p className="text-sm font-medium">Нет доступных событий</p>
        </div>
      ) : (
        events.map(event => (
          <Card key={event.id} className="mb-4">
            <h2 className="text-lg font-bold">{event.title}</h2>
            <p>{event.date}</p>
            <Button onClick={() => {/* navigate to event details */}}>Подробнее</Button>
          </Card>
        ))
      )}
    </div>
  );
};

export default Home;
