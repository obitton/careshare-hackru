console.log('Server process started...');
import 'dotenv/config';
import express from 'express';
import prisma from './db';
import cors from 'cors';
import { z } from 'zod';
import { createRequire } from 'module';
import crypto from 'crypto';
const nodeRequire = createRequire(process.cwd() + '/server/index.ts');
const zipcodes = nodeRequire('zipcodes');
let libphonenumber: any;
(async () => {
  libphonenumber = await import('libphonenumber-js');
})();

// Helper: treat null/undefined/empty string as undefined for optional string fields
const nullableString = z.preprocess((v) => {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'string') {
    const t = v.trim();
    return t.length === 0 ? undefined : t;
  }
  return v;
}, z.string().optional());


const app = express();
const port = process.env.PORT || 3001;

// Middleware to normalize multiple slashes into a single slash
app.use((req, res, next) => {
  req.url = req.url.replace(/\/+/g, '/');
  next();
});


// CORS configuration
const allowedOrigins = [
  'https://careshare-hackru-1.onrender.com',
  'http://localhost:5173', // Vite default
  'http://localhost:3000', // Common alternative
];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

// Root handlers for platform health checks and convenience
app.head('/', (_req, res) => {
  res.status(200).end();
});
app.get('/', (_req, res) => {
  res.status(200).json({ ok: true, service: 'CareShare API' });
});

// Capture raw body for HMAC verification (e.g., ElevenLabs webhook)
app.use(express.json({ verify: (req: any, _res, buf) => { req.rawBody = buf; } }));

// Detailed request/response logger with request-id and timing
function safeStringify(obj: unknown, limit = 4000): string {
  try {
    const s = JSON.stringify(obj);
    if (s.length > limit) return s.slice(0, limit) + '…';
    return s;
  } catch (_e) {
    return '[unserializable]';
  }
}

app.use((req, res, next) => {
  const reqId = crypto.randomUUID();
  (res.locals as any).reqId = reqId;
  res.setHeader('X-Request-ID', reqId);
  const start = Date.now();

  console.log(`[${reqId}] --> ${req.method} ${req.originalUrl}`);
  if (req.method !== 'GET') {
    console.log(`[${reqId}] body: ${safeStringify(req.body)}`);
  }

  const origJson = res.json.bind(res);
  res.json = (data: any) => {
    const ms = Date.now() - start;
    console.log(`[${reqId}] <-- ${res.statusCode} ${ms}ms json: ${safeStringify(data)}`);
    return origJson(data);
  };

  const origSend = res.send.bind(res);
  res.send = (data: any) => {
    const ms = Date.now() - start;
    const preview = typeof data === 'string' ? (data.length > 4000 ? data.slice(0, 4000) + '…' : data) : '[non-string]';
    console.log(`[${reqId}] <-- ${res.statusCode} ${ms}ms send: ${preview}`);
    return origSend(data);
  };

  next();
});

// Enforce JSON responses for all /api routes (including 200s)
app.use('/api', (req: any, res: any, next) => {
  const prevJson = res.json.bind(res);
  const prevSend = res.send.bind(res);
  res.set('Content-Type', 'application/json');

  res.json = (data: any) => {
    res.set('Content-Type', 'application/json');
    return prevJson(data);
  };

  res.send = (data: any) => {
    res.set('Content-Type', 'application/json');
    if (typeof data === 'string') {
      // If it's already JSON string, pass through; else wrap as { message }
      try {
        JSON.parse(data);
        return prevSend(data);
      } catch {
        return prevJson({ message: data });
      }
    }
    return prevJson(data);
  };

  next();
});

// Basic health
app.get('/api/health', async (_req, res) => {
  try {
    // A simple, fast query to confirm DB connectivity
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, database: 'connected' });
  } catch (e: any) {
    console.error('[health] Health check failed:', e);
    res.status(503).json({ ok: false, database: 'disconnected', error: e.message });
  }
});

// Admin stats (UI parity)
app.get('/api/stats', async (_req, res) => {
  try {
    const seniors = await prisma.senior.count({ where: { is_active: true } });
    const volunteers = await prisma.volunteer.count({ where: { is_active: true } });
    const upcoming = await prisma.appointment.count({ where: { status: { in: ['Scheduled', 'Confirmed'] } } });
    const completed = await prisma.appointment.count({
      where: {
        status: 'Completed',
        appointment_datetime: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
      }
    });
    res.json({
      totalSeniors: seniors,
      activeVolunteers: volunteers,
      upcomingAppointments: upcoming,
      completedThisMonth: completed,
    });
  } catch (e: any) {
    console.error(`[stats] ERROR:`, e);
    res.status(500).json({ error: e.message || 'Internal error' });
  }
});

// Sanity-check route for proxy/debugging
app.get('/api/agent/hello', (_req, res) => {
  res.json({ message: 'hello from agent route' });
});

// --- AGENT ROUTES ---
const SKILL_KEYWORDS: Record<string, string> = {
  groceries: 'Grocery Shopping',
  shopping: 'Grocery Shopping',
  ride: 'Driving',
  appointment: 'Driving',
  doctor: 'Driving',
  tech: 'Tech Help',
  computer: 'Tech Help',
  phone: 'Tech Help',
  garden: 'Gardening',
  weeding: 'Gardening',
  visit: 'Companionship',
  talk: 'Companionship',
};

function parseRequestForSkill(requestDetails: string): string | null {
  const lowerCaseRequest = requestDetails.toLowerCase();
  for (const [keyword, skill] of Object.entries(SKILL_KEYWORDS)) {
    // Use word boundaries to avoid partial matches (e.g., 'car' in 'care')
    if (new RegExp(`\\b${keyword}\\b`).test(lowerCaseRequest)) {
      return skill;
    }
  }
  return null;
}

