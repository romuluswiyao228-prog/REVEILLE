import type { Difficulty, Exercise, Sensitivity } from "./repCounter";

export type Lang = "fr" | "en" | "ar";
export type Theme = "dark" | "light";
export type SoundId = "sunrise" | "pulse" | "digital" | "siren" | "beacon";

export interface Alarm {
  id: string;
  time: string; // "HH:MM"
  days: number[]; // 0 = dimanche … 6 = samedi ; [] = une seule fois
  label: string;
  sound: SoundId;
  volume: number; // 0..1
  exercise: Exercise;
  reps: number; // 5..50
  difficulty: Difficulty;
  enabled: boolean;
}

export interface HistoryEntry {
  id: string;
  ts: number; // timestamp ms
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  exercise: Exercise;
  reps: number; // répétitions réalisées
  target: number;
  success: boolean;
  method: "camera" | "manual" | "postponed";
  durationSec: number;
}

export interface Settings {
  lang: Lang;
  theme: Theme;
  volume: number;
  sound: SoundId;
  sensitivity: Sensitivity;
  strict: boolean;
  allowSquats: boolean;
  premium: boolean;
  onboarded: boolean;
  cameraGranted: boolean;
  // Limites quotidiennes (date du dernier usage)
  emergencySnoozeDate: string;
  problemDate: string;
  manualDate: string;
}

export interface Postponed {
  alarmId: string;
  at: number; // ts de la nouvelle sonnerie
  kind: "snooze" | "problem";
}
