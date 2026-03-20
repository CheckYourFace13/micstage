import { Weekday } from "@/generated/prisma/enums";

export function weekdayToLabel(d: Weekday): string {
  switch (d) {
    case "MON":
      return "Monday";
    case "TUE":
      return "Tuesday";
    case "WED":
      return "Wednesday";
    case "THU":
      return "Thursday";
    case "FRI":
      return "Friday";
    case "SAT":
      return "Saturday";
    case "SUN":
      return "Sunday";
  }
}

export function minutesToTimeLabel(mins: number): string {
  const m = ((mins % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mm.toString().padStart(2, "0")} ${ampm}`;
}

export function toIsoDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

