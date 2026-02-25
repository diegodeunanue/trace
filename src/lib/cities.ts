/**
 * cities.ts
 *
 * Hardcoded list of eligible cities and a bbox-based detection function.
 * The city JSON files (public/cities/{id}.json) are downloaded separately
 * via scripts/download-cities.py.
 */

export interface CityMeta {
  id: string
  name: string
  country: string
  /** [minLng, minLat, maxLng, maxLat] */
  bbox: [number, number, number, number]
}

// Bboxes match actual city administrative limits (not metro areas).
// Must stay in sync with the bboxes in scripts/download-cities.py.
export const CITIES: CityMeta[] = [
  // Ciudad Autónoma de Buenos Aires (bounded by General Paz Ave + Riachuelo)
  { id: 'buenos-aires',  name: 'Buenos Aires',  country: 'Argentina',    bbox: [-58.54, -34.71, -58.34, -34.52] },
  // Ciudad de México (CDMX — 16 alcaldías)
  { id: 'mexico-city',   name: 'Mexico City',   country: 'Mexico',       bbox: [-99.37,  19.19, -99.00,  19.59] },
  // New York City (5 boroughs)
  { id: 'new-york',      name: 'New York',      country: 'USA',          bbox: [-74.26,  40.49, -73.70,  40.92] },
  // City of Los Angeles (not LA County)
  { id: 'los-angeles',   name: 'Los Angeles',   country: 'USA',          bbox: [-118.67, 33.90, -118.13, 34.34] },
  // City of Chicago
  { id: 'chicago',       name: 'Chicago',       country: 'USA',          bbox: [-87.94,  41.64, -87.52,  42.03] },
  // City and County of San Francisco
  { id: 'san-francisco', name: 'San Francisco', country: 'USA',          bbox: [-122.52, 37.70, -122.35, 37.83] },
  // Amalgamated City of Toronto
  { id: 'toronto',       name: 'Toronto',       country: 'Canada',       bbox: [-79.64,  43.58, -79.12,  43.86] },
  // Greater London (32 boroughs + City)
  { id: 'london',        name: 'London',        country: 'UK',           bbox: [-0.51,   51.28,   0.33,  51.69] },
  // Paris intramuros (20 arrondissements)
  { id: 'paris',         name: 'Paris',         country: 'France',       bbox: [2.22,    48.81,   2.42,  48.91] },
  // Berlin (city-state, 12 Bezirke)
  { id: 'berlin',        name: 'Berlin',        country: 'Germany',      bbox: [13.09,   52.34,  13.76,  52.68] },
  // Madrid municipality
  { id: 'madrid',        name: 'Madrid',        country: 'Spain',        bbox: [-3.89,   40.29,  -3.52,  40.65] },
  // Barcelona municipality
  { id: 'barcelona',     name: 'Barcelona',     country: 'Spain',        bbox: [2.07,    41.32,   2.23,  41.47] },
  // Rome (central + inner ring — Comune di Roma is too large at 1285 km²)
  { id: 'rome',          name: 'Rome',          country: 'Italy',        bbox: [12.35,   41.80,  12.60,  41.98] },
  // Amsterdam municipality
  { id: 'amsterdam',     name: 'Amsterdam',     country: 'Netherlands',  bbox: [4.75,    52.28,   5.08,  52.48] },
  // Municipality of São Paulo
  { id: 'sao-paulo',     name: 'São Paulo',     country: 'Brazil',       bbox: [-46.83, -23.72, -46.37, -23.41] },
  // Tokyo 23 Special Wards (not Tokyo Metropolis)
  { id: 'tokyo',         name: 'Tokyo',         country: 'Japan',        bbox: [139.59,  35.52, 139.93,  35.82] },
  // Seoul Special Metropolitan City
  { id: 'seoul',         name: 'Seoul',         country: 'South Korea',  bbox: [126.76,  37.42, 127.18,  37.70] },
  // Inner Sydney (City of Sydney LGA + surrounding inner suburbs)
  { id: 'sydney',        name: 'Sydney',        country: 'Australia',    bbox: [150.95, -33.95, 151.35, -33.75] },
  // Republic of Singapore (island)
  { id: 'singapore',     name: 'Singapore',     country: 'Singapore',    bbox: [103.63,   1.14, 104.01,   1.47] },
  // Dubai city (not the full emirate / desert hinterland)
  { id: 'dubai',         name: 'Dubai',         country: 'UAE',          bbox: [55.10,   25.03,  55.45,  25.35] },
]

/**
 * Returns all cities whose bbox contains the center of the given trace bbox.
 */
export function detectCities(traceBbox: [number, number, number, number]): CityMeta[] {
  const cx = (traceBbox[0] + traceBbox[2]) / 2
  const cy = (traceBbox[1] + traceBbox[3]) / 2
  return CITIES.filter(c =>
    cx >= c.bbox[0] && cx <= c.bbox[2] &&
    cy >= c.bbox[1] && cy <= c.bbox[3],
  )
}