function normalizePhoneNumber(phone: string, defaultCountry: string = 'US'): string | null {
  try {
    const phoneNumber = libphonenumber.parsePhoneNumberFromString(phone, defaultCountry);
    if (phoneNumber && phoneNumber.isValid()) {
      return phoneNumber.format('E.164');
    }
  } catch (err: any) {
    console.error('normalizePhoneNumber error:', err && err.stack ? err.stack : err);
    // Fallback: naive normalization to US if possible
    const digits = (phone || '').replace(/\D+/g, '');
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    if (digits.length === 10) return `+1${digits}`;
    if (phone && phone.startsWith('+') && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  }
  return null;
}

// 1) Find senior by phone and parse request
const findSeniorSchema = z.object({
  caller_phone_number: z.string(),
  request_details: z.string(),
});

app.post('/api/agent/find-and-parse', async (req, res) => {
  console.log('AGENT TOOL: findSeniorAndParseRequest');
  const result = findSeniorSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(200).json({ success: false, error: { code: 'INVALID_BODY', message: 'Invalid request body', details: result.error.issues } });
  }
  const { caller_phone_number, request_details } = result.data;
  const normalizedPhone = normalizePhoneNumber(caller_phone_number);
  if (!normalizedPhone) {
    return res.status(200).json({ success: false, error: { code: 'INVALID_PHONE', message: 'Invalid phone number format.' } });
  }

  try {
    console.log(` -> Finding senior by phone: ${normalizedPhone}`);
    const senior = await prisma.senior.findFirst({ where: { phone_number: normalizedPhone } });
    if (!senior) {
      return res.status(200).json({ success: false, error: { code: 'NOT_FOUND', message: 'Senior not found' } });
    }

    console.log(` -> Parsing request for skill: "${request_details}"`);
    const skillName = parseRequestForSkill(request_details);
    if (skillName) {
      console.log(` -> Found skill: ${skillName}`);
    } else {
      console.log(' -> No specific skill found, searching for all volunteers.');
    }

    const volunteers = await prisma.volunteer.findMany({
      where: {
        is_active: true,
        // Conditionally apply skill filter ONLY if a skill was found
        ...(skillName && { skills: { some: { skill: { name: skillName } } } }),
      },
      select: { id: true, first_name: true, last_name: true, phone_number: true, zip_code: true },
    });
    console.log(` -> Found ${volunteers.length} volunteers.`);

    res.status(200).json({
      success: true, data: {
        senior,
        matched_skill: skillName, // Will be null if no skill was found
        potential_volunteers: volunteers,
      }
    });
  } catch (e: any) {
    console.error(' -> ERROR in find-and-parse:', e);
    res.status(200).json({ success: false, error: { code: 'INTERNAL_ERROR', message: e.message } });
  }
});

// 2) List volunteers (filters: skill, zip, radius)
const listVolunteersSchema = z.object({
  skill: z.enum(['Driving', 'Grocery Shopping', 'Tech Help', 'Gardening', 'Companionship']).optional(),
  zip: z.string().optional(),
  radius: z.coerce.number().int().positive().max(200).optional(),
});

app.post('/api/agent/list-volunteers', async (req, res) => {
  console.log('AGENT TOOL: listVolunteers');
  const parsed = listVolunteersSchema.safeParse(req.body);
  if (!parsed.success) return res.status(200).json({ success: false, error: { code: 'INVALID_BODY', message: 'Invalid request body', details: parsed.error.issues } });
  const { skill, zip, radius = 10 } = parsed.data;
  try {
    const zips: string[] | null = zip ? (zipcodes.radius(zip, radius) as string[]) : null;
    const volunteers = await prisma.volunteer.findMany({
      where: {
        is_active: true,
        skills: skill ? { some: { skill: { name: skill } } } : undefined,
        zip_code: zips ? { in: zips } : undefined,
      },
      include: { skills: { include: { skill: true } } },
      orderBy: { id: 'desc' },
    });
    const formatted = volunteers.map(v => ({ ...v, skills: v.skills.map(s => s.skill.name) }));
    res.status(200).json({ success: true, data: formatted });
  } catch (e: any) {
    if (e.message.includes('Invalid zip')) {
      return res.status(200).json({ success: false, error: { code: 'INVALID_ZIP', message: 'Invalid zip provided' } });
    }
    console.error('list-volunteers error:', e);
    res.status(200).json({ success: false, error: { code: 'INTERNAL_ERROR', message: e.message } });
  }
});

// Alias: find-volunteers -> same as list-volunteers
app.post('/api/agent/find-volunteers', async (req, res) => {
  console.log('AGENT TOOL: findVolunteers (alias)');
  const parsed = listVolunteersSchema.safeParse(req.body);
  if (!parsed.success) return res.status(200).json({ success: false, error: { code: 'INVALID_BODY', message: 'Invalid request body', details: parsed.error.issues } });
  (req as any).body = parsed.data;
  // Reuse logic by calling underlying handler code inline
  const { skill, zip, radius = 10 } = parsed.data;
  try {
    const zips: string[] | null = zip ? (zipcodes.radius(zip, radius) as string[]) : null;
    const volunteers = await prisma.volunteer.findMany({
      where: {
        is_active: true,
        skills: skill ? { some: { skill: { name: skill } } } : undefined,
        zip_code: zips ? { in: zips } : undefined,
      },
      include: { skills: { include: { skill: true } } },
      orderBy: { id: 'desc' },
    });
    const formatted = volunteers.map(v => ({ ...v, skills: v.skills.map(s => s.skill.name) }));
    res.status(200).json({ success: true, data: formatted });
  } catch (e: any) {
    if (e.message.includes('Invalid zip')) {
      return res.status(200).json({ success: false, error: { code: 'INVALID_ZIP', message: 'Invalid zip provided' } });
    }
    console.error('find-volunteers error:', e);
    res.status(200).json({ success: false, error: { code: 'INTERNAL_ERROR', message: e.message } });
  }
});

// Create or update a senior (upsert by phone)
const upsertSeniorSchema = z.object({
  first_name: nullableString,
  last_name: nullableString,
  phone_number: z.string(),
  email: nullableString,
  street_address: nullableString,
  city: nullableString,
  state: nullableString,
  zip_code: nullableString,
});

app.post('/api/agent/create-senior', async (req, res) => {
  console.log('AGENT TOOL: createSenior (upsert by phone)');
  const parsed = upsertSeniorSchema.safeParse(req.body);
  if (!parsed.success) return res.status(200).json({ success: false, error: { code: 'INVALID_BODY', message: 'Invalid request body', details: parsed.error.issues } });
  const normalized = normalizePhoneNumber(parsed.data.phone_number);
  if (!normalized) return res.status(200).json({ success: false, error: { code: 'INVALID_PHONE', message: 'Invalid phone number format.' } });
  try {
    const d = parsed.data;
    const emailClean = d.email; // Already preprocessed by nullableString
    const upserted = await prisma.senior.upsert({
      where: { id: -1 }, // Bogus where to force create path since we don't have unique on phone
      create: {
        first_name: d.first_name || '',
        last_name: d.last_name || '',
        phone_number: normalized,
        email: emailClean,
        street_address: d.street_address,
        city: d.city,
        state: d.state,
        zip_code: d.zip_code,
        is_active: true,
      },
      update: {}, // Handled by create
    });
    return res.status(200).json({ success: true, data: upserted, upserted: 'created_or_updated' });
  } catch (e: any) {
    console.error('create-senior error:', e);
    res.status(200).json({ success: false, error: { code: 'INTERNAL_ERROR', message: e.message } });
  }
});

