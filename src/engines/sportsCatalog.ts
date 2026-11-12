import type { SportEngineType, SportStatMetric, TiebreakerCriterion } from '../types/sigd';

export interface DefaultSportSeed {
  id: string;
  key: string;
  name: string;
  engineType: SportEngineType;
  periodsCount: number;
  periodLabel: string;
  allowDraws: boolean;
  isPrimary: boolean;
  active: boolean;
  statSchema: SportStatMetric[];
  defaultRule: {
    name: string;
    winPoints: number;
    drawPoints: number;
    lossPoints: number;
    tiebreakers: TiebreakerCriterion[];
    minRestHours: number;
    matchDurationMinutes: number;
    maxPlayersOnField: number;
    yellowCardsSuspensionLimit: number;
  };
}

export const DEFAULT_SPORTS_CATALOG: DefaultSportSeed[] = [
  {
    id: 'sport_futbol_11',
    key: 'futbol-11',
    name: 'Fútbol Soccer',
    engineType: 'football',
    periodsCount: 2,
    periodLabel: 'Tiempo',
    allowDraws: true,
    isPrimary: true,
    active: true,
    statSchema: [
      { key: 'goals', label: 'Goles', unit: 'goles' },
      { key: 'assists', label: 'Asistencias', unit: 'asist.' },
      { key: 'yellowCards', label: 'Tarjetas Amarillas', unit: 'TA' },
      { key: 'redCards', label: 'Tarjetas Rojas', unit: 'TR' },
      { key: 'cleanSheets', label: 'Vallas Invictas', unit: 'VI' },
      { key: 'minutesPlayed', label: 'Minutos Jugados', unit: 'min' },
    ],
    defaultRule: {
      name: 'Reglamento Oficial Fútbol Soccer',
      winPoints: 3,
      drawPoints: 1,
      lossPoints: 0,
      tiebreakers: ['points', 'goal_difference', 'goals_for', 'head_to_head', 'wins'],
      minRestHours: 24,
      matchDurationMinutes: 90,
      maxPlayersOnField: 11,
      yellowCardsSuspensionLimit: 5,
    },
  },
  {
    id: 'sport_futbol_rapido',
    key: 'futbol-rapido',
    name: 'Fútbol Rápido / 7',
    engineType: 'football',
    periodsCount: 4,
    periodLabel: 'Cuarto',
    allowDraws: true,
    isPrimary: false,
    active: true,
    statSchema: [
      { key: 'goals', label: 'Goles', unit: 'goles' },
      { key: 'assists', label: 'Asistencias', unit: 'asist.' },
      { key: 'yellowCards', label: 'Tarjetas Amarillas', unit: 'TA' },
      { key: 'redCards', label: 'Tarjetas Rojas', unit: 'TR' },
    ],
    defaultRule: {
      name: 'Reglamento Fútbol Rápido',
      winPoints: 3,
      drawPoints: 1,
      lossPoints: 0,
      tiebreakers: ['points', 'goal_difference', 'goals_for', 'head_to_head'],
      minRestHours: 12,
      matchDurationMinutes: 50,
      maxPlayersOnField: 7,
      yellowCardsSuspensionLimit: 3,
    },
  },
  {
    id: 'sport_basquetbol',
    key: 'basquetbol',
    name: 'Básquetbol',
    engineType: 'basketball',
    periodsCount: 4,
    periodLabel: 'Cuarto',
    allowDraws: false,
    isPrimary: false,
    active: true,
    statSchema: [
      { key: 'pointsScored', label: 'Puntos', unit: 'pts' },
      { key: 'rebounds', label: 'Rebotes', unit: 'reb' },
      { key: 'assists', label: 'Asistencias', unit: 'asist.' },
      { key: 'fouls', label: 'Faltas', unit: 'faltas' },
    ],
    defaultRule: {
      name: 'Reglamento FIBA Base',
      winPoints: 2,
      drawPoints: 0,
      lossPoints: 1,
      tiebreakers: ['points', 'head_to_head', 'goal_difference'],
      minRestHours: 16,
      matchDurationMinutes: 40,
      maxPlayersOnField: 5,
      yellowCardsSuspensionLimit: 5,
    },
  },
  {
    id: 'sport_voleibol',
    key: 'voleibol',
    name: 'Voleibol',
    engineType: 'volleyball',
    periodsCount: 5,
    periodLabel: 'Set',
    allowDraws: false,
    isPrimary: false,
    active: true,
    statSchema: [
      { key: 'setsWon', label: 'Sets Ganados', unit: 'sets' },
      { key: 'aces', label: 'Aces', unit: 'aces' },
      { key: 'blocks', label: 'Bloqueos', unit: 'bloq.' },
    ],
    defaultRule: {
      name: 'Reglamento Voleibol Sets',
      winPoints: 3,
      drawPoints: 0,
      lossPoints: 0,
      tiebreakers: ['points', 'wins', 'goal_difference'],
      minRestHours: 12,
      matchDurationMinutes: 75,
      maxPlayersOnField: 6,
      yellowCardsSuspensionLimit: 2,
    },
  },
  {
    id: 'sport_beisbol',
    key: 'beisbol',
    name: 'Béisbol',
    engineType: 'baseball',
    periodsCount: 9,
    periodLabel: 'Entrada',
    allowDraws: false,
    isPrimary: false,
    active: true,
    statSchema: [
      { key: 'runs', label: 'Carreras', unit: 'C' },
      { key: 'hits', label: 'Hits', unit: 'H' },
      { key: 'errors', label: 'Errores', unit: 'E' },
    ],
    defaultRule: {
      name: 'Reglamento Béisbol Estándar',
      winPoints: 2,
      drawPoints: 0,
      lossPoints: 0,
      tiebreakers: ['wins', 'head_to_head', 'goal_difference'],
      minRestHours: 24,
      matchDurationMinutes: 150,
      maxPlayersOnField: 9,
      yellowCardsSuspensionLimit: 0,
    },
  },
  {
    id: 'sport_softbol',
    key: 'softbol',
    name: 'Softbol',
    engineType: 'baseball',
    periodsCount: 7,
    periodLabel: 'Entrada',
    allowDraws: false,
    isPrimary: false,
    active: true,
    statSchema: [
      { key: 'runs', label: 'Carreras', unit: 'C' },
      { key: 'hits', label: 'Hits', unit: 'H' },
    ],
    defaultRule: {
      name: 'Reglamento Softbol 7 Entradas',
      winPoints: 2,
      drawPoints: 0,
      lossPoints: 0,
      tiebreakers: ['wins', 'goal_difference'],
      minRestHours: 16,
      matchDurationMinutes: 90,
      maxPlayersOnField: 9,
      yellowCardsSuspensionLimit: 0,
    },
  },
  {
    id: 'sport_atletismo',
    key: 'atletismo',
    name: 'Atletismo',
    engineType: 'athletics',
    periodsCount: 1,
    periodLabel: 'Serie',
    allowDraws: false,
    isPrimary: false,
    active: true,
    statSchema: [
      { key: 'timeSeconds', label: 'Marca / Tiempo', unit: 'seg' },
      { key: 'medals', label: 'Podios', unit: 'medallas' },
    ],
    defaultRule: {
      name: 'Reglamento Pista y Campo',
      winPoints: 10,
      drawPoints: 0,
      lossPoints: 0,
      tiebreakers: ['points'],
      minRestHours: 4,
      matchDurationMinutes: 60,
      maxPlayersOnField: 8,
      yellowCardsSuspensionLimit: 0,
    },
  },
  {
    id: 'sport_tenis',
    key: 'tenis',
    name: 'Tenis',
    engineType: 'racquet',
    periodsCount: 3,
    periodLabel: 'Set',
    allowDraws: false,
    isPrimary: false,
    active: true,
    statSchema: [
      { key: 'setsWon', label: 'Sets Ganados', unit: 'sets' },
      { key: 'aces', label: 'Aces', unit: 'aces' },
    ],
    defaultRule: {
      name: 'Reglamento Tenis 3 Sets',
      winPoints: 2,
      drawPoints: 0,
      lossPoints: 0,
      tiebreakers: ['wins', 'head_to_head', 'goal_difference'],
      minRestHours: 16,
      matchDurationMinutes: 120,
      maxPlayersOnField: 2,
      yellowCardsSuspensionLimit: 2,
    },
  },
];

export const TIEBREAKER_LABELS: Record<TiebreakerCriterion, string> = {
  points: 'Puntos totales',
  goal_difference: 'Diferencia de goles (DG)',
  goals_for: 'Goles a favor (GF)',
  head_to_head: 'Resultado directo entre empatados',
  wins: 'Mayor número de victorias',
};
