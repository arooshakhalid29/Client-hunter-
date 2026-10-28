import { GoogleGenAI } from '@google/genai';
import { OutreachDraft, BusinessRecord, OpportunityScoreResult, WebsiteAuditResult } from '../types.js';
import { db } from '../db.js';

let aiClient: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  aiClient = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export interface RevenueInfrastructureOptions {
  dealSize?: string;
  demoUrl?: string;
  brandSignoff?: string;
  templateStyle?: 'revenue_infrastructure' | 'consultative' | 'call_script' | 'contact_form' | 'follow_up';
}

interface GenerateDraftRequest {
  business: BusinessRecord;
  score?: OpportunityScoreResult | null;
  audit?: WebsiteAuditResult | null;
  channel: 'email' | 'call_script' | 'contact_form' | 'follow_up';
  options?: RevenueInfrastructureOptions;
}

// Helper to determine niche-specific vocabulary for high-ticket infrastructure pitch
function getNicheInfrastructureVocabulary(business: BusinessRecord): {
  marketName: string;
  specializedFocus: string;
  technicalServicePosition: string;
  projectType: string;
  urgencyConcern: string;
  defaultDealSize: string;
} {
  const nicheId = business.nicheId || '';
  const name = business.name.toLowerCase();

  if (name.includes('duct') || name.includes('air quality') || name.includes('vent') || nicheId === 'hvac_aircon') {
    return {
      marketName: 'air quality and climate service',
      specializedFocus: 'specialized air duct, HVAC, and ventilation hygiene',
      technicalServicePosition: 'health focused air quality solutions and critical dryer vent safety',
      projectType: 'large scale residential project or a high margin commercial contract',
      urgencyConcern: 'home safety and indoor air quality',
      defaultDealSize: '5,000 dollar',
    };
  }

  if (nicheId === 'emergency_plumber' || nicheId === 'plumber' || name.includes('plumb')) {
    return {
      marketName: 'emergency plumbing and commercial hydraulic',
      specializedFocus: 'specialized emergency plumbing, blocked drain clearing, and hydraulic maintenance',
      technicalServicePosition: 'rapid 24/7 urgent callout dispatch and certified master trade compliance',
      projectType: 'large scale residential overhaul or a high margin commercial plumbing contract',
      urgencyConcern: 'flooded premises, gas leaks, or burst water mains',
      defaultDealSize: '5,000 dollar',
    };
  }

  if (nicheId === 'electrician' || nicheId === 'emergency_electrician' || name.includes('electr')) {
    return {
      marketName: 'commercial and residential electrical engineering',
      specializedFocus: 'specialized electrical infrastructure, switchboard upgrades, and emergency power restoration',
      technicalServicePosition: 'master electrical compliance, industrial power reliability, and rapid emergency triage',
      projectType: 'major switchboard modernization project or a high margin commercial wiring contract',
      urgencyConcern: 'hazardous power outages, electrical faults, and compliance downtime',
      defaultDealSize: '4,500 dollar',
    };
  }

  if (nicheId === 'general_dentist' || nicheId === 'cosmetic_dentist' || name.includes('dental') || name.includes('dentist')) {
    return {
      marketName: 'private restorative and cosmetic dental',
      specializedFocus: 'advanced dental restorations, surgical implants, and acute patient care',
      technicalServicePosition: 'patient-focused gentle care, dental implant precision, and same-day emergency relief',
      projectType: 'multi-stage smile rehabilitation or a high value restorative treatment plan',
      urgencyConcern: 'acute dental pain, broken crowns, or dental trauma',
      defaultDealSize: '4,000 dollar',
    };
  }

  if (nicheId === 'mechanic' || name.includes('auto') || name.includes('mechanic')) {
    return {
      marketName: 'automotive mechanical and fleet maintenance',
      specializedFocus: 'precision vehicle diagnostics, engine overhaul, and fleet management',
      technicalServicePosition: 'certified mechanical expertise, logbook warranty integrity, and rapid turnaround diagnostics',
      projectType: 'major transmission/engine rebuild or a high margin commercial fleet contract',
      urgencyConcern: 'vehicle immobilization and unexpected breakdown costs',
      defaultDealSize: '3,200 dollar',
    };
  }

  // Default appointment/quote-driven trade
  return {
    marketName: `${business.nicheName.toLowerCase()} service`,
    specializedFocus: `specialized ${business.nicheName.toLowerCase()} operations`,
    technicalServicePosition: 'delivering dependable technical expertise and certified client satisfaction',
    projectType: 'large scale residential project or a high margin commercial contract',
    urgencyConcern: 'immediate service availability',
    defaultDealSize: '5,000 dollar',
  };
}

