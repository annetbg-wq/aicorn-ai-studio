import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const Home = () => {
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate fetching recommendations
    setTimeout(() => {
      setRecommendations([
        'Улучшите качество сна, избегая экранов перед сном.',
        'Регулярно занимайтесь физической активностью.',
        'Создайте комфортную атмосферу для сна.',
      ]);
      setLoading(false);
    }, 1000);
  }, []);

  return (
    <div className='max-w-md mx-auto min-h-screen p-4'>
      <h1 className='text-2xl font-bold mb-4'>Рекомендации по сну</h1>
      {loading ? (
        <p>Загрузка...</p>
      ) : recommendations.length > 0 ? (
        recommendations.map((rec, index) => (
          <Card key={index} className='mb-4'>
            <CardHeader>
              <CardTitle>Рекомендация {index + 1}</CardTitle>
            </CardHeader>
            <CardContent>{rec}</CardContent>
          </Card>
        ))
      ) : (
        <div className='flex flex-col items-center justify-center py-16 text-muted-foreground'>
          <span className='text-4xl mb-3'>📋</span>
          <p className='text-sm font-medium'>Ничего не найдено</p>
          <p className='text-xs mt-1'>Добавьте свои рекомендации для начала</p>
        </div>
      )}
      <Button className='mt-4'>Добавить рекомендацию</Button>
    </div>
  );
};

export default Home;