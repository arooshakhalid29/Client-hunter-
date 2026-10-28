import { DiscoveryProvider, DiscoveryQuery, RawBusinessRecord } from './types.js';
import { AUSTRALIAN_NICHES } from '../niches.js';
import { db } from '../db.js';

export class GooglePlacesProvider implements DiscoveryProvider {
  name = 'Google Places API';

  private getApiKey(): string | null {
    if (process.env.GOOGLE_PLACES_API_KEY) {
      return process.env.GOOGLE_PLACES_API_KEY;
    }
    try {
      const row = db.prepare('SELECT value FROM provider_settings WHERE key = ?').get('google_places_api_key') as { value: string } | undefined;
      return row?.value || null;
    } catch {
      return null;
    }
  }

  isConfigured(): boolean {
    return Boolean(this.getApiKey());
  }

  async checkReachable(): Promise<{ reachable: boolean; latencyMs?: number; error?: string }> {
    const key = this.getApiKey();
    if (!key) {
      return { reachable: false, error: 'Google Places API key is not configured in Settings or environment' };
    }
    const start = Date.now();
    try {
      const res = await fetch(`https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=Sydney&inputtype=textquery&fields=place_id&key=${key}`);
      const latencyMs = Date.now() - start;
      const json = await res.json();
      if (json.status === 'OK' || json.status === 'ZERO_RESULTS') {
        return { reachable: true, latencyMs };
      }
      return { reachable: false, error: json.error_message || json.status };
    } catch (err: any) {
      return { reachable: false, error: err?.message || 'Google Places network error' };
    }
  }

  async search(query: DiscoveryQuery): Promise<{ records: RawBusinessRecord[]; error?: string; queryCount: number }> {
    const key = this.getApiKey();
    if (!key) {
      return {
        records: [],
        queryCount: 0,
        error: 'Google Places API key is not configured. Configure it in Settings to enable Google Places discovery.',
      };
    }

    const records: RawBusinessRecord[] = [];
    let queryCount = 0;
    const targetNiches = query.nicheIds.length > 0
      ? AUSTRALIAN_NICHES.filter((n) => query.nicheIds.includes(n.id))
      : AUSTRALIAN_NICHES;

    const limit = query.limit || 20;

    for (const niche of targetNiches) {
      if (records.length >= limit) break;

      const keyword = niche.searchKeywords[0] || niche.name;
      const locationStr = [query.suburb, query.city, query.state, 'Australia'].filter(Boolean).join(' ');
      const searchQuery = `${keyword} in ${locationStr}`;

      queryCount++;
      try {
        const textSearchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&key=${key}`;
        const res = await fetch(textSearchUrl);
        const data = await res.json();

        if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
          return { records, queryCount, error: data.error_message || `Google Places status: ${data.status}` };
        }

        const results = data.results || [];
        for (const place of results) {
          if (records.length >= limit) break;
          const name = place.name;
          const address = place.formatted_address;
          const lat = place.geometry?.location?.lat ?? null;
          const lon = place.geometry?.location?.lng ?? null;

          // Fetch Place Details for website and phone
          let website: string | null = null;
          let phone: string | null = null;
          let openingHours: string | null = null;

          if (place.place_id) {
            try {
              const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_phone_number,international_phone_number,website,opening_hours&key=${key}`;
              const detailRes = await fetch(detailsUrl);
              const detailData = await detailRes.json();
              if (detailData.status === 'OK' && detailData.result) {
                website = detailData.result.website || null;
                phone = detailData.result.formatted_phone_number || detailData.result.international_phone_number || null;
                if (detailData.result.opening_hours?.weekday_text) {
                  openingHours = detailData.result.opening_hours.weekday_text.join('; ');
                }
              }
            } catch {
              // Ignore details fetch error and retain place
            }
          }

          records.push({
            name,
            nicheId: niche.id,
            website,
            phone,
            email: null,
            address,
            suburb: query.suburb || null,
            city: query.city,
            state: query.state,
            postcode: query.postcode || null,
            bookingUrl: null,
            businessHours: openingHours,
            latitude: lat,
            longitude: lon,
            source: 'Google Places API',
            sourceUrl: place.place_id ? `https://www.google.com/maps/place/?q=place_id:${place.place_id}` : null,
            rawTags: { rating: place.rating, user_ratings_total: place.user_ratings_total },
          });
        }
      } catch (err: any) {
        return { records, queryCount, error: err.message || 'Google Places fetch failure' };
      }
    }

    return { records, queryCount };
  }
}