export function generateRevenueInfrastructureCopy(
  business: BusinessRecord,
  score?: OpportunityScoreResult | null,
  audit?: WebsiteAuditResult | null,
  options?: RevenueInfrastructureOptions
): { subject: string; openingLine: string; content: string; callToAction: string } {
  const vocab = getNicheInfrastructureVocabulary(business);
  const domain = business.normalizedDomain
    || (business.websiteUrl ? business.websiteUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] : business.name.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com.au');
  const city = business.city || 'local';
  const dealSize = options?.dealSize || vocab.defaultDealSize;
  const demoUrl = options?.demoUrl || 'https://zeroleaks.it/';
  const brandSignoff = options?.brandSignoff || 'ZeroLeaks | Engineered Revenue Infrastructure';

  const subject = `Turning your missed calls into project contracts at ${domain}`;
  const openingLine = `In the ${vocab.marketName} market the first company to talk back wins the contract.`;
  const callToAction = 'Are you open to a 15 minute Infrastructure Diagnostic?';

  const content = `In the ${vocab.marketName} market the first company to talk back wins the contract. You are likely losing 20 to 30 percent of your high ticket project volume because your current digital presence is a silent expense. We install private revenue infrastructure that you own outright ensuring your business never misses a ${dealSize} opportunity just because a phone call went unanswered.

Hi to the ${business.name} Team,

I’ve been following your work in the ${vocab.specializedFocus} space. Your focus on providing ${vocab.technicalServicePosition} clearly positions you as a top tier technical choice for the local ${city} market.

However while analyzing the digital infrastructure at ${domain} I identified a specific operational gap. Your current setup relies on manual response which creates a revenue leak whenever a high intent lead especially for a ${vocab.projectType} is met with a delay. In this industry speed is the only currency. When a client is concerned about their ${vocab.urgencyConcern} they will not wait for a callback; they will move to the first firm that provides an instant qualified answer.

Forget temporary marketing fixes or fragile third party tools. We build proprietary AI infrastructure that you own as a core business asset. By embedding this intelligence directly into your internal systems we bridge the gap between a lead and a contract. It transforms your digital door into a 24/7 high performance engine that identifies qualifies and secures high margin project volume while your competitors are still checking their voicemails.

If you want to see how it actually works we’ve shared the details here: ${demoUrl}

${callToAction} I will show you exactly where the gaps in your pipeline are and how to bridge them with a private asset your firm owns. If it isn’t a fit you keep the diagnostic map anyway.

Best,

${brandSignoff}`;

  return { subject, openingLine, content, callToAction };
}

