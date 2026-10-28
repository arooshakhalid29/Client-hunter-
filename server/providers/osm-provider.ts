import { DiscoveryProvider, DiscoveryQuery, RawBusinessRecord } from './types.js';
import { AUSTRALIAN_NICHES, AUSTRALIAN_CITIES } from '../niches.js';

export class OsmOverpassProvider implements DiscoveryProvider {
  name = 'OpenStreetMap Overpass';

  isConfigured(): boolean {
    return true; // Public Australian geographic API, no API key required
  }

  async checkReachable(): Promise<{ reachable: boolean; latencyMs?: number; error?: string }> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      const res = await fetch('https://nominatim.openstreetmap.org/status.php?format=json', {
        signal: controller.signal,
        headers: { 'User-Agent': 'NexamorProspecting/1.0 (waroosh3@gmail.com)' },
      });
      clearTimeout(timer);
      const latencyMs = Date.now() - start;
      return { reachable: res.ok || res.status === 200, latencyMs };
    } catch (err: any) {
      return { reachable: false, error: err?.message || 'Connection timeout or network failure' };
    }
  }

  async search(query: DiscoveryQuery): Promise<{ records: RawBusinessRecord[]; error?: string; queryCount: number }> {
    const limit = query.limit || 20;
    const records: RawBusinessRecord[] = [];
    const seenOsmIds = new Set<string>();
    let queryCount = 0;
    let lastError: string | undefined;

    // Filter niches
    const targetNiches = query.nicheIds.length > 0
      ? AUSTRALIAN_NICHES.filter((n) => query.nicheIds.includes(n.id))
      : AUSTRALIAN_NICHES;

    // Helper to query Nominatim
    const executeQuery = async (searchStr: string, nicheId: string): Promise<number> => {
      queryCount++;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);

        const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
          searchStr
        )}&format=json&countrycodes=au&limit=${Math.min(limit * 2, 20)}&addressdetails=1&extratags=1`;

        const response = await fetch(nominatimUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'NexamorProspecting/1.0 (waroosh3@gmail.com)',
            'Accept-Language': 'en-AU,en;q=0.9',
          },
        });
        clearTimeout(timeout);

        if (!response.ok) return 0;

        const items = (await response.json()) as any[];
        let addedCount = 0;

        for (const item of items) {
          if (records.length >= limit) break;

          const osmKey = `${item.osm_type || 'node'}_${item.osm_id || item.place_id}`;
          if (seenOsmIds.has(osmKey)) continue;

          let name = item.name || item.address?.amenity || item.address?.shop || item.address?.craft;
          if (!name && item.display_name) {
            name = item.display_name.split(',')[0];
          }
          if (!name || name.trim().length < 2) continue;

          const addr = item.address || {};
          const streetNumber = addr.house_number || '';
          const road = addr.road || '';
          const fullStreet = [streetNumber, road].filter(Boolean).join(' ');
          const suburb = addr.suburb || addr.neighbourhood || addr.city_district || query.suburb || null;
          const postcode = addr.postcode || query.postcode || null;
          const address = fullStreet
            ? `${fullStreet}, ${suburb || query.city} ${query.state}`
            : (item.display_name ? item.display_name.split(',').slice(0, 3).join(',') : `${query.city} ${query.state}`);

          const lat = parseFloat(item.lat);
          const lon = parseFloat(item.lon);
          const extraTags = item.extratags || {};

          let phone = extraTags.phone || extraTags['contact:phone'] || extraTags['contact:mobile'] || null;
          let website = extraTags.website || extraTags['contact:website'] || extraTags['contact:url'] || null;
          let email = extraTags.email || extraTags['contact:email'] || null;
          const hours = extraTags.opening_hours || null;

          records.push({
            name: name.trim(),
            nicheId,
            website: website ? website.trim() : null,
            phone: phone ? phone.trim() : null,
            email: email ? email.trim() : null,
            address: address.trim(),
            suburb,
            city: query.city,
            state: query.state,
            postcode,
            bookingUrl: extraTags.appointment || extraTags['contact:appointment'] || null,
            businessHours: hours,
            latitude: isNaN(lat) ? null : lat,
            longitude: isNaN(lon) ? null : lon,
            source: 'OpenStreetMap Live',
            sourceUrl: `https://www.openstreetmap.org/${item.osm_type || 'node'}/${item.osm_id || item.place_id}`,
            rawTags: item,
          });

          seenOsmIds.add(osmKey);
          addedCount++;
        }
        return addedCount;
      } catch (err: any) {
        lastError = err.message || 'OSM search failed';
        return 0;
      }
    };

    // If a specific business name was provided
    if (query.businessName && query.businessName.trim().length > 1) {
      const nameSearchStr = `${query.businessName.trim()} ${query.city} ${query.state} Australia`;
      await executeQuery(nameSearchStr, targetNiches[0]?.id || 'other');
    }

    // Iterate through niches
    for (const niche of targetNiches) {
      if (records.length >= limit) break;

      // Try prioritized keywords for this niche
      // e.g. for emergency plumber, try 'plumber', 'plumbing', 'emergency plumber'
      const searchTermsToTry: string[] = [];

      if (niche.id === 'emergency_plumber') {
        searchTermsToTry.push('plumber', 'plumbing', 'emergency plumber');
      } else if (niche.id === 'general_dentist' || niche.id === 'cosmetic_dentist') {
        searchTermsToTry.push('dental', 'dentist', 'dental clinic');
      } else if (niche.id === 'hair_salon') {
        searchTermsToTry.push('hair salon', 'hairdresser', 'barber');
      } else if (niche.id === 'mechanic') {
        searchTermsToTry.push('mechanic', 'auto repair', 'car service');
      } else {
        searchTermsToTry.push(niche.searchKeywords[0] || niche.name);
        if (niche.searchKeywords[1]) searchTermsToTry.push(niche.searchKeywords[1]);
      }

      for (const keyword of searchTermsToTry) {
        if (records.length >= limit) break;
        const searchStr = `${keyword} ${query.city} ${query.state} Australia`;
        const count = await executeQuery(searchStr, niche.id);
        if (count > 0 && records.length >= limit) break;
      }
    }

    return {
      records,
      queryCount,
      error: records.length === 0 && lastError ? `OpenStreetMap notice: ${lastError}` : undefined,
    };
  }
}
