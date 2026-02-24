require('dotenv').config();
const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_BLOCKS = 1600;
const MAX_EDITS = 5;

// Trust proxy (needed for Railway/Render so req.ip returns real client IP)
app.set('trust proxy', 1);

// --- Supabase Setup ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('\n  ERROR: Missing SUPABASE_URL or SUPABASE_KEY in .env file.\n');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- Rate Limiting (in-memory) ---
const rateLimits = new Map();

function checkRateLimit(ip, limit = 5, windowMs = 60000) {
  const now = Date.now();
  if (!rateLimits.has(ip)) rateLimits.set(ip, []);
  const requests = rateLimits.get(ip).filter(t => t > now - windowMs);
  rateLimits.set(ip, requests);
  if (requests.length >= limit) return false;
  requests.push(now);
  return true;
}

// Clean up old rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, times] of rateLimits) {
    const valid = times.filter(t => t > now - 60000);
    if (valid.length === 0) rateLimits.delete(ip);
    else rateLimits.set(ip, valid);
  }
}, 300000);

// --- Middleware ---
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- API Routes ---

// Get all blocks
app.get('/api/blocks', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('blocks')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('GET /api/blocks error:', err.message);
    res.status(500).json({ error: 'Could not load wall.' });
  }
});

// Add or update a block
app.post('/api/blocks', async (req, res) => {
  if (!checkRateLimit(req.ip)) {
    return res.status(429).json({ error: 'Troppe richieste. Riprova tra un minuto.' });
  }

  const { normie_id, message } = req.body;

  // Validate normie_id
  const id = parseInt(normie_id);
  if (isNaN(id) || id < 0 || id > 9999) {
    return res.status(400).json({ error: 'Normie ID deve essere tra 0 e 9999.' });
  }

  // Validate message
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'Il messaggio non può essere vuoto.' });
  }
  if (message.trim().length > 100) {
    return res.status(400).json({ error: 'Il messaggio non può superare i 100 caratteri.' });
  }

  // Verify normie exists via external API
  try {
    const response = await fetch(`https://api.normies.art/normie/${id}/metadata`);
    if (!response.ok) {
      return res.status(404).json({ error: `Normie #${id} non trovato.` });
    }
  } catch (err) {
    return res.status(502).json({ error: 'Impossibile verificare il Normie. Riprova.' });
  }

  try {
    // Check if block already exists
    const { data: existing } = await supabase
      .from('blocks')
      .select('*')
      .eq('normie_id', id)
      .maybeSingle();

    if (existing) {
      // Update existing block — check edit limit
      const editCount = existing.edit_count || 0;
      if (editCount >= MAX_EDITS) {
        return res.status(403).json({ error: 'This message is now permanent. No more edits allowed.' });
      }

      const { data: updated, error } = await supabase
        .from('blocks')
        .update({
          message: message.trim(),
          edit_count: editCount + 1
        })
        .eq('normie_id', id)
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json(updated);
    } else {
      // New block — check wall capacity
      const { count, error: countErr } = await supabase
        .from('blocks')
        .select('*', { count: 'exact', head: true });

      if (countErr) throw countErr;

      if (count >= MAX_BLOCKS) {
        return res.status(403).json({ error: 'The wall is full. No more messages can be added.' });
      }

      const { data: created, error } = await supabase
        .from('blocks')
        .insert({
          normie_id: id,
          message: message.trim(),
          edit_count: 0
        })
        .select()
        .single();

      if (error) throw error;
      return res.status(201).json(created);
    }
  } catch (err) {
    console.error('POST /api/blocks error:', err.message);
    res.status(500).json({ error: 'Errore durante il salvataggio.' });
  }
});

// --- Proxy Routes (avoid CORS issues with Normies API) ---

// Validate Normie ID for proxy routes
function validateNormieId(req, res) {
  const id = parseInt(req.params.id);
  if (isNaN(id) || id < 0 || id > 9999) {
    res.status(400).json({ error: 'Invalid Normie ID.' });
    return null;
  }
  return id;
}

app.get('/api/normie/:id/image', async (req, res) => {
  const id = validateNormieId(req, res);
  if (id === null) return;

  try {
    const response = await fetch(`https://api.normies.art/normie/${id}/image.svg`);
    if (!response.ok) return res.status(response.status).send('Not found');
    const svg = await response.text();
    res.set('Content-Type', 'image/svg+xml');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(svg);
  } catch {
    res.status(502).send('Could not fetch image');
  }
});

app.get('/api/normie/:id/metadata', async (req, res) => {
  const id = validateNormieId(req, res);
  if (id === null) return;

  try {
    const response = await fetch(`https://api.normies.art/normie/${id}/metadata`);
    if (!response.ok) return res.status(response.status).json({ error: 'Not found' });
    const data = await response.json();
    res.set('Cache-Control', 'public, max-age=86400');
    res.json(data);
  } catch {
    res.status(502).json({ error: 'Could not fetch metadata' });
  }
});

app.get('/api/normie/:id/traits', async (req, res) => {
  const id = validateNormieId(req, res);
  if (id === null) return;

  try {
    const response = await fetch(`https://api.normies.art/normie/${id}/traits`);
    if (!response.ok) return res.status(response.status).json({ error: 'Not found' });
    const data = await response.json();
    res.set('Cache-Control', 'public, max-age=86400');
    res.json(data);
  } catch {
    res.status(502).json({ error: 'Could not fetch traits' });
  }
});

// --- Start Server ---
app.listen(PORT, () => {
  console.log('');
  console.log('  ██╗    ██╗ █████╗ ██╗     ██╗');
  console.log('  ██║    ██║██╔══██╗██║     ██║');
  console.log('  ██║ █╗ ██║███████║██║     ██║');
  console.log('  ██║███╗██║██╔══██║██║     ██║');
  console.log('  ╚███╔███╔╝██║  ██║███████╗███████╗');
  console.log('   ╚══╝╚══╝ ╚═╝  ╚═╝╚══════╝╚══════╝');
  console.log('      MESSAGES FROM NORMIES');
  console.log('');
  console.log(`  Server:   http://localhost:${PORT}`);
  console.log(`  Supabase: Connected`);
  console.log('');
});