// Start inbound conversation: store summary and nearby volunteers
const startInboundSchema = z.object({
  caller_phone_number: z.string(),
  request_details: z.string(),
  create_if_missing: z.boolean().optional(),
  first_name: nullableString,
  last_name: nullableString,
  email: nullableString,
  street_address: nullableString,
  city: nullableString,
  state: nullableString,
  zip_code: nullableString,
  zip: nullableString,
  radius: z.coerce.number().int().positive().max(200).optional(),
});

app.post('/api/agent/start-inbound-conversation', async (req, res) => {
  console.log('AGENT TOOL: startInboundConversation');
  const parsed = startInboundSchema.safeParse(req.body);
  if (!parsed.success) return res.status(200).json({ success: false, error: { code: 'INVALID_BODY', message: 'Invalid request body', details: parsed.error.issues } });
  const d = parsed.data;
  const normalized = normalizePhoneNumber(d.caller_phone_number);
  if (!normalized) return res.status(200).json({ success: false, error: { code: 'INVALID_PHONE', message: 'Invalid phone number format.' } });

  try {
    let seniorRow: any = await prisma.senior.findFirst({ where: { phone_number: normalized } });

    if (!seniorRow && (d.create_if_missing || d.first_name || d.last_name || d.zip_code)) {
      const emailClean = d.email; // Already preprocessed
      seniorRow = await prisma.senior.create({
        data: {
          first_name: d.first_name || '',
          last_name: d.last_name || '',
          phone_number: normalized,
          email: emailClean,
          street_address: d.street_address,
          city: d.city,
          state: d.state,
          zip_code: d.zip_code,
          is_active: true,
        },
      });
    }

    const matchedSkill = parseRequestForSkill(d.request_details);

    const searchZip = d.zip ?? seniorRow?.zip_code ?? null;
    const radius = d.radius ?? 10;
    
    let volunteers: any[] = [];
    if (searchZip && matchedSkill) {
      for (const r of [radius, radius + 5, radius + 10, radius + 15]) {
        try {
          const zips = zipcodes.radius(searchZip, r) as string[];
          const vols = await prisma.volunteer.findMany({
            where: {
              is_active: true,
              skills: { some: { skill: { name: matchedSkill } } },
              zip_code: { in: zips },
            },
            include: { skills: { include: { skill: true } } },
          });
          if (vols.length > 0) {
            volunteers = vols.map(v => ({ ...v, skills: v.skills.map(s => s.skill.name) }));
            break;
          }
        } catch {}
      }
    }
    
    if (volunteers.length === 0 && searchZip) {
      try {
        const zips = zipcodes.radius(searchZip, radius) as string[];
        const allVols = await prisma.volunteer.findMany({
          where: { is_active: true, zip_code: { in: zips } },
          include: { skills: { include: { skill: true } } },
        });
        volunteers = allVols.map(v => ({ ...v, skills: v.skills.map(s => s.skill.name) }));
      } catch {}
    }

    const insert = await prisma.inboundConversation.create({
      data: {
        senior_id: seniorRow?.id ?? null,
        caller_phone_number: normalized,
        request_details: d.request_details,
        matched_skill: matchedSkill,
        nearby_volunteers: volunteers as any,
        status: 'OPEN',
      },
    });

    res.status(201).json({
      success: true, data: {
        conversation_id: insert.id,
        senior: seniorRow,
        matched_skill: matchedSkill,
        volunteers,
      }
    });
  } catch (e: any) {
    console.error('start-inbound-conversation error:', e);
    res.status(200).json({ success: false, error: { code: 'INTERNAL_ERROR', message: e.message } });
  }
});

// Log per-volunteer outbound call for a conversation
const logVolunteerCallSchema = z.object({
  conversation_id: z.coerce.number().int(),
  volunteer_id: z.coerce.number().int(),
  outcome: z.enum(['ACCEPTED','DECLINED','NO_ANSWER','VOICEMAIL']),
  notes: z.string().optional(),
});

app.post('/api/agent/log-volunteer-call', async (req, res) => {
  console.log('AGENT TOOL: logVolunteerCall');
  const parsed = logVolunteerCallSchema.safeParse(req.body);
  if (!parsed.success) return res.status(200).json({ success: false, error: { code: 'INVALID_BODY', message: 'Invalid request body', details: parsed.error.issues } });
  const d = parsed.data;
  try {
    // Validate conversation exists
    const conv = await prisma.inboundConversation.findUnique({ where: { id: d.conversation_id } });
    if (!conv) {
      return res.status(200).json({ success: false, error: { code: 'NOT_FOUND', message: 'Conversation not found' } });
    }
    // Validate volunteer exists
    const vol = await prisma.volunteer.findUnique({ where: { id: d.volunteer_id } });
    if (!vol) {
      return res.status(200).json({ success: false, error: { code: 'NOT_FOUND', message: 'Volunteer not found' } });
    }
    const created = await prisma.conversationCall.create({
      data: {
        conversation_id: d.conversation_id,
        volunteer_id: d.volunteer_id,
        outcome: d.outcome,
        notes: d.notes,
      }
    });
    await prisma.inboundConversation.update({
      where: { id: d.conversation_id },
      data: { updated_at: new Date() },
    });
    res.status(201).json({ success: true, data: created });
  } catch (e: any) {
    console.error('log-volunteer-call error:', e);
    res.status(200).json({ success: false, error: { code: 'INTERNAL_ERROR', message: e.message } });
  }
});

// Get full conversation details
app.get('/api/agent/conversation/:id', async (req, res) => {
  console.log('AGENT TOOL: getConversation');
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(200).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid conversation id' } });
  try {
    const conversation = await prisma.inboundConversation.findUnique({ where: { id } });
    if (!conversation) return res.status(200).json({ success: false, error: { code: 'NOT_FOUND', message: 'Conversation not found' } });
    
    const calls = await prisma.conversationCall.findMany({ where: { conversation_id: id }, orderBy: { id: 'desc' } });
    res.status(200).json({ success: true, data: { conversation, calls } });
  } catch (e: any) {
    console.error('get-conversation error:', e);
    res.status(200).json({ success: false, error: { code: 'INTERNAL_ERROR', message: e.message } });
  }
});

