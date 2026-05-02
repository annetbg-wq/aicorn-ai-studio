import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const CreateEvent = () => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');

  const handleSubmit = () => {
    const newEvent = { id: Date.now().toString(), title, description, date };
    const currentEvents = JSON.parse(localStorage.getItem('eventList') || '[]');
    localStorage.setItem('eventList', JSON.stringify([...currentEvents, newEvent]));
    // navigate back to home or show success message
  };

  return (
    <div className="max-w-2xl mx-auto py-6">
      <h1 className="text-2xl font-bold mb-4">Создать событие</h1>
      <Input placeholder="Название" value={title} onChange={e => setTitle(e.target.value)} />
      <Input placeholder="Описание" value={description} onChange={e => setDescription(e.target.value)} />
      <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
      <Button onClick={handleSubmit}>Создать</Button>
    </div>
  );
};

export default CreateEvent;
