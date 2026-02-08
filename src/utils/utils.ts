export function toISO(unixSec: number) {
  new Date(unixSec * 1000).toISOString();
}
