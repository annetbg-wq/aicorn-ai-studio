import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const Settings = () => {
  const [fullName, setFullName] = useState('');
  const [goal, setGoal] = useState('');

  const handleSave = () => {
    // Save settings logic here
    console.log('Settings saved:', { fullName, goal });
  };

  return (
    <div className='max-w-md mx-auto min-h-screen p-4'>
      <h1 className='text-2xl font-bold mb-4'>Настройки</h1>
      <div className='space-y-4'>
        <div>
          <label htmlFor='fullName' className='block mb-1'>Полное имя</label>
          <Input id='fullName' value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder='Введите ваше полное имя' />
        </div>
        <div>
          <label htmlFor='goal' className='block mb-1'>Цель</label>
          <Input id='goal' value={goal} onChange={(e) => setGoal(e.target.value)} placeholder='Введите вашу цель' />
        </div>
        <Button onClick={handleSave} className='w-full mt-4'>Сохранить настройки</Button>
      </div>
    </div>
  );
};

export default Settings;