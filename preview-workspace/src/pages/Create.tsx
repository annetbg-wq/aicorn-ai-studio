import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHabits } from '@/hooks/useHabits';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Save } from 'lucide-react';

// Simple UUID generator to avoid dependency
function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const COLORS = [
  { value: '211 78% 46%', label: 'Синий' },
  { value: '142 56% 40%', label: 'Зелёный' },
  { value: '185 70% 42%', label: 'Бирюзовый' },
  { value: '238 58% 58%', label: 'Фиолетовый' },
  { value: '0 72% 50%', label: 'Красный' },
  { value: '38 92% 50%', label: 'Оранжевый' },
];

const ICONS = ['🏃', '📖', '🧘', '💪', '🎨', '⚡', '📝', '🎯', '🌱', '💧'];

export default function Create() {
  const navigate = useNavigate();
  const { categories, addHabit } = useHabits();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id || '');
  const [color, setColor] = useState(COLORS[0].value);
  const [icon, setIcon] = useState(ICONS[0]);
  const [goal, setGoal] = useState('1');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'Введите название привычки';
    if (name.length > 50) newErrors.name = 'Название слишком длинное (макс. 50 символов)';
    if (!categoryId) newErrors.category = 'Выберите категорию';
    const goalNum = parseInt(goal);
    if (isNaN(goalNum) || goalNum < 1) newErrors.goal = 'Цель должна быть не менее 1';
    if (goalNum > 100) newErrors.goal = 'Цель не может быть больше 100';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    addHabit({
      id: generateId(),
      name: name.trim(),
      description: description.trim() || undefined,
      categoryId,
      color,
      icon,
      createdAt: new Date().toISOString(),
      completedDates: [],
      streak: 0,
      goal: parseInt(goal),
    });

    navigate('/', { replace: true });
  };

  return (
    <div className="pb-20">
      <div className="p-4">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold text-foreground">Новая привычка</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Создание привычки</CardTitle>
            <CardDescription>
              Заполните информацию о новой привычке
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Название *</Label>
                <Input
                  id="name"
                  placeholder="Например: Пить 2 литра воды"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={errors.name ? 'border-destructive' : ''}
                />
                {errors.name && (
                  <p className="text-xs text-destructive">{errors.name}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Описание</Label>
                <Textarea
                  id="description"
                  placeholder="Краткое описание привычки"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Категория *</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger className={errors.category ? 'border-destructive' : ''}>
                    <SelectValue placeholder="Выберите категорию" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.emoji} {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.category && (
                  <p className="text-xs text-destructive">{errors.category}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Иконка</Label>
                <div className="flex gap-2 flex-wrap">
                  {ICONS.map(ic => (
                    <button
                      key={ic}
                      type="button"
                      className={`w-10 h-10 rounded-lg text-lg flex items-center justify-center transition-all ${
                        icon === ic
                          ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2'
                          : 'bg-muted hover:bg-muted/80'
                      }`}
                      onClick={() => setIcon(ic)}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Цвет</Label>
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map(c => (
                    <button
                      key={c.value}
                      type="button"
                      className={`w-8 h-8 rounded-full transition-all ${
                        color === c.value
                          ? 'ring-2 ring-primary ring-offset-2 scale-110'
                          : ''
                      }`}
                      style={{ backgroundColor: `hsl(${c.value})` }}
                      onClick={() => setColor(c.value)}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="goal">Цель (раз в день) *</Label>
                <Input
                  id="goal"
                  type="number"
                  min="1"
                  max="100"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  className={errors.goal ? 'border-destructive' : ''}
                />
                {errors.goal && (
                  <p className="text-xs text-destructive">{errors.goal}</p>
                )}
              </div>

              <Button type="submit" className="w-full mt-6">
                <Save className="w-4 h-4 mr-2" />
                Сохранить привычку
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
