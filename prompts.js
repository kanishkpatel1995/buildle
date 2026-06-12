// prompts.js — the 60 daily prompts + date logic (CONTRACT §2).
// Prompt index uses unix-epoch UTC days; the display number counts from the
// Buildle epoch so "day 162" reads nicely. Both UTC, so the world flips together.

export const BUILDLE_EPOCH_UTC = Date.UTC(2026, 0, 1);

const MS_PER_DAY = 86400000;

export const PROMPTS = [
  'build something cozy',
  'build your breakfast',
  'build a creature from your dreams',
  'build a lighthouse',
  'build a bridge to nowhere',
  'build a place to nap',
  'build something that glows',
  'build a tiny home for a tiny friend',
  'build a fountain',
  'build a giant mushroom',
  'build a boat that will never sail',
  'build a staircase to the clouds',
  'build your happy place',
  'build a windmill',
  'build a guardian for the plaza',
  'build something upside down',
  'build a hot air balloon',
  'build a creature with too many legs',
  'build a treehouse without the tree',
  'build a monument to a small victory',
  'build a campfire and somewhere to sit',
  'build a door to another world',
  'build a whale',
  'build a garden gone wild',
  'build something symmetrical',
  'build a throne for a duck',
  'build a waterfall',
  'build a ruin from a forgotten kingdom',
  'build a vehicle with no wheels',
  'build something soft',
  'build a telescope pointed at nothing',
  'build the moon a friend',
  'build a maze',
  'build your favorite weather',
  'build a chair for a giant',
  'build something that grows',
  'build a machine that does nothing',
  'build a constellation you can touch',
  'build a picnic',
  'build a dragon, or at least its tail',
  'build a home for the wind',
  'build something broken but beautiful',
  'build a swing between two towers',
  'build a trap for a cloud',
  'build a cat',
  'build a giant teapot',
  'build a place you have never been',
  'build something that comes in pairs',
  'build a robot learning to dance',
  'build an island for one',
  'build a gift for a stranger',
  'build a rainbow out of blocks',
  'build a well that grants wishes',
  'build something the size of a whisper',
  'build a face',
  'build a sandcastle far from any sea',
  'build a flower taller than a house',
  'build the best part of your day',
  'build a bench for watching sunsets',
  'build something you would never tear down',
];

// UTC midnight of the given date's UTC calendar day.
function utcDayStart(date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function getDayNumber(date = new Date()) {
  return Math.floor((utcDayStart(date) - BUILDLE_EPOCH_UTC) / MS_PER_DAY) + 1;
}

export function getPrompt(date = new Date()) {
  const daysSinceUnixEpoch = Math.floor(utcDayStart(date) / MS_PER_DAY);
  return PROMPTS[daysSinceUnixEpoch % PROMPTS.length];
}

export function getToday() {
  const now = new Date();
  return { day: getDayNumber(now), prompt: getPrompt(now) };
}
