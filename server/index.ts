console.log('Server process started...');
import 'dotenv/config';
import express from 'express';
import pool from './db';
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
    await pool.$queryRaw`SELECT 1`;
    res.json({ ok: true, database: 'connected' });
  } catch (e: any) {
    console.error('[health] Health check failed:', e);
    res.status(503).json({ ok: false, database: 'disconnected', error: e.message });
  }
});

// Admin stats (UI parity)
app.get('/api/stats', async (_req, res) => {
  try {
    const seniors = await pool.query('SELECT COUNT(*) FROM seniors WHERE is_active = true');
    const volunteers = await pool.query('SELECT COUNT(*) FROM volunteers WHERE is_active = true');
    const upcoming = await pool.query(`SELECT COUNT(*) FROM appointments WHERE status IN ('Scheduled','Confirmed')`);
    const completed = await pool.query(`SELECT COUNT(*) FROM appointments WHERE status = 'Completed' AND appointment_datetime >= date_trunc('month', current_date)`);
    res.json({
      totalSeniors: parseInt(seniors.rows[0].count, 10),
      activeVolunteers: parseInt(volunteers.rows[0].count, 10),
      upcomingAppointments: parseInt(upcoming.rows[0].count, 10),
      completedThisMonth: parseInt(completed.rows[0].count, 10),
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
  const words = requestDetails.toLowerCase().split(/\s+/);
  for (const word of words) {
    if (SKILL_KEYWORDS[word]) return SKILL_KEYWORDS[word];
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
    const seniorRes = await pool.query('SELECT * FROM seniors WHERE phone_number = $1', [normalizedPhone]);
    if (!seniorRes.rows[0]) {
      return res.status(200).json({ success: false, error: { code: 'NOT_FOUND', message: 'Senior not found' } });
    }

    console.log(` -> Parsing request for skill: "${request_details}"`);
    const skillName = parseRequestForSkill(request_details);
    if (!skillName) return res.status(200).json({ success: false, error: { code: 'NO_SKILL', message: 'Could not determine skill' } });
    console.log(` -> Found skill: ${skillName}`);

    const volunteerRes = await pool.query(
      `SELECT v.id, v.first_name, v.last_name, v.phone_number, v.zip_code FROM volunteers v
       JOIN volunteer_skills vs ON v.id = vs.volunteer_id
       JOIN skills s ON vs.skill_id = s.id
       WHERE s.name = $1 AND v.is_active = true`,
      [skillName]
    );
    console.log(` -> Found ${volunteerRes.rows.length} volunteers.`);

    res.status(200).json({ success: true, data: {
      senior: seniorRes.rows[0],
      matched_skill: skillName,
      potential_volunteers: volunteerRes.rows,
    } });
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
    let zips: string[] | null = null;
    if (zip) {
      try {
        zips = zipcodes.radius(zip, radius) as string[];
      } catch (_e) {
        return res.status(200).json({ success: false, error: { code: 'INVALID_ZIP', message: 'Invalid zip provided' } });
      }
    }

    const params: any[] = [];
    let sql = `SELECT v.id, v.first_name, v.last_name, v.phone_number, v.zip_code,
                      ARRAY_AGG(s.name) as skills
               FROM volunteers v
               LEFT JOIN volunteer_skills vs ON v.id = vs.volunteer_id
               LEFT JOIN skills s ON vs.skill_id = s.id
               WHERE v.is_active = true`;
    if (skill) {
      sql += ` AND v.id IN (SELECT vs2.volunteer_id FROM volunteer_skills vs2 JOIN skills s2 ON s2.id = vs2.skill_id WHERE s2.name = $${params.length + 1})`;
      params.push(skill);
    }
    if (zips && zips.length > 0) {
      sql += ` AND v.zip_code = ANY($${params.length + 1})`;
      params.push(zips);
    }
    sql += ' GROUP BY v.id ORDER BY v.id DESC';

    const { rows } = await pool.query(sql, params);
    res.status(200).json({ success: true, data: rows });
  } catch (e: any) {
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
    let zips: string[] | null = null;
    if (zip) {
      try { zips = zipcodes.radius(zip, radius) as string[]; } catch { return res.status(200).json({ success: false, error: { code: 'INVALID_ZIP', message: 'Invalid zip provided' } }); }
    }
    const params: any[] = [];
    let sql = `SELECT v.id, v.first_name, v.last_name, v.phone_number, v.zip_code,
                      ARRAY_AGG(s.name) as skills
               FROM volunteers v
               LEFT JOIN volunteer_skills vs ON v.id = vs.volunteer_id
               LEFT JOIN skills s ON vs.skill_id = s.id
               WHERE v.is_active = true`;
    if (skill) { sql += ` AND v.id IN (SELECT vs2.volunteer_id FROM volunteer_skills vs2 JOIN skills s2 ON s2.id = vs2.skill_id WHERE s2.name = $${params.length + 1})`; params.push(skill); }
    if (zips && zips.length > 0) { sql += ` AND v.zip_code = ANY($${params.length + 1})`; params.push(zips); }
    sql += ' GROUP BY v.id ORDER BY v.id DESC';
    const { rows } = await pool.query(sql, params);
    res.status(200).json({ success: true, data: rows });
  } catch (e: any) {
    console.error('find-volunteers error:', e);
    res.status(200).json({ success: false, error: { code: 'INTERNAL_ERROR', message: e.message } });
  }
});

// Create or update a senior (upsert by phone)
const upsertSeniorSchema = z.object({
  first_name: z.string().min(1).optional(),
  last_name: z.string().min(1).optional(),
  phone_number: z.string(),
  email: z.string().optional(),
  street_address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip_code: z.string().optional(),
});

app.post('/api/agent/create-senior', async (req, res) => {
  console.log('AGENT TOOL: createSenior (upsert by phone)');
  const parsed = upsertSeniorSchema.safeParse(req.body);
  if (!parsed.success) return res.status(200).json({ success: false, error: { code: 'INVALID_BODY', message: 'Invalid request body', details: parsed.error.issues } });
  const normalized = normalizePhoneNumber(parsed.data.phone_number);
  if (!normalized) return res.status(200).json({ success: false, error: { code: 'INVALID_PHONE', message: 'Invalid phone number format.' } });
  try {
    const d = parsed.data;
    const emailClean = d.email && d.email.trim() ? d.email.trim() : null;
    const upserted = await pool.query(
      `INSERT INTO seniors (first_name, last_name, phone_number, email, street_address, city, state, zip_code, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)
       ON CONFLICT (phone_number) DO UPDATE SET
       first_name = COALESCE($2, first_name),
       last_name = COALESCE($3, last_name),
       email = COALESCE($4, email),
       street_address = COALESCE($5, street_address),
       city = COALESCE($6, city),
       state = COALESCE($7, state),
       zip_code = COALESCE($8, zip_code)
       RETURNING *`,
      [
        d.first_name ?? null,
        d.last_name ?? null,
        normalized,
        emailClean,
        d.street_address ?? null,
        d.city ?? null,
        d.state ?? null,
        d.zip_code ?? null,
      ]
    );
    return res.status(200).json({ success: true, data: upserted.rows[0], upserted: 'created_or_updated' });
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
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  email: z.string().optional(),
  street_address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip_code: z.string().optional(),
  zip: z.string().optional(),
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
    let seniorRow: any = await pool.query('SELECT * FROM seniors WHERE phone_number = $1', [normalized]);

    if (!seniorRow.rows[0] && (d.create_if_missing || d.first_name || d.last_name || d.zip_code)) {
      const emailClean = d.email && d.email.trim() ? d.email.trim() : null;
      seniorRow = await pool.query(
        `INSERT INTO seniors (first_name,last_name,phone_number,email,street_address,city,state,zip_code,is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)
         RETURNING *`,
        [d.first_name ?? null, d.last_name ?? null, normalized, emailClean, d.street_address ?? null, d.city ?? null, d.state ?? null, d.zip_code ?? null]
      );
    }

    const matchedSkill = parseRequestForSkill(d.request_details);

    const searchZip = d.zip ?? seniorRow?.rows[0]?.zip_code ?? null;
    const radius = d.radius ?? 10;
    let zips: string[] | null = null;
    if (searchZip) {
      try { zips = zipcodes.radius(searchZip, radius) as string[]; } catch { return res.status(200).json({ success: false, error: { code: 'INVALID_ZIP', message: 'Invalid zip provided' } }); }
    }

    let volunteers: any[] = [];
    if (matchedSkill) {
      const params: any[] = [matchedSkill];
      let sql = `SELECT v.id, v.first_name, v.last_name, v.phone_number, v.zip_code,
                        ARRAY_AGG(s.name) as skills
                 FROM volunteers v
                 JOIN volunteer_skills vs ON v.id = vs.volunteer_id
                 JOIN skills s ON vs.skill_id = s.id
                 WHERE v.is_active = true AND s.name = $1`;
      if (zips && zips.length > 0) { sql += ` AND v.zip_code = ANY($2)`; params.push(zips); }
      sql += ' GROUP BY v.id ORDER BY v.id DESC';
      let vols = await pool.query(sql, params);
      volunteers = vols.rows;
      if ((!volunteers || volunteers.length === 0) && searchZip) {
        for (const extra of [5, 10, 15]) {
          try {
            const expanded = zipcodes.radius(searchZip, radius + extra) as string[];
            const p2: any[] = [matchedSkill, expanded];
            let sql2 = `SELECT v.id, v.first_name, v.last_name, v.phone_number, v.zip_code,
                           ARRAY_AGG(s.name) as skills
                        FROM volunteers v
                        JOIN volunteer_skills vs ON v.id = vs.volunteer_id
                        JOIN skills s ON vs.skill_id = s.id
                        WHERE v.is_active = true AND s.name = $1 AND v.zip_code = ANY($2)
                        GROUP BY v.id ORDER BY v.id DESC`;
            const tryRes = await pool.query(sql2, p2);
            if (tryRes.rows.length > 0) { volunteers = tryRes.rows; break; }
          } catch {}
        }
      }
    }
    if (!matchedSkill || volunteers.length === 0) {
      const paramsAll: any[] = [];
      let sqlAll = `SELECT v.id, v.first_name, v.last_name, v.phone_number, v.zip_code,
                           ARRAY_AGG(s.name) as skills
                    FROM volunteers v
                    LEFT JOIN volunteer_skills vs ON v.id = vs.volunteer_id
                    LEFT JOIN skills s ON vs.skill_id = s.id
                    WHERE v.is_active = true`;
      if (zips && zips.length > 0) { sqlAll += ` AND v.zip_code = ANY($1)`; paramsAll.push(zips); }
      sqlAll += ' GROUP BY v.id ORDER BY v.id DESC';
      const allRes = await pool.query(sqlAll, paramsAll);
      volunteers = allRes.rows;
    }

    const insert = await pool.query(
      `INSERT INTO inbound_conversations (senior_id, caller_phone_number, request_details, matched_skill, nearby_volunteers, status)
       VALUES ($1,$2,$3,$4,$5,'OPEN') RETURNING *`,
      [seniorRow.rows[0]?.id ?? null, normalized, d.request_details, matchedSkill ?? null, JSON.stringify(volunteers)]
    );

    res.status(201).json({ success: true, data: {
      conversation_id: insert.rows[0].id,
      senior: seniorRow.rows[0],
      matched_skill: matchedSkill,
      volunteers,
    }});
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
    const conv = await pool.query('SELECT id FROM inbound_conversations WHERE id = $1', [d.conversation_id]);
    if (!conv.rows[0]) {
      return res.status(200).json({ success: false, error: { code: 'NOT_FOUND', message: 'Conversation not found' } });
    }
    // Validate volunteer exists
    const vol = await pool.query('SELECT id FROM volunteers WHERE id = $1', [d.volunteer_id]);
    if (!vol.rows[0]) {
      return res.status(200).json({ success: false, error: { code: 'NOT_FOUND', message: 'Volunteer not found' } });
    }
    const { rows } = await pool.query(
      `INSERT INTO conversation_calls (conversation_id, volunteer_id, outcome, notes)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [d.conversation_id, d.volunteer_id, d.outcome, d.notes ?? null]
    );
    await pool.query(`UPDATE inbound_conversations SET updated_at = NOW() WHERE id = $1`, [d.conversation_id]);
    res.status(201).json({ success: true, data: rows[0] });
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
    const conv = await pool.query('SELECT * FROM inbound_conversations WHERE id = $1', [id]);
    if (!conv.rows[0]) return res.status(200).json({ success: false, error: { code: 'NOT_FOUND', message: 'Conversation not found' } });
    const calls = await pool.query('SELECT * FROM conversation_calls WHERE conversation_id = $1 ORDER BY id DESC', [id]);
    res.status(200).json({ success: true, data: { conversation: conv.rows[0], calls: calls.rows } });
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
    const calls = await pool.query(
      `SELECT cc.volunteer_id, v.first_name, v.last_name, v.phone_number
       FROM conversation_calls cc
       JOIN volunteers v ON v.id = cc.volunteer_id
       WHERE cc.conversation_id = $1 AND cc.outcome = 'ACCEPTED'
       ORDER BY cc.id DESC`,
      [id]
    );
    res.status(200).json({ success: true, data: calls.rows });
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
    const v = await pool.query(
      `SELECT id, first_name, last_name, phone_number, email, bio, zip_code, background_check_status, is_active, created_at
       FROM volunteers WHERE id = $1`,
      [id]
    );
    if (!v.rows[0]) return res.status(200).json({ success: false, error: { code: 'NOT_FOUND', message: 'Volunteer not found' } });
    res.status(200).json({ success: true, data: v.rows[0] });
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
    const conv = await pool.query('SELECT * FROM inbound_conversations WHERE id = $1', [d.conversation_id]);
    const c = conv.rows[0];
    if (!c) return res.status(200).json({ success: false, error: { code: 'NOT_FOUND', message: 'Conversation not found' } });
    const seniorId = d.senior_id ?? c.senior_id;
    if (!seniorId) return res.status(200).json({ success: false, error: { code: 'NO_SENIOR', message: 'Senior id is required to schedule' } });

    let locationText: string | null = d.location ?? null;
    if (!locationText) {
      const addr = await pool.query('SELECT street_address, city, state, zip_code FROM seniors WHERE id = $1', [seniorId]);
      const a = addr.rows[0];
      if (a) {
        const parts = [a.street_address, a.city, a.state, a.zip_code].filter(Boolean);
        locationText = parts.length ? parts.join(', ') : null;
      }
    }

    const appt = await pool.query(
      `INSERT INTO appointments (senior_id, volunteer_id, appointment_datetime, location, status, notes_for_volunteer)
       VALUES ($1,$2,$3,$4,'Scheduled',$5) RETURNING *`,
      [seniorId, d.chosen_volunteer_id, d.appointment_datetime, locationText, d.notes_for_volunteer ?? null]
    );
    await pool.query(
      `UPDATE inbound_conversations SET scheduled_appointment_id = $2, status = 'SCHEDULED', updated_at = NOW() WHERE id = $1`,
      [d.conversation_id, appt.rows[0].id]
    );
    res.status(201).json({ success: true, data: appt.rows[0] });
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
    const conv = await pool.query('SELECT * FROM inbound_conversations WHERE id = $1', [conversation_id]);
    if (!conv.rows[0]) return res.status(200).json({ success: false, error: { code: 'NOT_FOUND', message: 'Conversation not found' } });
    const volunteer = await pool.query('SELECT id, first_name, last_name, phone_number FROM volunteers WHERE id = $1', [volunteer_id]);
    if (!volunteer.rows[0]) return res.status(200).json({ success: false, error: { code: 'NOT_FOUND', message: 'Volunteer not found' } });

    const dialNumber = to_number || volunteer.rows[0].phone_number;
    const url = 'https://api.elevenlabs.io/v1/convai/twilio/outbound-call';
    const payload = { agent_id: agentId, agent_phone_number_id: phoneNumberId, to_number: dialNumber };
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
    await pool.query(
      `INSERT INTO conversation_calls (conversation_id, volunteer_id, outcome, notes, call_sid, role)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [conversation_id, volunteer_id, 'PENDING', null, data?.callSid ?? null, 'VOLUNTEER']
    );

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
    const conv = await pool.query('SELECT * FROM inbound_conversations WHERE id = $1', [conversation_id]);
    const c = conv.rows[0];
    if (!c) return res.status(200).json({ success: false, error: { code: 'NOT_FOUND', message: 'Conversation not found' } });
    const sid = senior_id ?? c.senior_id;
    if (!sid) return res.status(200).json({ success: false, error: { code: 'NO_SENIOR', message: 'Senior id/number required' } });
    const s = await pool.query('SELECT id, first_name, last_name, phone_number FROM seniors WHERE id = $1', [sid]);
    const sres = s.rows[0];
    if (!sres) return res.status(200).json({ success: false, error: { code: 'NOT_FOUND', message: 'Senior not found' } });
    const dialNumber = to_number || sres.phone_number;

    const url = 'https://api.elevenlabs.io/v1/convai/twilio/outbound-call';
    const payload = { agent_id: agentId, agent_phone_number_id: phoneNumberId, to_number: dialNumber };
    console.log('[XI] outbound-callback-senior -> request', { url, payload, headers: { 'xi-api-key': `***${String(xiApiKey).slice(-4)}` } });
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'xi-api-key': xiApiKey as string, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    console.log('[XI] outbound-callback-senior <- response', { ok: response.ok, status: response.status, bodyPreview: text.slice(0, 2000) });
    let data: any; try { data = JSON.parse(text); } catch { data = { raw: text }; }

    await pool.query(
      `INSERT INTO conversation_calls (conversation_id, volunteer_id, outcome, notes, call_sid, role)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [conversation_id, 0, 'PENDING', null, data?.callSid ?? null, 'SENIOR_CALLBACK']
    );

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
      const s = await pool.query('SELECT id, first_name, last_name, street_address, city, state, zip_code FROM seniors WHERE phone_number = $1', [normalizedCaller]);
      seniorRow = s.rows[0] || null;
    } catch {}

    let conversation: any = null;
    if (d.conversation_id) {
      const c = await pool.query('SELECT * FROM inbound_conversations WHERE id = $1', [d.conversation_id]);
      conversation = c.rows[0] || null;
    }

    let volunteer: any = null;
    if (d.volunteer_id) {
      const v = await pool.query('SELECT id, first_name, last_name, phone_number, zip_code FROM volunteers WHERE id = $1', [d.volunteer_id]);
      volunteer = v.rows[0] || null;
    }

    // Auto-derive mode and context from call_sid if available
    let mode = d.mode || 'INBOUND';
    let conversationFromCall: any = null;
    let volunteerFromCall: any = null;
    try {
      const cc = await pool.query('SELECT * FROM conversation_calls WHERE call_sid = $1 LIMIT 1', [d.call_sid]);
      if (cc.rows[0]) {
        const ccall = cc.rows[0];
        const conv = await pool.query('SELECT * FROM inbound_conversations WHERE id = $1', [ccall.conversation_id]);
        conversationFromCall = conv.rows[0] || null;
        if (ccall.role === 'VOLUNTEER') mode = 'VOLUNTEER_OUTBOUND';
        if (ccall.role === 'SENIOR_CALLBACK') mode = 'SENIOR_CALLBACK';
        const vol = await pool.query('SELECT id, first_name, last_name, phone_number, zip_code FROM volunteers WHERE id = $1', [ccall.volunteer_id]);
        volunteerFromCall = vol.rows[0] || null;
      }
    } catch {}

    const modeConversation = conversationFromCall || (d.conversation_id ? (await pool.query('SELECT * FROM inbound_conversations WHERE id = $1', [d.conversation_id])).rows[0] : null) || null;
    const modeVolunteer = volunteerFromCall || (d.volunteer_id ? (await pool.query('SELECT id, first_name, last_name, phone_number, zip_code FROM volunteers WHERE id = $1', [d.volunteer_id])).rows[0] : null) || null;
    const modePrompts: Record<string, string> = {
      INBOUND: 'You are the CareShare assistant for inbound senior calls. 1) Greet warmly. 2) If caller_id is available, DO NOT ask for the phone number; instead, repeat it back and confirm before proceeding. 3) Confirm identity and key profile details even if a record exists. 4) Gather the task details, preferred date/time, constraints, and confirm the zip code. DO NOT ask the senior for a search radius; the system handles radius automatically (and may expand it). If the senior\'s address is missing or incomplete, POLITELY COLLECT street address, city, state, and zip; if it exists, do not re-ask. 5) Interpret phrases like "today" and "tomorrow" using the provided current time/timezone. 6) IMPORTANT: CALL startInboundConversation exactly once with caller_phone_number and request_details to create the conversation and store nearby volunteers. 7) DO NOT call logVolunteerCall, finalizeConversation, scheduleAppointment, confirmAppointment, updateAppointmentStatus, or outbound-call endpoints during inbound. 8) NEVER mention internal IDs, tool names, or technical terms to the senior (e.g., do not say "conversation_id"). 9) Close by telling the senior they will be contacted once a volunteer accepts.',
      VOLUNTEER_OUTBOUND: 'You are the CareShare assistant calling a volunteer. Briefly describe the senior\'s request, the needed skill, and proposed timing. Ask if they are available and willing. If voicemail, politely hang up. DO NOT schedule or finalize during this call. After the call, log the outcome using logVolunteerCall. Forbidden this call: startInboundConversation, finalizeConversation, scheduleAppointment, confirmAppointment. NEVER mention internal IDs/tool names to the volunteer.',
      SENIOR_CALLBACK: 'You are calling the senior back with results. Present only volunteers who ACCEPTED (from getAcceptedVolunteers). Ask the senior to choose one. When they choose, schedule using finalizeConversation (with the chosen volunteer) and then confirmAppointment. Forbidden this call: startInboundConversation, logVolunteerCall. NEVER mention internal IDs/tool names to the senior.',
    };
    const modeFirstMessages: Record<string, string> = {
      INBOUND: 'Hello! How can I help you today?',
      VOLUNTEER_OUTBOUND: 'Hello, this is CareShare. I\'m calling regarding a request we received.',
      SENIOR_CALLBACK: 'Hello again, this is CareShare. I have some options for you.',
    };
    let systemMessage = modePrompts[mode] || modePrompts.INBOUND;
    const firstMessage = modeFirstMessages[mode] || modeFirstMessages.INBOUND;

    // Enrich system message with available context to reduce need for many variables
    const seniorName = seniorRow ? `${seniorRow.first_name ?? ''} ${seniorRow.last_name ?? ''}`.trim() : null;
    if (mode === 'INBOUND') {
      const extras: string[] = [];
      extras.unshift('Use MCP tools only. Do not make HTTP requests or non-MCP tools.');
      extras.unshift('Allowed tools this call: createSenior, startInboundConversation.');
      const nowIso = new Date().toISOString();
      const tz = 'America/New_York';
      extras.push(`Current time (UTC): ${nowIso}. Timezone: ${tz}. Caller phone: ${normalizedCaller}.`);
      if (seniorName) extras.push(`Possible match on file: ${seniorName} (id ${seniorRow.id}). Confirm identity before proceeding.`);
      if (seniorRow && (!seniorRow.street_address || !seniorRow.city || !seniorRow.state || !seniorRow.zip_code)) {
        extras.push('Address appears incomplete or missing; politely collect street address, city, state, zip, then update the record using createSenior (upsert by phone).');
      }
      if (modeConversation?.matched_skill) extras.push(`Parsed skill (if mentioned): ${modeConversation.matched_skill}.`);
      systemMessage = `${systemMessage} ${extras.join(' ')}`.trim();
    } else if (mode === 'VOLUNTEER_OUTBOUND') {
      const volName = volunteer ? `${volunteer.first_name ?? ''} ${volunteer.last_name ?? ''}`.trim() : null;
      const extras: string[] = [];
      extras.unshift('Use MCP tools only. Do not make HTTP requests or non-MCP tools.');
      extras.unshift('Allowed tools this call: logVolunteerCall, getVolunteer (optional), getConversation (optional).');
      if (seniorName) extras.push(`Senior: ${seniorName}.`);
      const volName2 = modeVolunteer ? `${modeVolunteer.first_name ?? ''} ${modeVolunteer.last_name ?? ''}`.trim() : volName;
      if (volName2) extras.push(`Volunteer: ${volName2}.`);
      if (modeConversation?.matched_skill) extras.push(`Skill/Task: ${modeConversation.matched_skill}.`);
      systemMessage = `${systemMessage} ${extras.join(' ')}`.trim();
    } else if (mode === 'SENIOR_CALLBACK') {
      const extras: string[] = [];
      extras.unshift('Use MCP tools only. Do not make HTTP requests or non-MCP tools.');
      extras.unshift('Allowed tools this call: getAcceptedVolunteers, finalizeConversation, confirmAppointment, getConversation (optional).');
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
    const { rows } = await pool.query(
      `SELECT id, first_name, last_name, phone_number, email, bio, zip_code, background_check_status, is_active, created_at
       FROM volunteers
       ORDER BY id DESC`
    );
    res.json(rows);
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
    const { rows } = await pool.query(
      `INSERT INTO call_attempts (senior_id, volunteer_id, outcome, notes)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [senior_id, volunteer_id, outcome, notes ?? null]
    );
    res.status(201).json(rows[0]);
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
      const addr = await pool.query(
        'SELECT street_address, city, state, zip_code FROM seniors WHERE id = $1',
        [senior_id]
      );
      const a = addr.rows[0];
      if (a) {
        const parts = [a.street_address, a.city, a.state, a.zip_code].filter(Boolean);
        locationText = parts.length ? parts.join(', ') : null;
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO appointments (senior_id, volunteer_id, appointment_datetime, location, status, notes_for_volunteer)
       VALUES ($1, $2, $3, $4, 'Scheduled', $5) RETURNING *`,
      [senior_id, volunteer_id, appointment_datetime, locationText, notes_for_volunteer]
    );
    res.status(201).json(rows[0]);
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
    const { rows } = await pool.query(
      `UPDATE appointments SET status = 'Confirmed' WHERE id = $1 RETURNING *`,
      [parsed.data.appointment_id]
    );
    if (!rows[0]) return res.status(200).json({ success: false, error: { code: 'NOT_FOUND', message: 'Appointment not found' } });
    res.json(rows[0]);
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
    const { rows } = await pool.query(
      `SELECT a.*, v.first_name AS volunteer_first_name, v.last_name AS volunteer_last_name
       FROM appointments a
       LEFT JOIN volunteers v ON v.id = a.volunteer_id
       WHERE a.senior_id = $1
       ORDER BY a.appointment_datetime DESC`,
      [id]
    );
    res.json(rows);
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
    const { rows } = await pool.query(
      `SELECT a.*, s.first_name AS senior_first_name, s.last_name AS senior_last_name
       FROM appointments a
       LEFT JOIN seniors s ON s.id = a.senior_id
       WHERE a.volunteer_id = $1
       ORDER BY a.appointment_datetime DESC`,
      [id]
    );
    res.json(rows);
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
    const { rows } = await pool.query(
      `UPDATE appointments SET status = $1 WHERE id = $2 RETURNING *`,
      [parsed.data.status, id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Appointment not found' });
    res.json(rows[0]);
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
