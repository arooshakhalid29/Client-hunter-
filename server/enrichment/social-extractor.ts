import { SocialProfile, SocialPlatform } from '../types.js';

interface RawSocialMatch {
  platform: SocialPlatform;
  url: string;
  handle: string | null;
  source: string;
  confidence: 'High' | 'Medium' | 'Low';
}

function cleanHandle(raw: string): string {
  return raw.replace(/^@/, '').trim();
}

function normalizeUrl(rawUrl: string): string {
  try {
    let clean = rawUrl.trim();
    if (clean.startsWith('//')) clean = 'https:' + clean;
    const parsed = new URL(clean);
    // Remove query parameters and trailing slashes for standard social profile comparison
    parsed.search = '';
    parsed.hash = '';
    let pathname = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.protocol}//${parsed.hostname}${pathname}`;
  } catch {
    return rawUrl.trim().replace(/\/+$/, '');
  }
}

export function extractSocialProfiles(html: string, siteUrl?: string): SocialProfile[] {
  const matches = new Map<SocialPlatform, RawSocialMatch>();
  const now = new Date().toISOString();

  // 1. JSON-LD structured data extraction (sameAs)
  try {
    const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = jsonLdRegex.exec(html)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of items) {
          const sameAs = item.sameAs || item['@graph']?.flatMap((g: any) => g.sameAs || []);
          if (sameAs) {
            const urls = Array.isArray(sameAs) ? sameAs : [sameAs];
            for (const u of urls) {
              if (typeof u === 'string') {
                categorizeUrl(u, 'json_ld_schema', 'High', matches);
              }
            }
          }
        }
      } catch {
        // Continue even if one json-ld block is invalid
      }
    }
  } catch {
    // Ignore JSON-LD errors
  }

  // 2. OpenGraph and Twitter Meta Tags
  try {
    const twitterSiteMatch = html.match(/<meta[^>]*name=["']twitter:site["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:site["']/i);
    if (twitterSiteMatch && twitterSiteMatch[1]) {
      const handle = cleanHandle(twitterSiteMatch[1]);
      if (handle && !matches.has('x')) {
        matches.set('x', {
          platform: 'x',
          url: `https://x.com/${handle}`,
          handle: `@${handle}`,
          source: 'meta_tag_twitter_site',
          confidence: 'High',
        });
      }
    }
  } catch {
    // Ignore meta tag errors
  }

  // 3. Anchor tags (<a href="...">)
  try {
    const linkRegex = /<a\s+(?:[^>]*?\s+)?href=["']([^"']+)["'][^>]*>/gi;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      const rawHref = match[1];
      if (rawHref && rawHref.startsWith('http')) {
        categorizeUrl(rawHref, 'official_website_link', 'High', matches);
      }
    }
  } catch {
    // Ignore regex errors
  }

  // Build the complete array for all supported platforms
  const supportedPlatforms: SocialPlatform[] = [
    'instagram',
    'facebook',
    'linkedin',
    'tiktok',
    'youtube',
    'pinterest',
    'x',
  ];

  const results: SocialProfile[] = supportedPlatforms.map((platform) => {
    const found = matches.get(platform);
    if (found) {
      return {
        platform,
        url: found.url,
        handle: found.handle,
        status: 'verified',
        confidence: found.confidence,
        source: found.source,
        lastChecked: now,
      };
    } else {
      return {
        platform,
        url: '',
        handle: null,
        status: 'unavailable',
        confidence: 'Low',
        source: 'not_detected_on_website',
        lastChecked: now,
      };
    }
  });

  return results;
}

function categorizeUrl(
  rawUrl: string,
  source: string,
  confidence: 'High' | 'Medium' | 'Low',
  outMap: Map<SocialPlatform, RawSocialMatch>
) {
  const norm = normalizeUrl(rawUrl);
  const lower = norm.toLowerCase();

  // A. Instagram
  if (lower.includes('instagram.com/')) {
    if (!outMap.has('instagram')) {
      const parts = norm.split('instagram.com/');
      if (parts[1]) {
        const slug = parts[1].split('/')[0].split('?')[0].trim();
        const invalidSlugs = ['p', 'reel', 'reels', 'explore', 'stories', 'tv', 'about', 'developer', 'legal'];
        if (slug && !invalidSlugs.includes(slug.toLowerCase())) {
          outMap.set('instagram', {
            platform: 'instagram',
            url: `https://www.instagram.com/${slug}`,
            handle: `@${slug}`,
            source,
            confidence,
          });
        }
      }
    }
    return;
  }

  // B. Facebook
  if (lower.includes('facebook.com/') || lower.includes('fb.com/')) {
    if (!outMap.has('facebook')) {
      const parts = norm.split(/facebook\.com\/|fb\.com\//);
      if (parts[1]) {
        const slug = parts[1].split('/')[0].split('?')[0].trim();
        const invalidSlugs = ['sharer', 'share.php', 'dialog', 'tr', 'events', 'login', 'plugins', 'groups'];
        if (slug && !invalidSlugs.includes(slug.toLowerCase())) {
          outMap.set('facebook', {
            platform: 'facebook',
            url: norm,
            handle: slug,
            source,
            confidence,
          });
        }
      }
    }
    return;
  }

  // C. LinkedIn
  if (lower.includes('linkedin.com/company/') || lower.includes('linkedin.com/in/')) {
    if (!outMap.has('linkedin')) {
      const match = norm.match(/linkedin\.com\/(?:company|in)\/([a-zA-Z0-9\-_%]+)/i);
      const slug = match ? match[1] : null;
      outMap.set('linkedin', {
        platform: 'linkedin',
        url: norm,
        handle: slug,
        source,
        confidence,
      });
    }
    return;
  }

  // D. TikTok
  if (lower.includes('tiktok.com/@')) {
    if (!outMap.has('tiktok')) {
      const match = norm.match(/tiktok\.com\/@([a-zA-Z0-9_.-]+)/i);
      const slug = match ? match[1] : null;
      if (slug) {
        outMap.set('tiktok', {
          platform: 'tiktok',
          url: `https://www.tiktok.com/@${slug}`,
          handle: `@${slug}`,
          source,
          confidence,
        });
      }
    }
    return;
  }

  // E. YouTube
  if (lower.includes('youtube.com/') || lower.includes('youtu.be/')) {
    if (!outMap.has('youtube')) {
      if (!lower.includes('/watch') && !lower.includes('/embed')) {
        const match = norm.match(/youtube\.com\/(?:@|c\/|channel\/|user\/)?([a-zA-Z0-9\-_]+)/i);
        const slug = match ? match[1] : null;
        outMap.set('youtube', {
          platform: 'youtube',
          url: norm,
          handle: slug ? `@${slug}` : 'YouTube Channel',
          source,
          confidence,
        });
      }
    }
    return;
  }

  // F. Pinterest
  if (lower.includes('pinterest.com/') || lower.includes('pinterest.com.au/')) {
    if (!outMap.has('pinterest')) {
      const parts = norm.split(/pinterest\.(?:com|com\.au)\//);
      if (parts[1]) {
        const slug = parts[1].split('/')[0].split('?')[0].trim();
        if (slug && !['pin', 'search', 'today'].includes(slug.toLowerCase())) {
          outMap.set('pinterest', {
            platform: 'pinterest',
            url: norm,
            handle: slug,
            source,
            confidence,
          });
        }
      }
    }
    return;
  }

  // G. X / Twitter
  if (lower.includes('twitter.com/') || lower.includes('x.com/')) {
    if (!outMap.has('x')) {
      const parts = norm.split(/twitter\.com\/|x\.com\//);
      if (parts[1]) {
        const slug = parts[1].split('/')[0].split('?')[0].trim();
        const invalidSlugs = ['intent', 'share', 'search', 'home', 'login', 'explore'];
        if (slug && !invalidSlugs.includes(slug.toLowerCase())) {
          outMap.set('x', {
            platform: 'x',
            url: `https://x.com/${slug}`,
            handle: `@${slug}`,
            source,
            confidence,
          });
        }
      }
    }
    return;
  }
}