// Get only ACCEPTED volunteers for a conversation
app.get('/api/agent/conversation/:id/accepted', async (req, res) => {
  console.log('AGENT TOOL: getAcceptedVolunteers');
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(200).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid conversation id' } });
  try {
    const calls = await prisma.conversationCall.findMany({
      where: { conversation_id: id, outcome: 'ACCEPTED' },
      include: { volunteer: { select: { id: true, first_name: true, last_name: true, phone_number: true } } },
      orderBy: { id: 'desc' },
    });
    const formatted = calls.map(c => ({
      volunteer_id: c.volunteer_id,
      first_name: c.volunteer.first_name,
      last_name: c.volunteer.last_name,
      phone_number: c.volunteer.phone_number,
    }));
    res.status(200).json({ success: true, data: formatted });
  } catch (e: any) {
    console.error('get-accepted-volunteers error:', e);
    res.status(200).json({ success: false, error: { code: 'INTERNAL_ERROR', message: e.message } });
  }
});

// Get single volunteer by id
app.get('/api/volunteer/:id', async (req, res) => {
  console.log('AGENT TOOL: getVolunteer');
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(200).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid volunteer id' } });
  try {
    const v = await prisma.volunteer.findUnique({
      where: { id },
      select: { id: true, first_name: true, last_name: true, phone_number: true, email: true, bio: true, zip_code: true, background_check_status: true, is_active: true, created_at: true },
    });
    if (!v) return res.status(200).json({ success: false, error: { code: 'NOT_FOUND', message: 'Volunteer not found' } });
    res.status(200).json({ success: true, data: v });
  } catch (e: any) {
    console.error('get-volunteer error:', e);
    res.status(200).json({ success: false, error: { code: 'INTERNAL_ERROR', message: e.message } });
  }
});

// Finalize conversation by scheduling appointment
const finalizeSchema = z.object({
  conversation_id: z.coerce.number().int(),
  chosen_volunteer_id: z.coerce.number().int(),
  appointment_datetime: z.string().datetime(),
  location: z.string().optional(),
  notes_for_volunteer: z.string().optional(),
  senior_id: z.coerce.number().int().optional(),
});

app.post('/api/agent/finalize-conversation', async (req, res) => {
  console.log('AGENT TOOL: finalizeConversation');
  const parsed = finalizeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(200).json({ success: false, error: { code: 'INVALID_BODY', message: 'Invalid request body', details: parsed.error.issues } });
  const d = parsed.data;
  try {
    const conv = await prisma.inboundConversation.findUnique({ where: { id: d.conversation_id } });
    const c = conv;
    if (!c) return res.status(200).json({ success: false, error: { code: 'NOT_FOUND', message: 'Conversation not found' } });
    const seniorId = d.senior_id ?? c.senior_id;
    if (!seniorId) return res.status(200).json({ success: false, error: { code: 'NO_SENIOR', message: 'Senior id is required to schedule' } });

    let locationText: string | null = d.location ?? null;
    if (!locationText) {
      const addr = await prisma.senior.findUnique({ where: { id: seniorId }, select: { street_address: true, city: true, state: true, zip_code: true } });
      if (addr) {
        const parts = [addr.street_address, addr.city, addr.state, addr.zip_code].filter(Boolean);
        locationText = parts.length ? parts.join(', ') : null;
      }
    }

    const appt = await prisma.appointment.create({
      data: {
        senior_id: seniorId,
        volunteer_id: d.chosen_volunteer_id,
        appointment_datetime: d.appointment_datetime,
        location: locationText,
        status: 'Scheduled',
        notes_for_volunteer: d.notes_for_volunteer,
      }
    });

    await prisma.inboundConversation.update({
      where: { id: d.conversation_id },
      data: { scheduled_appointment_id: appt.id, status: 'SCHEDULED', updated_at: new Date() },
    });
    res.status(201).json({ success: true, data: appt });
  } catch (e: any) {
    console.error('finalize-conversation error:', e);
    res.status(200).json({ success: false, error: { code: 'INTERNAL_ERROR', message: e.message } });
  }
});

// Outbound call test via ElevenLabs ConvAI Twilio API
const outboundCallTestSchema = z.object({
  to_number: z.string().optional(),
});

app.post('/api/agent/outbound-call-test', async (req, res) => {
  console.log('AGENT TOOL: outboundCallTest');
  const parsed = outboundCallTestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(200).json({ success: false, error: { code: 'INVALID_BODY', message: 'Invalid request body', details: parsed.error.issues } });

  const xiApiKey = (process.env as any)['XI-API-KEY'] || process.env.XI_API_KEY || process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  const phoneNumberId = process.env.AGENT_PHONE_NUMBER_ID;
  const toNumber = parsed.data.to_number || '+15164770955';

  const missing: string[] = [];
  if (!xiApiKey) missing.push('XI-API-KEY or XI_API_KEY or ELEVENLABS_API_KEY');
  if (!agentId) missing.push('ELEVENLABS_AGENT_ID');
  if (!phoneNumberId) missing.push('AGENT_PHONE_NUMBER_ID');
  if (missing.length) {
    console.error('[XI] Missing env vars:', missing);
    return res.status(200).json({ success: false, error: { code: 'MISSING_ENV', message: 'Missing required env vars', details: missing } });
  }

  try {
    const url = 'https://api.elevenlabs.io/v1/convai/twilio/outbound-call';
    const payload = { agent_id: agentId, agent_phone_number_id: phoneNumberId, to_number: toNumber };
    console.log('[XI] outbound-call-test -> request', { url, payload, headers: { 'xi-api-key': `***${String(xiApiKey).slice(-4)}` } });
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': xiApiKey as string,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    console.log('[XI] outbound-call-test <- response', { ok: response.ok, status: response.status, bodyPreview: text.slice(0, 2000) });

    let data: any;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    return res.status(200).json({ success: response.ok, upstream_status: response.status, data });
  } catch (e: any) {
    console.error('outbound-call-test error:', e);
    return res.status(200).json({ success: false, error: { code: 'UPSTREAM_ERROR', message: e.message } });
  }
});

// Conversation-driven outbound call to a volunteer
const outboundCallSchema = z.object({
  conversation_id: z.coerce.number().int(),
  volunteer_id: z.coerce.number().int(),
  to_number: z.string().optional(),
});

