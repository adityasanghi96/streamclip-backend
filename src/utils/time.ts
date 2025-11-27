export function isOlderThan(date: Date, hours: number): boolean {
    return (new Date().getTime() - new Date(date).getTime()) > hours * 60 * 60 * 1000;
  }
  