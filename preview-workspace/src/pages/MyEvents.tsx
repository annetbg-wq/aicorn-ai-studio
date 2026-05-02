import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';

const MyEvents = () => {
  const [myEvents, setMyEvents] = useState([]);

  useEffect(() => {
    const storedRSVPs = JSON.parse(localStorage.getItem('rsvps') || '[]');
    const allEvents = JSON.parse(localStorage.getItem('eventList') || '[]');
    const myRSVPs = allEvents.filter(event => storedRSVPs.includes(event.id));
    setMyEvents(myRSVPs);
  }, []);

  return (
    <div className="max-w-2xl mx-auto py-6">
      <h1 className="text-2xl font-bold mb-4">Мои события</h1>
      {myEvents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <span className="text-4xl mb-3">📋</span>
          <p className="text-sm font-medium">Нет RSVP событий</p>
        </div>
      ) : (
        myEvents.map(event => (
          <Card key={event.id} className="mb-4">
            <h2 className="text-lg font-bold">{event.title}</h2>
            <p>{event.date}</p>
          </Card>
        ))
      )}
    </div>
  );
};

export default MyEvents;
