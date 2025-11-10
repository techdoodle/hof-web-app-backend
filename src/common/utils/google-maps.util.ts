/**
 * Utility functions for parsing Google Maps URLs and extracting coordinates
 */
import * as https from 'https';
import * as http from 'http';
import { Logger } from '@nestjs/common';

const logger = new Logger('GoogleMapsParser');

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
/**
 * Follow redirects for shortened Google Maps URLs (e.g., maps.app.goo.gl).
 * Returns the final resolved URL or null on failure.
 */
async function resolveShortenedUrl(url: string, maxRedirects: number = 5): Promise<string | null> {
  if (maxRedirects <= 0) {
    logger.warn(`[resolveShortenedUrl] Max redirects reached for URL: ${url}`);
    return null;
  }

  let urlObj: URL;
  try {
    urlObj = new URL(url);
  } catch {
    logger.warn(`[resolveShortenedUrl] Invalid URL format: ${url}`);
    return null;
  }

  const hostname = urlObj.hostname;
  const isShortened = ['maps.app.goo.gl', 'goo.gl'].some(d => hostname.includes(d));
  if (!isShortened) {
    logger.log(`[resolveShortenedUrl] Not a shortened URL, returning as-is: ${url}`);
    return url; // not shortened, return as-is
  }

  logger.log(`[resolveShortenedUrl] Resolving shortened URL: ${url} (remaining redirects: ${maxRedirects})`);

  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GoogleMapsParser/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    }, (res) => {
      logger.log(`[resolveShortenedUrl] Response status: ${res.statusCode} for URL: ${url}`);
      
      // Handle redirect status codes
      if ([301, 302, 307, 308].includes(res.statusCode || 0)) {
        const location = res.headers.location;
        if (location) {
          let nextUrl = location;
          try {
            nextUrl = location.startsWith('http') ? location : new URL(location, url).toString();
            logger.log(`[resolveShortenedUrl] Redirect (${res.statusCode}) to: ${nextUrl}`);
          } catch {
            logger.warn(`[resolveShortenedUrl] Failed to resolve redirect location: ${location}`);
            resolve(null);
            return;
          }
          resolve(resolveShortenedUrl(nextUrl, maxRedirects - 1));
          return;
        }
      }

      // 200 OK - attempt to discover client-side redirects (best-effort)
      if (res.statusCode === 200) {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk.toString();
          if (body.length > 50000) {
            res.destroy();
            resolve(url);
          }
        });
        res.on('end', () => {
          const metaRefreshMatch = body.match(/<meta[^>]*http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^"']+)["']/i);
          if (metaRefreshMatch && metaRefreshMatch[1]) {
            const redirectUrl = metaRefreshMatch[1].trim();
            try {
              const resolvedUrl = redirectUrl.startsWith('http') ? redirectUrl : new URL(redirectUrl, url).toString();
              resolve(resolveShortenedUrl(resolvedUrl, maxRedirects - 1));
              return;
            } catch {
              // fall through
            }
          }
          const jsLocationMatch = body.match(/window\.location\s*=\s*["']([^"']+)["']/i);
          if (jsLocationMatch && jsLocationMatch[1]) {
            const redirectUrl = jsLocationMatch[1].trim();
            try {
              const resolvedUrl = redirectUrl.startsWith('http') ? redirectUrl : new URL(redirectUrl, url).toString();
              resolve(resolveShortenedUrl(resolvedUrl, maxRedirects - 1));
              return;
            } catch {
              // fall through
            }
          }
          resolve(url);
        });
        res.on('error', () => resolve(url));
        return;
      }

      // Non-redirect non-200: return original
      resolve(url);
    });

    req.on('error', (error) => {
      logger.error(`[resolveShortenedUrl] Request error for URL: ${url}`, error);
      resolve(null);
    });
    req.setTimeout(5000, () => {
      logger.warn(`[resolveShortenedUrl] Request timeout for URL: ${url}`);
      req.destroy();
      resolve(null);
    });
  });
}

