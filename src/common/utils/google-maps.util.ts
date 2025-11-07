/**
 * Utility functions for parsing Google Maps URLs and extracting coordinates
 */

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Parses various Google Maps URL formats and extracts latitude and longitude
 * Supports:
 * - https://www.google.com/maps?q=lat,lng
 * - https://www.google.com/maps/@lat,lng,zoom
 * - https://maps.google.com/?q=lat,lng
 * - https://www.google.com/maps/place/.../@lat,lng,zoom
 * - https://www.google.com/maps/search/?api=1&query=lat,lng
 * - Direct lat,lng string
 * 
 * @param input - Google Maps URL or lat,lng string
 * @returns Coordinates object with latitude and longitude, or null if parsing fails
 */
export function parseGoogleMapsUrl(input: string): Coordinates | null {
  if (!input || typeof input !== 'string') {
    return null;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  // Try to parse direct lat,lng format first (e.g., "28.6139,77.2090")
  const directMatch = trimmed.match(/^(-?\d+\.?\d*),(-?\d+\.?\d*)$/);
  if (directMatch) {
    const lat = parseFloat(directMatch[1]);
    const lng = parseFloat(directMatch[2]);
    if (isValidCoordinate(lat, lng)) {
      return { latitude: lat, longitude: lng };
    }
  }

  // Check if it's a URL
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return null;
  }

  try {
    const url = new URL(trimmed);

    // Format 1: https://www.google.com/maps?q=lat,lng
    const qParam = url.searchParams.get('q');
    if (qParam) {
      const coords = parseCoordinatesFromString(qParam);
      if (coords) {
        return coords;
      }
    }

    // Format 2: https://www.google.com/maps/@lat,lng,zoom
    const pathMatch = url.pathname.match(/^\/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (pathMatch) {
      const lat = parseFloat(pathMatch[1]);
      const lng = parseFloat(pathMatch[2]);
      if (isValidCoordinate(lat, lng)) {
        return { latitude: lat, longitude: lng };
      }
    }

    // Format 3: https://www.google.com/maps/place/.../@lat,lng,zoom
    const placeMatch = url.pathname.match(/\/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (placeMatch) {
      const lat = parseFloat(placeMatch[1]);
      const lng = parseFloat(placeMatch[2]);
      if (isValidCoordinate(lat, lng)) {
        return { latitude: lat, longitude: lng };
      }
    }

    // Format 4: https://www.google.com/maps/search/?api=1&query=lat,lng
    const queryParam = url.searchParams.get('query');
    if (queryParam) {
      const coords = parseCoordinatesFromString(queryParam);
      if (coords) {
        return coords;
      }
    }

    // Format 5: Check for coordinates in the hash fragment
    if (url.hash) {
      const hashMatch = url.hash.match(/(-?\d+\.?\d*),(-?\d+\.?\d*)/);
      if (hashMatch) {
        const lat = parseFloat(hashMatch[1]);
        const lng = parseFloat(hashMatch[2]);
        if (isValidCoordinate(lat, lng)) {
          return { latitude: lat, longitude: lng };
        }
      }
    }
  } catch (error) {
    // Invalid URL format
    return null;
  }

  return null;
}

/**
 * Parses a string that might contain coordinates (e.g., "28.6139,77.2090" or "28.6139, 77.2090")
 */
function parseCoordinatesFromString(str: string): Coordinates | null {
  const match = str.match(/(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/);
  if (match) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    if (isValidCoordinate(lat, lng)) {
      return { latitude: lat, longitude: lng };
    }
  }
  return null;
}

/**
 * Validates if the coordinates are within valid ranges
 */
function isValidCoordinate(latitude: number, longitude: number): boolean {
  return (
    !isNaN(latitude) &&
    !isNaN(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