app.post('/api/agent/outbound-call', async (req, res) => {
  console.log('AGENT TOOL: outboundCall (conversation-driven)');
  const parsed = outboundCallSchema.safeParse(req.body);
  if (!parsed.success) return res.status(200).json({ success: false, error: { code: 'INVALID_BODY', message: 'Invalid request body', details: parsed.error.issues } });

  const xiApiKey = (process.env as any)['XI-API-KEY'] || process.env.XI_API_KEY || process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  const phoneNumberId = process.env.AGENT_PHONE_NUMBER_ID;
  const missing: string[] = [];
  if (!xiApiKey) missing.push('XI-API-KEY or XI_API_KEY or ELEVENLABS_API_KEY');
  if (!agentId) missing.push('ELEVENLABS_AGENT_ID');
  if (!phoneNumberId) missing.push('AGENT_PHONE_NUMBER_ID');
  if (missing.length) {
    console.error('[XI] Missing env vars:', missing);
    return res.status(200).json({ success: false, error: { code: 'MISSING_ENV', message: 'Missing required env vars', details: missing } });
  }

  const { conversation_id, volunteer_id, to_number } = parsed.data;
  try {
    const conv = await prisma.inboundConversation.findUnique({ where: { id: conversation_id } });
    if (!conv) return res.status(200).json({ success: false, error: { code: 'NOT_FOUND', message: 'Conversation not found' } });
    const volunteer = await prisma.volunteer.findUnique({ where: { id: volunteer_id }, select: { id: true, first_name: true, last_name: true, phone_number: true } });
    if (!volunteer) return res.status(200).json({ success: false, error: { code: 'NOT_FOUND', message: 'Volunteer not found' } });

    const dialNumber = to_number || volunteer.phone_number;
    const url = 'https://api.elevenlabs.io/v1/convai/twilio/outbound-call';
    const payload = {
      agent_id: agentId,
      agent_phone_number_id: phoneNumberId,
      to_number: dialNumber,
      conversation_initiation_client_data: {
        conversation_id: conv.id,
        volunteer_id: volunteer.id,
        mode: 'VOLUNTEER_OUTBOUND',
      },
    };
    console.log('[XI] outbound-call -> request', { url, payload, headers: { 'xi-api-key': `***${String(xiApiKey).slice(-4)}` } });
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'xi-api-key': xiApiKey as string, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    console.log('[XI] outbound-call <- response', { ok: response.ok, status: response.status, bodyPreview: text.slice(0, 2000) });
    let data: any; try { data = JSON.parse(text); } catch { data = { raw: text }; }

    // record a pending call log entry
    await prisma.conversationCall.create({
      data: {
        conversation_id,
        volunteer_id,
        outcome: 'PENDING',
        notes: null,
        call_sid: data?.callSid ?? null,
        role: 'VOLUNTEER',
      }
    });

    return res.status(200).json({ success: response.ok, upstream_status: response.status, data });
  } catch (e: any) {
    console.error('outbound-call (conversation) error:', e);
    return res.status(200).json({ success: false, error: { code: 'INTERNAL_ERROR', message: e.message } });
  }
});

// Outbound senior callback (dials the senior back)
const outboundSeniorSchema = z.object({
  conversation_id: z.coerce.number().int(),
  senior_id: z.coerce.number().int().optional(),
  to_number: z.string().optional(),
});

app.post('/api/agent/outbound-callback-senior', async (req, res) => {
  console.log('AGENT TOOL: outboundCallbackSenior');
  const parsed = outboundSeniorSchema.safeParse(req.body);
  if (!parsed.success) return res.status(200).json({ success: false, error: { code: 'INVALID_BODY', message: 'Invalid request body', details: parsed.error.issues } });

  const xiApiKey = (process.env as any)['XI-API-KEY'] || process.env.XI_API_KEY || process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  const phoneNumberId = process.env.AGENT_PHONE_NUMBER_ID;
  const missing: string[] = [];
  if (!xiApiKey) missing.push('XI-API-KEY or XI_API_KEY or ELEVENLABS_API_KEY');
  if (!agentId) missing.push('ELEVENLABS_AGENT_ID');
  if (!phoneNumberId) missing.push('AGENT_PHONE_NUMBER_ID');
  if (missing.length) {
    console.error('[XI] Missing env vars:', missing);
    return res.status(200).json({ success: false, error: { code: 'MISSING_ENV', message: 'Missing required env vars', details: missing } });
  }

  const { conversation_id, senior_id, to_number } = parsed.data;
  try {
    const c = await prisma.inboundConversation.findUnique({ where: { id: conversation_id } });
    const conv = c;
    if (!conv) return res.status(200).json({ success: false, error: { code: 'NOT_FOUND', message: 'Conversation not found' } });
    const s = await prisma.senior.findUnique({ where: { id: senior_id }, select: { id: true, first_name: true, last_name: true, phone_number: true } });
    if (!s) return res.status(200).json({ success: false, error: { code: 'NOT_FOUND', message: 'Senior not found' } });
    const dialNumber = to_number || s.phone_number;

    const url = 'https://api.elevenlabs.io/v1/convai/twilio/outbound-call';
    const payload = {
      agent_id: agentId,
      agent_phone_number_id: phoneNumberId,
      to_number: dialNumber,
      conversation_initiation_client_data: {
        conversation_id: c.id,
        senior_id: s.id,
        mode: 'SENIOR_CALLBACK',
      },
    };
    console.log('[XI] outbound-callback-senior -> request', { url, payload, headers: { 'xi-api-key': `***${String(xiApiKey).slice(-4)}` } });
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'xi-api-key': xiApiKey as string, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    console.log('[XI] outbound-callback-senior <- response', { ok: response.ok, status: response.status, bodyPreview: text.slice(0, 2000) });
    let data: any; try { data = JSON.parse(text); } catch { data = { raw: text }; }

    await prisma.conversationCall.create({
      data: {
        conversation_id,
        volunteer_id: 0, // TODO: This seems wrong, should probably be volunteer's ID if available
        outcome: 'PENDING',
        notes: null,
        call_sid: data?.callSid ?? null,
        role: 'SENIOR_CALLBACK',
      }
    });

    return res.status(200).json({ success: response.ok, upstream_status: response.status, data });
  } catch (e: any) {
    console.error('outbound-callback-senior error:', e);
    return res.status(200).json({ success: false, error: { code: 'INTERNAL_ERROR', message: e.message } });
  }
});

// ElevenLabs Twilio personalization webhook: returns dynamic variables + overrides
// This endpoint is called by ElevenLabs at call start.
// It should be publicly reachable (e.g., via ngrok) and secured (add auth if needed).
const personalizationSchema = z.object({
  caller_id: z.string(),
  agent_id: z.string(),
  called_number: z.string(),
  call_sid: z.string(),
  mode: z.enum(['INBOUND','VOLUNTEER_OUTBOUND','SENIOR_CALLBACK']).optional(),
  conversation_id: z.coerce.number().int().optional(),
  volunteer_id: z.coerce.number().int().optional(),
});

