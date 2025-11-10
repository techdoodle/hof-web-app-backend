const https = require('https');
const http = require('http');

const url = process.argv[2];

function resolveShortenedUrl(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      reject(new Error('Max redirects reached'));
      return;
    }

    const client = url.startsWith('https') ? https : http;
    const request = client.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    }, (response) => {
      if ([301,302,307,308].includes(response.statusCode)) {
        const location = response.headers.location;
        if (location) {
          const resolvedUrl = location.startsWith('http') ? location : new URL(location, url).toString();
          resolve(resolveShortenedUrl(resolvedUrl, maxRedirects - 1));
          return;
        }
      }

      if (response.statusCode === 200) {
        let body = '';
        response.on('data', (chunk) => {
          body += chunk.toString();
          if (body.length > 50000) {
            response.destroy();
            resolve(url);
          }
        });

        response.on('end', () => {
          const metaRefreshMatch = body.match(/<meta[^>]*http-equiv=["']refresh["'][^>]*content=["'][^"]*url=([^"']+)["']/i);
          if (metaRefreshMatch && metaRefreshMatch[1]) {
            const redirectUrl = metaRefreshMatch[1].trim();
            const resolvedUrl = redirectUrl.startsWith('http') ? redirectUrl : new URL(redirectUrl, url).toString();
            resolve(resolveShortenedUrl(resolvedUrl, maxRedirects - 1));
            return;
          }
          const jsLocationMatch = body.match(/window\.location\s*=\s*["']([^"']+)["']/i);
          if (jsLocationMatch && jsLocationMatch[1]) {
            const redirectUrl = jsLocationMatch[1].trim();
            const resolvedUrl = redirectUrl.startsWith('http') ? redirectUrl : new URL(redirectUrl, url).toString();
            resolve(resolveShortenedUrl(resolvedUrl, maxRedirects - 1));
            return;
          }
          resolve(url);
        });

        response.on('error', (error) => reject(error));
      } else {
        resolve(url);
      }
    });

    request.on('error', (error) => reject(error));

    request.setTimeout(10000, () => {
      request.destroy();
      reject(new Error('Request timeout'));
    });

    request.end();
  });
}

function parseGoogleMapsUrl(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const directMatch = trimmed.match(/^(-?\d+\.?\d*),(-?\d+\.?\d*)$/);
  if (directMatch) {
    const lat = parseFloat(directMatch[1]);
    const lng = parseFloat(directMatch[2]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { latitude: lat, longitude: lng };
    }
  }

  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return null;

  try {
    const urlObj = new URL(trimmed);

    const qParam = urlObj.searchParams.get('q');
    if (qParam) {
      const match = qParam.match(/(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/);
      if (match) {
        const lat = parseFloat(match[1]);
        const lng = parseFloat(match[2]);
        if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          return { latitude: lat, longitude: lng };
        }
      }
    }

    const pathMatch = urlObj.pathname.match(/\/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (pathMatch) {
      const lat = parseFloat(pathMatch[1]);
      const lng = parseFloat(pathMatch[2]);
      if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { latitude: lat, longitude: lng };
      }
    }

    const queryParam = urlObj.searchParams.get('query');
    if (queryParam) {
      const match = queryParam.match(/(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/);
      if (match) {
        const lat = parseFloat(match[1]);
        const lng = parseFloat(match[2]);
        if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          return { latitude: lat, longitude: lng };
        }
      }
    }

    if (urlObj.hash) {
      const hashMatch = urlObj.hash.match(/(-?\d+\.?\d*),(-?\d+\.?\d*)/);
      if (hashMatch) {
        const lat = parseFloat(hashMatch[1]);
        const lng = parseFloat(hashMatch[2]);
        if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          return { latitude: lat, longitude: lng };
        }
      }
    }
  } catch (e) {
    return null;
  }
  return null;
}

(async () => {
  try {
    const resolvedUrl = await resolveShortenedUrl(url);
    const coords = parseGoogleMapsUrl(resolvedUrl);
    console.log(JSON.stringify({ resolvedUrl, coords }, null, 2));
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
