import { ptWallClockToUtc } from "../recurring";
export const PACIFIC = "America/Los_Angeles";
export function pacificDate(date: Date): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {timeZone:PACIFIC,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date).map(p=>[p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function addCalendarDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate()+days);
  return value.toISOString().slice(0,10);
}
export function pacificWeek(now: Date) {
  const today = pacificDate(now);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const startDate = addCalendarDays(today,-weekday);
  return {today,weekday,startDate,start:ptWallClockToUtc(startDate,"00:00"),end:ptWallClockToUtc(addCalendarDays(startDate,7),"00:00")};
}
export function sessionDayLabel(date: Date, now = new Date()): string {
  const today = pacificDate(now), day = pacificDate(date);
  if(day===today)return "Today";
  if(day===addCalendarDays(today,1))return "Tomorrow";
  return date.toLocaleDateString("en-US",{timeZone:PACIFIC,weekday:"short",month:"short",day:"numeric"});
}
