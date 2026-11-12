/** The three figures shown in the hero, all counted from the content file. */
import { site } from './site';

const years = new Date().getFullYear() - site.hero.since;
const stations = site.experience.stations.filter(
  (station) => station.organisation !== 'Robert-Bosch-Berufskolleg',
).length;
const technologies = site.experience.skills
  .filter((group) => group.label !== 'Arbeitsweise')
  .reduce((sum, group) => sum + group.items.length, 0);

export const stats = [
  { value: years, unit: 'J', label: 'Im Beruf' },
  { value: stations, unit: '', label: 'Stationen' },
  { value: technologies, unit: '', label: 'Technologien' },
];