export async function parseGoogleMapsUrl(input: string): Promise<Coordinates | null> {
  logger.log(`[parseGoogleMapsUrl] Starting parse for input: ${input}`);
  
  if (!input || typeof input !== 'string') {
    logger.warn(`[parseGoogleMapsUrl] Invalid input (null/undefined/not string): ${input}`);
    return null;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    logger.warn(`[parseGoogleMapsUrl] Empty input after trim`);
    return null;
  }

  // Try to parse direct lat,lng format first (e.g., "28.6139,77.2090")
  const directMatch = trimmed.match(/^(-?\d+\.?\d*),(-?\d+\.?\d*)$/);
  if (directMatch) {
    const lat = parseFloat(directMatch[1]);
    const lng = parseFloat(directMatch[2]);
    if (isValidCoordinate(lat, lng)) {
      logger.log(`[parseGoogleMapsUrl] Successfully parsed direct coordinates: ${lat}, ${lng}`);
      return { latitude: lat, longitude: lng };
    }
  }

  // Check if it's a URL
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    logger.warn(`[parseGoogleMapsUrl] Input is not a URL: ${trimmed}`);
    return null;
  }

  try {
    // Resolve shortened URLs first (best-effort)
    let toParse = trimmed;
    logger.log(`[parseGoogleMapsUrl] Attempting to resolve shortened URL: ${trimmed}`);
    const resolved = await resolveShortenedUrl(trimmed);
    if (resolved && resolved !== trimmed) {
      toParse = resolved;
      logger.log(`[parseGoogleMapsUrl] Resolved URL: ${toParse}`);
    } else if (resolved === trimmed) {
      logger.log(`[parseGoogleMapsUrl] URL is not shortened or already resolved: ${trimmed}`);
    } else {
      logger.warn(`[parseGoogleMapsUrl] Failed to resolve shortened URL, attempting to parse original: ${trimmed}`);
    }

    const url = new URL(toParse);
    logger.log(`[parseGoogleMapsUrl] Parsing URL: ${toParse}`);

    // Format 1: https://www.google.com/maps?q=lat,lng
    const qParam = url.searchParams.get('q');
    if (qParam) {
      logger.log(`[parseGoogleMapsUrl] Found 'q' parameter: ${qParam}`);
      const coords = parseCoordinatesFromString(qParam);
      if (coords) {
        logger.log(`[parseGoogleMapsUrl] Successfully parsed from 'q' parameter: ${coords.latitude}, ${coords.longitude}`);
        return coords;
      }
    }

    // Format 2: https://www.google.com/maps/@lat,lng,zoom
    const pathMatch = url.pathname.match(/^\/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (pathMatch) {
      logger.log(`[parseGoogleMapsUrl] Found path match: ${pathMatch[1]}, ${pathMatch[2]}`);
      const lat = parseFloat(pathMatch[1]);
      const lng = parseFloat(pathMatch[2]);
      if (isValidCoordinate(lat, lng)) {
        logger.log(`[parseGoogleMapsUrl] Successfully parsed from path: ${lat}, ${lng}`);
        return { latitude: lat, longitude: lng };
      }
    }

    // Format 3: https://www.google.com/maps/place/.../@lat,lng,zoom
    const placeMatch = url.pathname.match(/\/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (placeMatch) {
      logger.log(`[parseGoogleMapsUrl] Found place match: ${placeMatch[1]}, ${placeMatch[2]}`);
      const lat = parseFloat(placeMatch[1]);
      const lng = parseFloat(placeMatch[2]);
      if (isValidCoordinate(lat, lng)) {
        logger.log(`[parseGoogleMapsUrl] Successfully parsed from place path: ${lat}, ${lng}`);
        return { latitude: lat, longitude: lng };
      }
    }

    // Format 4: https://www.google.com/maps/search/?api=1&query=lat,lng
    const queryParam = url.searchParams.get('query');
    if (queryParam) {
      logger.log(`[parseGoogleMapsUrl] Found 'query' parameter: ${queryParam}`);
      const coords = parseCoordinatesFromString(queryParam);
      if (coords) {
        logger.log(`[parseGoogleMapsUrl] Successfully parsed from 'query' parameter: ${coords.latitude}, ${coords.longitude}`);
        return coords;
      }
    }

    // Format 5: Check for coordinates in the hash fragment
    if (url.hash) {
      logger.log(`[parseGoogleMapsUrl] Checking hash fragment: ${url.hash}`);
      const hashMatch = url.hash.match(/(-?\d+\.?\d*),(-?\d+\.?\d*)/);
      if (hashMatch) {
        logger.log(`[parseGoogleMapsUrl] Found hash match: ${hashMatch[1]}, ${hashMatch[2]}`);
        const lat = parseFloat(hashMatch[1]);
        const lng = parseFloat(hashMatch[2]);
        if (isValidCoordinate(lat, lng)) {
          logger.log(`[parseGoogleMapsUrl] Successfully parsed from hash: ${lat}, ${lng}`);
          return { latitude: lat, longitude: lng };
        }
      }
    }
    
    logger.warn(`[parseGoogleMapsUrl] Failed to extract coordinates from URL: ${toParse}`);
  } catch (error) {
    logger.error(`[parseGoogleMapsUrl] Error parsing URL: ${input}`, error);
    return null;
  }

  logger.warn(`[parseGoogleMapsUrl] No coordinates found in input: ${input}`);
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