export async function generateOutreachDraft(req: GenerateDraftRequest): Promise<OutreachDraft> {
  const { business, score, audit, channel, options } = req;
  const draftId = 'draft_' + Math.random().toString(36).substring(2, 11);
  const isSuppressed = business.isSuppressed;

  const vocab = getNicheInfrastructureVocabulary(business);
  const domain = business.normalizedDomain
    || (business.websiteUrl ? business.websiteUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] : business.name.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com.au');
  const demoUrl = options?.demoUrl || 'https://zeroleaks.it/';
  const brandSignoff = options?.brandSignoff || 'ZeroLeaks | Engineered Revenue Infrastructure';
  const dealSize = options?.dealSize || vocab.defaultDealSize;

  let subject = '';
  let content = '';
  let openingLine = '';
  let callToAction = 'Are you open to a 15 minute Infrastructure Diagnostic?';

  // 1. Channel: Email Pitch (ZeroLeaks / Engineered Revenue Infrastructure Style)
  if (channel === 'email') {
    // Check if Gemini AI is available to generate tailored variations adhering to user's exact draft framework
    let aiGenerated = false;
    if (aiClient && !isSuppressed) {
      try {
        const prompt = `
You are the senior architect at ${brandSignoff}.
Your objective is to write an Engineered Revenue Infrastructure sales email for an Australian business, strictly modeling the tone, structure, and persuasion formula of this exact reference template:

--- REFERENCE TEMPLATE ---
Subject: Turning your missed calls into project contracts at envirogreenductcleaning.com

In the air quality service market the first company to talk back wins the contract. You are likely losing 20 to 30 percent of your high ticket project volume because your current digital presence is a silent expense. We install private revenue infrastructure that you own outright ensuring your business never misses a 5,000 dollar opportunity just because a phone call went unanswered.

Hi to the EnviroGreen Team,

I’ve been following your work in the specialized air duct and vent cleaning space. Your focus on providing health focused air quality solutions and critical dryer vent safety clearly positions you as a top tier technical choice for the local market.

However while analyzing the digital infrastructure at envirogreenductcleaning.com I identified a specific operational gap. Your current setup relies on manual response which creates a revenue leak whenever a high intent lead especially for a large scale residential project or a high margin commercial contract is met with a delay. In this industry speed is the only currency. When a client is concerned about their home safety they will not wait for a callback; they will move to the first firm that provides an instant qualified answer.

Forget temporary marketing fixes or fragile third party tools. We build proprietary AI infrastructure that you own as a core business asset. By embedding this intelligence directly into your internal systems we bridge the gap between a lead and a contract. It transforms your digital door into a 24/7 high performance engine that identifies qualifies and secures high margin project volume while your competitors are still checking their voicemails.

If you want to see how it actually works we’ve shared the details here: ${demoUrl}

Are you open to a 15 minute Infrastructure Diagnostic? I will show you exactly where the gaps in your pipeline are and how to bridge them with a private asset your firm owns. If it isn’t a fit you keep the diagnostic map anyway.

Best,

${brandSignoff}
--- END REFERENCE TEMPLATE ---

TARGET BUSINESS DETAILS:
- Business Name: ${business.name}
- Domain: ${domain}
- Niche: ${business.nicheName} (${vocab.marketName})
- City/Location: ${business.city}, ${business.state} Australia
- Primary Service Position: ${vocab.technicalServicePosition}
- Project Contract Type: ${vocab.projectType}
- Urgency Concern: ${vocab.urgencyConcern}
- Deal Size Opportunity: ${dealSize}
- Booking System Observed: ${audit?.detectedBookingSystems?.join(', ') || 'Manual / Phone only'}
- After-hours / Emergency Mentioned: ${audit?.hasAfterHoursOrEmergency ? 'Yes' : 'No'}

CRITICAL INSTRUCTIONS:
1. Mirror the exact rhythm, authoritative tone, and phrasing of the reference template.
2. Customize the business name, domain, industry terminology, project contract type, and customer urgency points specifically for ${business.name}.
3. Keep the exact closing offer: "Are you open to a 15 minute Infrastructure Diagnostic? I will show you exactly where the gaps in your pipeline are..."
4. Keep the signoff: "${brandSignoff}".
5. Return JSON format with fields:
   - "subject": "Turning your missed calls into project contracts at ${domain}"
   - "openingLine": "In the ${vocab.marketName} market the first company to talk back wins the contract."
   - "content": full body text formatted cleanly with paragraphs
   - "callToAction": "Are you open to a 15 minute Infrastructure Diagnostic?"
`;

        const generatePromise = aiClient.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.6,
          },
        });
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Gemini API call timed out')), 4000)
        );
        const response = await Promise.race([generatePromise, timeoutPromise]);
        const text = response.text?.trim();

        if (text) {
          const parsed = JSON.parse(text);
          subject = parsed.subject || `Turning your missed calls into project contracts at ${domain}`;
          openingLine = parsed.openingLine || `In the ${vocab.marketName} market the first company to talk back wins the contract.`;
          content = parsed.content || '';
          callToAction = parsed.callToAction || 'Are you open to a 15 minute Infrastructure Diagnostic?';
          aiGenerated = true;
        }
      } catch (err) {
        console.warn('[Gemini] Infrastructure draft generation fallback to grounded template:', err);
      }
    }

    if (!aiGenerated) {
      const generated = generateRevenueInfrastructureCopy(business, score, audit, options);
      subject = generated.subject;
      openingLine = generated.openingLine;
      content = generated.content;
      callToAction = generated.callToAction;
    }
  } else if (channel === 'call_script') {
    // 2. Channel: Cold Call Script in Revenue Infrastructure framing
    subject = `Infrastructure Diagnostic Call Script: ${business.name}`;
    openingLine = `Hi, am I speaking with the managing director or operations lead at ${business.name}?`;
    content = `[OPENING HOOK - PATTERN INTERRUPT]
"Hi there, my name is [Your Name] with ${brandSignoff}. I was analyzing the digital infrastructure for ${domain} in ${business.city} and noticed a specific operational gap that is leaking revenue during peak inquiry hours."

[THE COMMERCIAL PROBLEM]
"In the ${vocab.marketName} market, speed is the only currency. When a client has a ${vocab.urgencyConcern}, they will not wait for a callback—they hire the first firm that answers. Right now, your team relies on manual response, meaning high-ticket ${vocab.projectType} volume is going to voicemail."

[THE PROPRIETARY ASSET SOLUTION]
"We don't sell marketing retainer fluff. We engineer private AI infrastructure that your firm owns as an internal asset—answering every call 24/7, qualifying ${dealSize} projects, and booking appointments directly into your system."

[OBJECTION HANDLING]
- If 'We have receptionists': "Understood! Our private infrastructure acts as zero-latency overflow when your staff are on other calls or off the clock so no $5,000 lead bounces to a competitor."
- If 'Send an email': "Will do. I will send over our diagnostic summary to your email right now. Check it at ${demoUrl}."

[CALL TO ACTION / DIAGNOSTIC OFFER]
"${callToAction} I'll show you exactly where your pipeline leaks are and hand you the diagnostic map even if we don't work together."`;
  } else if (channel === 'contact_form') {
    // 3. Channel: Website Contact Form Message (Concise ZeroLeaks pitch)
    subject = `Operational Infrastructure Gap at ${domain}`;
    openingLine = `Hi to the ${business.name} operations team,`;
    content = `Hi to the ${business.name} Team,

In the ${vocab.marketName} market the first company to talk back wins the contract. While reviewing the digital infrastructure at ${domain}, I identified an operational gap: high-intent client inquiries for ${vocab.projectType} work are frequently met with response delays when your staff are on-site or off the clock.

We install private AI revenue infrastructure that you own outright—ensuring ${business.name} captures and qualifies every ${dealSize} opportunity 24/7 rather than letting it leak to competitors.

See the live architecture here: ${demoUrl}

Are you open to a 15-minute Infrastructure Diagnostic this week?

Best,
${brandSignoff}`;
  } else {
    // 4. Channel: Follow-Up Sequence
    subject = `Re: Turning your missed calls into project contracts at ${domain}`;
    openingLine = `Following up on the infrastructure diagnostic note I sent over regarding ${domain}.`;
    content = `Hi to the ${business.name} Team,

${openingLine}

In ${business.city}'s ${vocab.marketName} market, delay is the biggest revenue leak. When a high-margin client needs an immediate answer for a ${vocab.projectType}, waiting 30 minutes for a callback means they've already signed with another firm.

We engineer proprietary AI infrastructure that you own outright to lock down that leakage 24/7.

Take 60 seconds to review our architecture breakdown here: ${demoUrl}

Would you be open to a 15-minute Infrastructure Diagnostic Thursday or Friday? If it isn't an exact fit, you keep the diagnostic map anyway.

Best,

${brandSignoff}`;
  }

  const now = new Date().toISOString();
  const draftRecord: OutreachDraft = {
    id: draftId,
    businessId: business.id,
    channel,
    subject,
    content,
    openingLine,
    callToAction,
    isApproved: false,
    approvedAt: null,
    sentAt: null,
    deliveryStatus: isSuppressed ? 'suppressed' : 'draft',
    providerMessageId: null,
    createdAt: now,
  };

  // Persist draft in DB
  try {
    db.prepare(`
      INSERT INTO outreach_drafts (
        id, business_id, channel, subject, content, opening_line,
        call_to_action, is_approved, approved_at, sent_at,
        delivery_status, provider_message_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      draftRecord.id, draftRecord.businessId, draftRecord.channel,
      draftRecord.subject, draftRecord.content, draftRecord.openingLine,
      draftRecord.callToAction, draftRecord.isApproved ? 1 : 0,
      draftRecord.approvedAt, draftRecord.sentAt, draftRecord.deliveryStatus,
      draftRecord.providerMessageId, draftRecord.createdAt
    );
  } catch (err) {
    console.error('Failed to save outreach draft:', err);
  }

  return draftRecord;
}
