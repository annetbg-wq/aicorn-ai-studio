import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const AccountSettings = () => {
  const [name, setName] = useState('');

  const handleSave = () => {
    const userProfile = { name };
    localStorage.setItem('userProfile', JSON.stringify(userProfile));
  };

  return (
    <div className="max-w-2xl mx-auto py-6">
      <h1 className="text-2xl font-bold mb-4">Настройки аккаунта</h1>
      <Input placeholder="Имя" value={name} onChange={e => setName(e.target.value)} />
      <Button onClick={handleSave}>Сохранить изменения</Button>
    </div>
  );
};

export default AccountSettings;
