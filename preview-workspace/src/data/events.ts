export interface CommunityEvent {
  id: string;
  name: string;
  date: string;
  location: string;
  organizerId: string;
  description: string;
  category: string;
  attendees: number;
  maxAttendees: number;
}

export const SEED_EVENTS: CommunityEvent[] = [
  {
    id: '1',
    name: 'Уборка территории парка',
    date: '2026-04-25',
    location: 'Центральный парк',
    organizerId: 'user1',
    description: 'Присоединяйтесь к ежемесячной уборке нашего любимого парка. Перчатки и мешки для мусора будут предоставлены.',
    category: 'Волонтёрство',
    attendees: 18,
    maxAttendees: 30,
  },
  {
    id: '2',
    name: 'Книжный клуб: «Мастер и Маргарита»',
    date: '2026-04-26',
    location: 'Городская библиотека, зал 3',
    organizerId: 'user2',
    description: 'Обсуждаем классику Булгакова. Приходите, даже если не успели дочитать — будет интересно!',
    category: 'Социальные',
    attendees: 8,
    maxAttendees: 15,
  },
  {
    id: '3',
    name: 'Утренняя йога в парке',
    date: '2026-04-27',
    location: 'Парк Восточный, поляна',
    organizerId: 'user3',
    description: 'Бесплатное занятие йогой для всех уровней подготовки. Возьмите коврик и воду.',
    category: 'Здоровье',
    attendees: 12,
    maxAttendees: 20,
  },
  {
    id: '4',
    name: 'Мастер-класс по гончарному делу',
    date: '2026-04-28',
    location: 'Арт-студия «Глина», ул. Ленина 42',
    organizerId: 'user4',
    description: 'Попробуйте себя в роли гончара! Все материалы включены. Подходит для начинающих.',
    category: 'Мастер-классы',
    attendees: 6,
    maxAttendees: 10,
  },
  {
    id: '5',
    name: 'Субботник во дворе дома 15',
    date: '2026-04-29',
    location: 'ул. Мира, дом 15, двор',
    organizerId: 'user5',
    description: 'Наведём порядок во дворе, посадим цветы. Жители дома — присоединяйтесь!',
    category: 'Волонтёрство',
    attendees: 5,
    maxAttendees: 25,
  },
];