app.post('/api/agent/personalization', async (req: any, res) => {
  console.log('AGENT TOOL: personalization webhook');
  // HMAC verification if provided
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  const signature = req.headers['elevenlabs-signature'] as string | undefined;
  if (secret && signature) {
    try {
      const hmac = crypto.createHmac('sha256', secret).update(req.rawBody || '').digest('hex');
      const expected = `sha256=${hmac}`;
      if (signature !== expected) {
        console.error('personalization webhook: signature mismatch');
        return res.status(401).json({ success: false, error: { code: 'INVALID_SIGNATURE', message: 'Invalid webhook signature' } });
      }
    } catch (e: any) {
      console.error('personalization webhook: signature error', e);
      return res.status(401).json({ success: false, error: { code: 'SIGNATURE_ERROR', message: e.message } });
    }
  }

  const parsed = personalizationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(200).json({ success: false, error: { code: 'INVALID_BODY', message: 'Invalid request body', details: parsed.error.issues } });
  const d = parsed.data;
  try {
    const normalizedCaller = normalizePhoneNumber(d.caller_id) || d.caller_id;
    let seniorRow: any = null;
    try {
      seniorRow = await prisma.senior.findFirst({
        where: { phone_number: normalizedCaller },
        select: { id: true, first_name: true, last_name: true, street_address: true, city: true, state: true, zip_code: true },
      });
    } catch { }

    let conversation: any = null;
    if (d.conversation_id) {
      conversation = await prisma.inboundConversation.findUnique({ where: { id: d.conversation_id } });
    }

    let volunteer: any = null;
    if (d.volunteer_id) {
      volunteer = await prisma.volunteer.findUnique({ where: { id: d.volunteer_id }, select: { id: true, first_name: true, last_name: true, phone_number: true, zip_code: true } });
    }

    // Auto-derive mode and context from call_sid if available
    let mode = d.mode || 'INBOUND';
    let conversationFromCall: any = null;
    let volunteerFromCall: any = null;
    try {
      const ccall = await prisma.conversationCall.findFirst({ where: { call_sid: d.call_sid } });
      if (ccall) {
        conversationFromCall = await prisma.inboundConversation.findUnique({ where: { id: ccall.conversation_id } });
        if (ccall.role === 'VOLUNTEER') mode = 'VOLUNTEER_OUTBOUND';
        if (ccall.role === 'SENIOR_CALLBACK') mode = 'SENIOR_CALLBACK';
        volunteerFromCall = await prisma.volunteer.findUnique({ where: { id: ccall.volunteer_id }, select: { id: true, first_name: true, last_name: true, phone_number: true, zip_code: true } });
      }
    } catch { }

    const modeConversation = conversationFromCall || (d.conversation_id ? (await prisma.inboundConversation.findUnique({ where: { id: d.conversation_id } })) : null) || null;
    const modeVolunteer = volunteerFromCall || (d.volunteer_id ? (await prisma.volunteer.findUnique({ where: { id: d.volunteer_id }, select: { id: true, first_name: true, last_name: true, phone_number: true, zip_code: true } })) : null) || null;
    const modePrompts: Record<string, string> = {
      INBOUND: [
        'You are the CareShare assistant for inbound senior calls.',
        'TOOL STRATEGY (DEFAULT → FALLBACK):',
        '- DEFAULT: Use Server HTTP tools first.',
        '    • createSenior → POST /api/agent/create-senior',
        '    • startInboundConversation (REQUIRED exactly once) → POST /api/agent/start-inbound-conversation',
        '- FALLBACK: If an HTTP tool is unavailable or fails after a reasonable retry/clarification, use the MCP equivalent.',
        'STRICT ACTION POLICY:',
        '- You MUST execute real tool calls; never claim success without a successful tool response.',
        'Flow guardrails:',
        '1) Greet warmly.',
        '2) If caller_id is available, do NOT ask for their phone number; confirm it.',
        '3) Confirm identity and profile details if present; otherwise collect minimal needed info.',
        '4) Collect task details, preferred date/time, constraints; confirm the zip. Don’t ask for radius (system expands automatically).',
        '5) Interpret time phrases like "today"/"tomorrow" using provided current time/timezone.',
        '6) CALL startInboundConversation exactly once and rely on its returned nearby_volunteers. Close by informing the senior they will be contacted once a volunteer accepts.',
      ].join(' '),
      VOLUNTEER_OUTBOUND: [
        'You are the CareShare assistant responsible for calling volunteers.',
        'CRITICAL: Your ONLY purpose in this mode is to sequentially call volunteers from the list provided by `startInboundConversation` until one accepts.',
        'TOOL STRATEGY (DEFAULT → FALLBACK):',
        '- DEFAULT: Use Server HTTP tools first.',
        '    • outbound-call (REQUIRED) → POST /api/agent/outbound-call',
        '    • logVolunteerCall (use AFTER call) → POST /api/agent/log-volunteer-call',
        '- FALLBACK: If an HTTP tool is unavailable or fails, use the MCP equivalent.',
        'STRICT ACTION POLICY:',
        '- You MUST call `outbound-call` for a volunteer. The call happens in the real world.',
        '- AFTER the real-world call concludes, you MUST record its result (ACCEPTED/DECLINED/NO_ANSWER/VOICEMAIL) with `logVolunteerCall`.',
        '- Do NOT log an outcome for a call you have not made.',
        'Behavior: From the list of volunteers, pick one. Call `outbound-call`. Wait. Then, call `logVolunteerCall` with the result. If the result is not ACCEPTED, repeat with the next volunteer.',
      ].join(' '),
      SENIOR_CALLBACK: [
        'You are calling the senior back with results.',
        'TOOL STRATEGY (DEFAULT → FALLBACK):',
        '- DEFAULT: Use Server HTTP tools first.',
        '    • getAcceptedVolunteers (REQUIRED first) → GET /api/agent/conversation/:id/accepted',
        '    • finalizeConversation (REQUIRED) → POST /api/agent/finalize-conversation',
        '    • confirm-appointment (RECOMMENDED) → POST /api/agent/confirm-appointment',
        '    • getConversation (optional) → GET /api/agent/conversation/:id',
        '- FALLBACK: If an HTTP tool is unavailable or fails, use the MCP equivalent.',
        'STRICT ACTION POLICY:',
        '- Required sequence: getAcceptedVolunteers → present choices → finalizeConversation when chosen → confirm-appointment.',
        '- Do not state you scheduled/confirmed unless tools returned success; cite ids/times from responses when useful.',
        'Behavior: Guide the senior to choose an accepted volunteer; then schedule via tools and confirm succinctly.',
      ].join(' '),
    };
    const modeFirstMessages: Record<string, string> = {
      INBOUND: 'Hello! How can I help you today?',
      VOLUNTEER_OUTBOUND: 'Hello, this is CareShare calling on behalf of a senior in your community.',
      SENIOR_CALLBACK: 'Hello again, this is CareShare. I have some options for you.',
    };
    let systemMessage = modePrompts[mode] || modePrompts.INBOUND;
    let firstMessage = modeFirstMessages[mode] || modeFirstMessages.INBOUND;

    // Enrich system message with available context to reduce need for many variables
    const seniorName = seniorRow ? `${seniorRow.first_name ?? ''} ${seniorRow.last_name ?? ''}`.trim() : null;
    if (mode === 'INBOUND') {
      const extras: string[] = [];
      const nowIso = new Date().toISOString();
      const tz = 'America/New_York';
      extras.push(`Current time (UTC): ${nowIso}. Timezone: ${tz}. Caller phone: ${normalizedCaller}.`);
      if (seniorName) extras.push(`Possible match on file: ${seniorName} (id ${seniorRow.id}). Confirm identity before proceeding.`);
      if (seniorRow && (!seniorRow.street_address || !seniorRow.city || !seniorRow.state || !seniorRow.zip_code)) {
        extras.push('Address appears incomplete or missing; politely collect street address, city, state, zip, then upsert via createSenior (email is optional).');
      }
      if (modeConversation?.matched_skill) extras.push(`Parsed skill (if mentioned): ${modeConversation.matched_skill}.`);
      systemMessage = `${systemMessage} ${extras.join(' ')}`.trim();
    } else if (mode === 'VOLUNTEER_OUTBOUND') {
      const volName = volunteer ? `${volunteer.first_name ?? ''} ${volunteer.last_name ?? ''}`.trim() : null;
      const extras: string[] = [];
      const seniorForCall = modeConversation?.senior_id ? (await prisma.senior.findUnique({ where: { id: modeConversation.senior_id } })) : null;
      const seniorNameForCall = seniorForCall ? `${seniorForCall.first_name ?? ''} ${seniorForCall.last_name ?? ''}`.trim() : seniorName;

      if (seniorNameForCall) {
        extras.push(`You are calling on behalf of a senior named ${seniorNameForCall}.`);
        firstMessage = `Hello, this is CareShare calling on behalf of a senior in your community, ${seniorNameForCall}.`;
      }
      const volName2 = modeVolunteer ? `${modeVolunteer.first_name ?? ''} ${modeVolunteer.last_name ?? ''}`.trim() : volName;
      if (volName2) extras.push(`Your name is ${volName2}.`);
      const taskDetail = modeConversation?.request_details;
      if (taskDetail) extras.push(`The specific request is: "${taskDetail}".`);
      const skillDetail = modeConversation?.matched_skill;
      if (skillDetail) extras.push(`This task requires the skill: "${skillDetail}".`);
      
      extras.push('Your goal is to ask if they are available and willing to help with this specific task. Be clear and concise.');
      systemMessage = `${systemMessage} ${extras.join(' ')}`.trim();
    } else if (mode === 'SENIOR_CALLBACK') {
      const extras: string[] = [];
      if (seniorName) extras.push(`Senior: ${seniorName}.`);
      if (Array.isArray(modeConversation?.nearby_volunteers)) extras.push(`Nearby volunteers considered: ${modeConversation.nearby_volunteers.length}.`);
      systemMessage = `${systemMessage} ${extras.join(' ')}`.trim();
    }

    const dynamic_variables: Record<string, any> = {};

    const conversation_config_override = {
      agent: {
        prompt: { prompt: systemMessage },
        first_message: firstMessage,
        language: 'en',
      },
    } as any;

    return res.status(200).json({
      type: 'conversation_initiation_client_data',
      dynamic_variables,
      conversation_config_override,
    });
  } catch (e: any) {
    console.error('personalization webhook error:', e);
    return res.status(200).json({ success: false, error: { code: 'INTERNAL_ERROR', message: e.message } });
  }
});

