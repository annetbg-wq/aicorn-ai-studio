import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CalendarEvent } from '@/data/projectData';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, Flag, Target } from 'lucide-react';

interface CalendarSidebarProps {
  events: CalendarEvent[];
}

const eventTypeConfig = {
  meeting: { icon: Clock, color: 'bg-blue-500', label: 'Meeting' },
  deadline: { icon: Flag, color: 'bg-red-500', label: 'Deadline' },
  milestone: { icon: Target, color: 'bg-green-500', label: 'Milestone' },
};

export default function CalendarSidebar({ events }: CalendarSidebarProps) {
  const [currentDate, setCurrentDate] = useState(new Date(2024, 0, 15)); // Jan 15, 2024

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const getEventsForDate = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return events.filter((e) => e.date === dateStr);
  };

  const calendarDays = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    calendarDays.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    calendarDays.push(i);
  }

  const upcomingEvents = events
    .filter((e) => new Date(e.date) >= new Date(2024, 0, 15))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Calendar */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">
              {monthNames[month]} {year}
            </CardTitle>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Day Headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
              <div key={day} className="text-center text-xs font-medium text-muted-foreground py-1">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, index) => {
              if (day === null) {
                return <div key={`empty-${index}`} className="h-8" />;
              }
              const dayEvents = getEventsForDate(day);
              const isToday = day === 15 && month === 0 && year === 2024;

              return (
                <div
                  key={day}
                  className={`h-8 flex flex-col items-center justify-center rounded-md text-xs cursor-pointer transition-colors
                    ${isToday ? 'bg-primary text-primary-foreground font-bold' : 'hover:bg-muted'}
                    ${dayEvents.length > 0 && !isToday ? 'font-medium text-foreground' : 'text-muted-foreground'}
                  `}
                >
                  {day}
                  {dayEvents.length > 0 && (
                    <div className="flex gap-0.5 mt-0.5">
                      {dayEvents.slice(0, 2).map((event) => (
                        <div
                          key={event.id}
                          className={`w-1 h-1 rounded-full ${eventTypeConfig[event.type].color}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Upcoming Events */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base font-semibold">Upcoming</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {upcomingEvents.map((event) => {
            const config = eventTypeConfig[event.type];
            const EventIcon = config.icon;
            const eventDate = new Date(event.date);

            return (
              <div key={event.id} className="flex items-start gap-3">
                <div className={`p-1.5 rounded-md ${config.color}/10`}>
                  <EventIcon className={`h-3.5 w-3.5 ${config.color.replace('bg-', 'text-')}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{event.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
                <Badge variant="outline" className="text-xs shrink-0">
                  {config.label}
                </Badge>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Team Members */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Team</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { name: 'Sarah Mitchell', role: 'Lead Developer', avatar: 'SM', tasks: 3 },
            { name: 'James Rodriguez', role: 'UI Designer', avatar: 'JR', tasks: 2 },
            { name: 'Emily Chen', role: 'Backend Dev', avatar: 'EC', tasks: 2 },
            { name: 'Michael Park', role: 'QA Engineer', avatar: 'MP', tasks: 2 },
            { name: 'Lisa Wang', role: 'Product Manager', avatar: 'LW', tasks: 1 },
          ].map((member) => (
            <div key={member.avatar} className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                <span className="text-xs font-medium text-primary-foreground">{member.avatar}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{member.name}</p>
                <p className="text-xs text-muted-foreground">{member.role}</p>
              </div>
              <Badge variant="secondary" className="text-xs">
                {member.tasks} tasks
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}