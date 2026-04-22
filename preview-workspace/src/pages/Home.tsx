import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, MapPin, Users, Plus, Search, Lock } from 'lucide-react';
import { CommunityEvent, SEED_EVENTS } from '@/data/events';

const CATEGORIES = ['Все', 'Волонтёрство', 'Социальные', 'Здоровье', 'Мастер-классы'];

export default function Home() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Все');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);

  // New event form
  const [newName, setNewName] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newCategory, setNewCategory] = useState('Социальные');
  const [newDescription, setNewDescription] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('events');
    if (saved) {
      setEvents(JSON.parse(saved));
    } else {
      setEvents(SEED_EVENTS);
      localStorage.setItem('events', JSON.stringify(SEED_EVENTS));
    }
    setIsPremium(localStorage.getItem('is_premium') === 'true');
  }, []);

  const filtered = events.filter((e) => {
    const matchSearch = e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.location.toLowerCase().includes(search.toLowerCase());
    const matchCategory = category === 'Все' || e.category === category;
    return matchSearch && matchCategory;
  });

  const handleAddEvent = () => {
    if (!newName || !newDate || !newLocation) return;

    const userEventsCount = events.filter(e => e.organizerId === 'currentUser').length;
    if (userEventsCount >= 3 && !isPremium) {
      setPaywallOpen(true);
      return;
    }

    const newEvent: CommunityEvent = {
      id: Date.now().toString(),
      name: newName,
      date: newDate,
      location: newLocation,
      organizerId: 'currentUser',
      description: newDescription,
      category: newCategory,
      attendees: 0,
      maxAttendees: 30,
    };

    const updated = [newEvent, ...events];
    setEvents(updated);
    localStorage.setItem('events', JSON.stringify(updated));

    setNewName('');
    setNewDate('');
    setNewLocation('');
    setNewDescription('');
    setDialogOpen(false);
  };

  const handleUpgrade = () => {
    localStorage.setItem('is_premium', 'true');
    setIsPremium(true);
    setPaywallOpen(false);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-250">
      {/* Hero */}
      <section className="mb-8 rounded-2xl bg-gradient-to-br from-primary/5 via-accent/10 to-primary/5 p-6">
        <h1 className="mb-2 text-2xl font-bold text-foreground" style={{ fontFamily: 'Georgia, serif' }}>
          Добро пожаловать в Community Connect
        </h1>
        <p className="mb-4 text-sm text-muted-foreground">
          Находите мероприятия рядом с вами и организуйте свои собственные.
        </p>
        <div className="flex gap-2">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Создать мероприятие
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Новое мероприятие</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="ev-name">Название</Label>
                  <Input
                    id="ev-name"
                    placeholder="Например, Утренняя пробежка"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ev-date">Дата</Label>
                  <Input
                    id="ev-date"
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ev-location">Место</Label>
                  <Input
                    id="ev-location"
                    placeholder="Адрес или название места"
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Категория</Label>
                  <Select value={newCategory} onValueChange={setNewCategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.filter(c => c !== 'Все').map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ev-desc">Описание</Label>
                  <Input
                    id="ev-desc"
                    placeholder="Краткое описание мероприятия"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                  />
                </div>
                <Button onClick={handleAddEvent} className="w-full" disabled={!newName || !newDate || !newLocation}>
                  Опубликовать
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </section>

      {/* Paywall Modal */}
      <Dialog open={paywallOpen} onOpenChange={setPaywallOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-accent" />
              Премиум-доступ
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Вы создали 3 мероприятия. Разблокируйте расширенные инструменты управления событиями!
            </p>
            <div className="rounded-xl bg-accent/10 p-4">
              <p className="text-sm font-medium text-foreground">
                Откройте больше возможностей для управления вашими мероприятиями!
              </p>
            </div>
            <Button onClick={handleUpgrade} className="w-full">
              Обновить до Премиум
            </Button>
            <Button variant="ghost" onClick={() => setPaywallOpen(false)} className="w-full">
              Может, позже
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Search & Filter */}
      <div className="mb-6 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Поиск мероприятий..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {CATEGORIES.map((cat) => (
            <Button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
                category === cat
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent/50'
              }`}
            >
              {cat}
            </Button>
          ))}
        </div>
      </div>

      {/* Events List */}
      {filtered.length === 0 ? (
        <div className="animate-in fade-in zoom-in-95 duration-500 delay-100 flex flex-col items-center justify-center py-16 text-muted-foreground">
          <span className="mb-3 text-4xl">📋</span>
          <p className="text-sm font-medium">
            {search ? `Ничего не найдено для «${search}»` : 'Мероприятий пока нет'}
          </p>
          <p className="mt-1 text-xs">
            {search ? 'Попробуйте изменить запрос' : 'Создайте первое мероприятие, чтобы начать'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((event, index) => (
            <Card
              key={event.id}
              className="overflow-hidden transition-shadow duration-200 hover:shadow-md"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <CardContent className="p-4">
                <div className="mb-2 flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-foreground line-clamp-1">
                      {event.name}
                    </h3>
                    <Badge variant="outline" className="mt-1 text-[10px]">
                      {event.category}
                    </Badge>
                  </div>
                </div>
                {event.description && (
                  <p className="mb-3 text-xs text-muted-foreground line-clamp-2">
                    {event.description}
                  </p>
                )}
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatDate(event.date)}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    <span className="truncate max-w-[140px]">{event.location}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {event.attendees}/{event.maxAttendees}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}