// 2b) UI compatibility routes (used by existing SeniorPortal)
app.get('/api/volunteers', async (_req, res) => {
  console.log('AGENT TOOL: getVolunteers');
  try {
    const volunteers = await prisma.volunteer.findMany({
      select: { id: true, first_name: true, last_name: true, phone_number: true, email: true, bio: true, zip_code: true, background_check_status: true, is_active: true, created_at: true },
      orderBy: { id: 'desc' },
    });
    res.json(volunteers);
  } catch (e: any) {
    console.error('GET /api/volunteers error:', e);
    res.status(500).json({ error: e.message || 'Internal error' });
  }
});

app.get('/api/volunteers/nearby/:zip', (req, res) => {
  console.log('AGENT TOOL: getVolunteersNearby');
  const { zip } = req.params;
  const radius = Number(req.query.radius ?? 10);
  if (!zip) return res.status(400).json({ error: 'zip is required' });
  if (!Number.isFinite(radius) || radius <= 0) return res.status(400).json({ error: 'radius must be a positive number' });
  try {
    const nearbyZips = zipcodes.radius(zip, radius) as string[];
    res.json(nearbyZips);
  } catch (e: any) {
    console.error('GET /api/volunteers/nearby error:', e);
    res.status(400).json({ error: 'Invalid zip provided' });
  }
});

// 3) Log call attempt outcome
const logCallSchema = z.object({
  senior_id: z.coerce.number().int(),
  volunteer_id: z.coerce.number().int(),
  outcome: z.enum(['VOICEMAIL', 'DECLINED', 'NO_ANSWER', 'ACCEPTED']),
  notes: z.string().optional(),
});

app.post('/api/agent/log-call-outcome', async (req, res) => {
  console.log('AGENT TOOL: logCallOutcome');
  const parsed = logCallSchema.safeParse(req.body);
  if (!parsed.success) return res.status(200).json({ success: false, error: { code: 'INVALID_BODY', message: 'Invalid request body', details: parsed.error.issues } });
  const { senior_id, volunteer_id, outcome, notes } = parsed.data;
  try {
    const call = await prisma.callAttempt.create({
      data: {
        senior_id,
        volunteer_id,
        outcome,
        notes: notes ?? null,
      }
    });
    res.status(201).json(call);
  } catch (e: any) {
    console.error('log-call-outcome error:', e);
    res.status(200).json({ success: false, error: { code: 'INTERNAL_ERROR', message: e.message } });
  }
});

