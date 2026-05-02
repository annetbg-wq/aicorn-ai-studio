import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

const EventDetails = () => {
  const { id } = useParams();
  const [event, setEvent] = useState(null);

  useEffect(() => {
    const storedEvents = JSON.parse(localStorage.getItem('eventList') || '[]');
    const foundEvent = storedEvents.find(e => e.id === id);
    setEvent(foundEvent);
  }, [id]);

  if (!event) return <p>Загрузка...</p>;

  return (
    <div className="max-w-2xl mx-auto py-6">
      <h1 className="text-2xl font-bold mb-4">{event.title}</h1>
      <p>{event.description}</p>
      <p>{event.date}</p>
      <Button>RSVP</Button>
    </div>
  );
};

export default EventDetails;
