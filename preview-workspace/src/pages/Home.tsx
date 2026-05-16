import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHabits } from '@/hooks/useHabits';
import { useProfile } from '@/hooks/useProfile';
import { HabitCard } from '@/components/HabitCard';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Target, Sparkles } from 'lucide-react';
import { APP_CONFIG } from '@/config/app';

export default function Home() {
  const navigate = useNavigate();
  const { habits, categories, loading, toggleCompletion, getTodayHabits, getHabitsByCategory } = useHabits();
  const { profile } = useProfile();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [displayCount, setDisplayCount] = useState(APP_CONFIG.pagination.pageSize);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const todayHabits = getTodayHabits();
  const filteredHabits = selectedCategory
    ? todayHabits.filter(h => h.categoryId === selectedCategory)
    : todayHabits;

  const displayedHabits = filteredHabits.slice(0, displayCount);
  const hasMore = displayCount < filteredHabits.length;

  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore) {
          setDisplayCount(prev => prev + APP_CONFIG.pagination.pageSize);
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, [hasMore, displayedHabits.length]);

  const handleToggle = (habitId: string, date: string) => {
    toggleCompletion(habitId, date);
  };

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-2">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-8 w-20 rounded-full" />)}
        </div>
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="pb-20">
      <div className="p-4 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Привет, {profile.name || 'Друг'}!
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {todayHabits.length === 0
                ? 'Создайте свою первую привычку'
                : `Сегодня: ${todayHabits.filter(h => h.completedDates.includes(new Date().toISOString().split('T')[0])).length} из ${todayHabits.length} выполнено`}
            </p>
          </div>
          <Button
            size="icon"
            className="rounded-full w-12 h-12 shadow-lg"
            onClick={() => navigate('/create')}
          >
            <Plus className="w-6 h-6" />
          </Button>
        </div>

        {categories.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
            <Badge
              variant={selectedCategory === null ? 'default' : 'outline'}
              className="cursor-pointer whitespace-nowrap px-3 py-1.5"
              onClick={() => setSelectedCategory(null)}
            >
              Все
            </Badge>
            {categories.map(cat => (
              <Badge
                key={cat.id}
                variant={selectedCategory === cat.id ? 'default' : 'outline'}
                className="cursor-pointer whitespace-nowrap px-3 py-1.5"
                onClick={() => setSelectedCategory(cat.id === selectedCategory ? null : cat.id)}
              >
                {cat.emoji} {cat.name}
              </Badge>
            ))}
          </div>
        )}

        {displayedHabits.length === 0 ? (
          <EmptyState
            icon={<Target className="w-12 h-12" />}
            title="Нет привычек"
            description={
              selectedCategory
                ? 'В этой категории пока нет привычек'
                : 'Создайте свою первую привычку, чтобы начать отслеживание'
            }
            action={
              <Button onClick={() => navigate('/create')}>
                <Sparkles className="w-4 h-4 mr-2" />
                Создать привычку
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {displayedHabits.map(habit => (
              <HabitCard
                key={habit.id}
                habit={habit}
                onToggle={handleToggle}
                onClick={() => navigate(`/habit/${habit.id}`)}
              />
            ))}
            {hasMore && <div ref={loadMoreRef} className="h-4" />}
          </div>
        )}
      </div>
    </div>
  );
}