// 4) Schedule appointment (after acceptance)
const scheduleSchema = z.object({
  senior_id: z.coerce.number().int(),
  volunteer_id: z.coerce.number().int(),
  appointment_datetime: z.string().datetime(),
  notes_for_volunteer: z.string().optional(),
  location: z.string().optional(),
});

app.post('/api/agent/schedule-appointment', async (req, res) => {
  console.log('AGENT TOOL: scheduleAppointment');
  const result = scheduleSchema.safeParse(req.body);
  if (!result.success) return res.status(200).json({ success: false, error: { code: 'INVALID_BODY', message: 'Invalid request body', details: result.error.issues } });
  
  const { senior_id, volunteer_id, appointment_datetime, notes_for_volunteer, location } = result.data;
  try {
    let locationText: string | null = location ?? null;
    if (!locationText) {
      const addr = await prisma.senior.findUnique({
        where: { id: senior_id },
        select: { street_address: true, city: true, state: true, zip_code: true },
      });
      if (addr) {
        const parts = [addr.street_address, addr.city, addr.state, addr.zip_code].filter(Boolean);
        locationText = parts.length ? parts.join(', ') : null;
      }
    }

    const appt = await prisma.appointment.create({
      data: {
        senior_id,
        volunteer_id,
        appointment_datetime,
        location: locationText,
        status: 'Scheduled',
        notes_for_volunteer,
      }
    });
    res.status(201).json(appt);
  } catch (e: any) {
    console.error('schedule-appointment error:', e);
    res.status(200).json({ success: false, error: { code: 'INTERNAL_ERROR', message: e.message } });
  }
});

// 5) Confirm appointment (after volunteer verbally agrees)
const confirmSchema = z.object({ appointment_id: z.coerce.number().int() });
app.post('/api/agent/confirm-appointment', async (req, res) => {
  console.log('AGENT TOOL: confirmAppointment');
  const parsed = confirmSchema.safeParse(req.body);
  if (!parsed.success) return res.status(200).json({ success: false, error: { code: 'INVALID_BODY', message: 'Invalid request body', details: parsed.error.issues } });
  try {
    const updated = await prisma.appointment.update({
      where: { id: parsed.data.appointment_id },
      data: { status: 'Confirmed' },
    });
    if (!updated) return res.status(200).json({ success: false, error: { code: 'NOT_FOUND', message: 'Appointment not found' } });
    res.json(updated);
  } catch (e: any) {
    console.error('confirm-appointment error:', e);
    res.status(200).json({ success: false, error: { code: 'INTERNAL_ERROR', message: e.message } });
  }
});

// --- UI parity endpoints ---
// List appointments for a senior
app.get('/api/senior/:id/appointments', async (req, res) => {
  console.log('AGENT TOOL: getSeniorAppointments');
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid senior id' });
  try {
    const appointments = await prisma.appointment.findMany({
      where: { senior_id: id },
      include: { volunteer: { select: { first_name: true, last_name: true } } },
      orderBy: { appointment_datetime: 'desc' },
    });
    const formatted = appointments.map(a => ({
      ...a,
      volunteer_first_name: a.volunteer?.first_name,
      volunteer_last_name: a.volunteer?.last_name,
    }));
    res.json(formatted);
  } catch (e: any) {
    console.error('senior appointments error:', e);
    res.status(500).json({ error: e.message || 'Internal error' });
  }
});

// List appointments for a volunteer
app.get('/api/volunteer/:id/appointments', async (req, res) => {
  console.log('AGENT TOOL: getVolunteerAppointments');
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid volunteer id' });
  try {
    const appointments = await prisma.appointment.findMany({
      where: { volunteer_id: id },
      include: { senior: { select: { first_name: true, last_name: true } } },
      orderBy: { appointment_datetime: 'desc' },
    });
    const formatted = appointments.map(a => ({
      ...a,
      senior_first_name: a.senior?.first_name,
      senior_last_name: a.senior?.last_name,
    }));
    res.json(formatted);
  } catch (e: any) {
    console.error('volunteer appointments error:', e);
    res.status(500).json({ error: e.message || 'Internal error' });
  }
});

// Unified status update for appointments (UI + Agent)
const statusSchema = z.object({
  status: z.enum(['Requested','Scheduled','Confirmed','Declined','Cancelled','Completed'])
});
app.post('/api/appointments/:id/status', async (req, res) => {
  console.log('AGENT TOOL: updateAppointmentStatus');
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid appointment id' });
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
  try {
    const updated = await prisma.appointment.update({
      where: { id },
      data: { status: parsed.data.status },
    });
    if (!updated) return res.status(404).json({ error: 'Appointment not found' });
    res.json(updated);
  } catch (e: any) {
    console.error('update appointment status error:', e);
    res.status(500).json({ error: e.message || 'Internal error' });
  }
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

// Force JSON 404 for any unmatched route (avoid default HTML response)
app.use((req, res) => {
  const url = (req as any)?.originalUrl || (req as any)?.url || '';
  if (typeof url === 'string' && url.startsWith('/api/agent/')) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found', path: url } });
  }
  return res.status(404).json({ error: 'Not found', path: url });
});

// Global error handler to ensure stack traces are logged and JSON is returned
// Must be after routes
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const reqId = (res.locals as any)?.reqId || 'no-reqid';
  const method = req?.method || 'UNKNOWN_METHOD';
  const url = (req as any)?.originalUrl || (req as any)?.url || 'UNKNOWN_URL';
  console.error(`[${reqId}] ERROR ${method} ${url}:`, err && err.stack ? err.stack : err);
  if (res.headersSent) return;
  const isAgent = typeof url === 'string' && url.startsWith('/api/agent/');
  if (isAgent) {
    res.status(200).json({ success: false, error: { code: 'UNHANDLED_ERROR', message: err?.message || 'Unhandled error' } });
  } else {
    res.status(500).json({ error: err?.message || 'Unhandled error' });
  }
});

// Process-level safety nets so errors never disappear silently
process.on('unhandledRejection', (reason: any, promise) => {
  console.error('[process] unhandledRejection:', reason && reason.stack ? reason.stack : reason);
});
process.on('uncaughtException', (error) => {
  console.error('[process] uncaughtException:', error && error.stack ? error.stack : error);
});
