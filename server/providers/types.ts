import { AustralianState, SocialProfile } from '../types.js';

export interface DiscoveryQuery {
  nicheIds: string[];
  businessName?: string;
  state: AustralianState;
  city: string;
  suburb?: string;
  postcode?: string;
  radiusKm?: number;
  limit?: number;
  minScore?: number;
  requireWebsite?: boolean;
  requirePhone?: boolean;
  requireEmail?: boolean;
  excludeSaved?: boolean;
}

export interface RawBusinessRecord {
  name: string;
  nicheId: string;
  website: string | null;
  phone: string | null;
  email: string | null;
  contactPageUrl?: string | null;
  socialProfiles?: SocialProfile[];
  address: string | null;
  suburb: string | null;
  city: string;
  state: AustralianState;
  postcode: string | null;
  bookingUrl: string | null;
  businessHours: string | null;
  latitude: number | null;
  longitude: number | null;
  source: string;
  sourceUrl: string | null;
  rawTags?: Record<string, any>;
}

export interface DiscoveryProvider {
  name: string;
  isConfigured(): Promise<boolean> | boolean;
  checkReachable(): Promise<{ reachable: boolean; latencyMs?: number; error?: string }>;
  search(query: DiscoveryQuery): Promise<{ records: RawBusinessRecord[]; error?: string; queryCount: number }>;
}
