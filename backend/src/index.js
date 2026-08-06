const BADGE_MAX_BYTES = 1024 * 1024; // 1 MB

const BADGE_SIGNATURES = [
  { ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], type: 'image/png' },
  { ext: 'gif', magic: [0x47, 0x49, 0x46, 0x38], type: 'image/gif' },
  { ext: 'jpg', magic: [0xff, 0xd8, 0xff], type: 'image/jpeg' },
];

// Return { ext, type } when the uploaded bytes start with a known image
// signature, otherwise null. Extensions are never trusted — magic bytes are.
function detectBadgeType(bytes) {
  for (const sig of BADGE_SIGNATURES) {
    if (bytes.length < sig.magic.length) continue;
    let ok = true;
    for (let i = 0; i < sig.magic.length; i++) {
      if (bytes[i] !== sig.magic[i]) { ok = false; break; }
    }
    if (ok) return sig;
  }
  return null;
}

// Deterministic key per site so re-uploading a badge overwrites the same
// object and the stored URL never has to change (no git churn on updates).
function badgeKey(site, ext) {
  const clean = String(site || '').replace(/\/+$/, '').toLowerCase();
  let h = 2166136261;
  for (let i = 0; i < clean.length; i++) {
    h ^= clean.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return 'badges/' + (h >>> 0).toString(36) + '.' + ext;
}

// Shared body parsing for join/update: accept multipart (file upload) or a
// plain JSON payload (older clients). Returns { fields, fileBytes }.
async function parseBadgeForm(request) {
  const type = (request.headers.get('content-type') || '').toLowerCase();
  if (type.startsWith('multipart/form-data')) {
    const form = await request.formData();
    const fields = {};
    for (const key of form.keys()) {
      const value = form.get(key);
      if (typeof value === 'string') fields[key] = value;
    }
    const file = form.get('badgeFile');
    let fileBytes = null;
    if (file && typeof file.arrayBuffer === 'function') {
      fileBytes = new Uint8Array(await file.arrayBuffer());
    }
    return { fields, fileBytes };
  }
  const fields = await request.json();
  return { fields, fileBytes: null };
}

function mimeForType(type) {
  return type;
}

// Best-effort geocode of a free-typed location via Nominatim (OSM).
// Returns { lat, lng, name, state } or null when it can't resolve.
async function geocodeLocation(location) {
  try {
    const q = encodeURIComponent(String(location).trim() + ', India');
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=in&accept-language=en`,
      { headers: { 'User-Agent': 'srm-ncr-webring-worker/1.0' } }
    );
    if (!res.ok) return null;
    const body = await res.json();
    if (!body || !body.length) return null;
    const first = body[0];
    const parts = (first.display_name || '').split(',').map(s => s.trim()).filter(Boolean);
    return {
      lat: parseFloat(first.lat),
      lng: parseFloat(first.lon),
      name: parts[0] || String(location).trim(),
      state: parts.length > 1 ? parts[1] : '',
    };
  } catch (err) {
    return null;
  }
}

export default {
  async fetch(request, env, ctx) {
    // ── CORS HEADERS ────────────────────────────────
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const OWNER = 'io-PEAK';
    const REPO = 'srm-ncr-webring';
    const ghHeaders = {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'srm-ncr-webring-worker',
    };

    try {
      // ── MEMBERS API (public read of data/members.json) ──
      if (url.pathname === '/api/members') {
        if (request.method !== 'GET') {
          return new Response('Method not allowed', { status: 405, headers: corsHeaders });
        }
        const ghRes = await fetch(
          `https://api.github.com/repos/${OWNER}/${REPO}/contents/data/members.json`,
          { headers: ghHeaders }
        );
        if (!ghRes.ok) {
          return new Response(JSON.stringify({ error: 'Failed to read members.json' }), {
            status: 502,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }
        const file = await ghRes.json();
        const cleaned = (file.content || '').replace(/\s/g, '');
        const decoded = atob(cleaned);
        const members = JSON.parse(decoded);
        return new Response(JSON.stringify(members), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=60',
            ...corsHeaders,
          },
        });
      }

      // ── BADGE SERVE (public read of KV) ──────────────
      if (url.pathname.startsWith('/badges/')) {
        if (request.method !== 'GET') {
          return new Response('Method not allowed', { status: 405, headers: corsHeaders });
        }
        const key = decodeURIComponent(url.pathname.slice(1));
        const value = await env.BADGE_STORE.get(key, 'arrayBuffer');
        if (value === null) {
          return new Response('Not found', { status: 404, headers: corsHeaders });
        }
        const contentType =
          key.endsWith('.png') ? 'image/png' :
          key.endsWith('.gif') ? 'image/gif' :
          key.endsWith('.jpg') ? 'image/jpeg' :
          'application/octet-stream';
        return new Response(value, {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=3600',
            ...corsHeaders,
          },
        });
      }

      // ── ENQUIRY ROUTE ──────────────────────────────
      if (url.pathname === '/enquiry') {
        if (request.method !== 'POST') {
          return new Response('Method not allowed', { status: 405, headers: corsHeaders });
        }
        const data = await request.json();

        const issueRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/issues`, {
          method: 'POST',
          headers: ghHeaders,
          body: JSON.stringify({
            title: `Enquiry: ${data.type} — ${data.name}`,
            body: `**Type:** ${data.type}\n**Name:** ${data.name}\n**Email:** ${data.email}\n**Details:**\n${data.details}`,
            labels: ['enquiry'],
          }),
        });
        const issue = await issueRes.json();

        return new Response(JSON.stringify({ success: true, issueUrl: issue.html_url }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      // ── EMAIL LOOKUP ROUTE (GitHub Actions only) ──
      if (url.pathname === '/email-lookup') {
        if (request.method !== 'GET') {
          return new Response('Method not allowed', { status: 405, headers: corsHeaders });
        }
        
        // Authorization check
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || authHeader !== `Bearer ${env.LOOKUP_SECRET}`) {
          return new Response('Unauthorized', { status: 401, headers: corsHeaders });
        }

        const site = url.searchParams.get('site');
        if (!site) {
          return new Response('Missing site parameter', { status: 400, headers: corsHeaders });
        }

        const rawData = await env.EMAIL_STORE.get(site);
        if (!rawData) {
          return new Response(JSON.stringify({ error: 'Not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        return new Response(rawData, {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // ── EMAIL NOTIFICATION ROUTE (Actions or Admin) ──
      if (url.pathname === '/notify') {
        if (request.method !== 'POST') {
          return new Response('Method not allowed', { status: 405, headers: corsHeaders });
        }

        // Authorization check
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || authHeader !== `Bearer ${env.LOOKUP_SECRET}`) {
          return new Response('Unauthorized', { status: 401, headers: corsHeaders });
        }

        const { site, type } = await request.json();
        if (!site || !type) {
          return new Response('Missing parameters', { status: 400, headers: corsHeaders });
        }

        // Get student emails from KV
        const rawData = await env.EMAIL_STORE.get(site);
        if (!rawData) {
          return new Response(JSON.stringify({ success: false, error: 'Email details not found in KV store' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        const member = JSON.parse(rawData);
        const collegeEmail = member.collegeEmail;
        const personalEmail = member.personalEmail;
        const recipientName = member.name;

        // Email content templates
        let subject = '';
        let htmlContent = '';

        const senderEmail = env.SENDER_EMAIL || 'webring@srmncr.edu.in';

        if (type === 'warning') {
          subject = '[ACTION REQUIRED] Your site is unreachable — SRM^NCR WebRing';
          htmlContent = `
            <div style="font-family: monospace; padding: 20px; background-color: #111; color: #fff; border: 1px solid #333; border-radius: 8px;">
              <h2 style="color: #6fb3ff; border-bottom: 1px solid #333; padding-bottom: 10px;">SRM<sup>NCR</sup> WebRing Alert</h2>
              <p>Hi <strong>${recipientName}</strong>,</p>
              <p>During our automated checks, we were unable to reach your website: <a href="${site}" style="color: #6fb3ff;">${site}</a>.</p>
              <p>Your site has been marked as <strong>hidden</strong> and is temporarily excluded from the WebRing navigation and directory to keep things running smoothly for visitors.</p>
              <div style="background-color: #222; border-left: 4px solid #ffcc00; padding: 15px; margin: 20px 0;">
                <strong>[WARNING]</strong> Your site has been down for <strong>10 days</strong>. If it remains unreachable for 5 more days (15 days total), your entry will be permanently removed from the WebRing.
              </div>
              <p>Once your website is back online, our 3-day health check will automatically restore your site to the active ring. No manual action is needed.</p>
              <p>Best regards,<br>SRM^NCR WebRing Bot</p>
            </div>
          `;
        } else if (type === 'removal') {
          subject = 'Website removed from SRM^NCR WebRing';
          htmlContent = `
            <div style="font-family: monospace; padding: 20px; background-color: #111; color: #fff; border: 1px solid #333; border-radius: 8px;">
              <h2 style="color: #ff5555; border-bottom: 1px solid #333; padding-bottom: 10px;">SRM<sup>NCR</sup> WebRing Update</h2>
              <p>Hi <strong>${recipientName}</strong>,</p>
              <p>Your website (<a href="${site}" style="color: #6fb3ff;">${site}</a>) has been unreachable for <strong>15 days</strong>.</p>
              <p>As per the webring rules, your entry has been permanently removed from the <code>members.json</code> file.</p>
              <p>If this was a mistake or your site is back up, you are welcome to submit a new join request at the site: <a href="https://io-PEAK.github.io/srm-ncr-webring/join.html" style="color: #6fb3ff;">Join Again</a>.</p>
              <p>Best regards,<br>SRM^NCR WebRing Bot</p>
            </div>
          `;
        } else if (type === 'graduation') {
          subject = 'Congratulations on your graduation! — SRM^NCR WebRing';
          htmlContent = `
            <div style="font-family: monospace; padding: 20px; background-color: #111; color: #fff; border: 1px solid #333; border-radius: 8px;">
              <h2 style="color: #6fb3ff; border-bottom: 1px solid #333; padding-bottom: 10px;">SRM<sup>NCR</sup> WebRing Graduation</h2>
              <p>Hi <strong>${recipientName}</strong>,</p>
              <p>Happy graduation! We noticed your graduation date grace period (30 days) has passed.</p>
              <p>To keep the ring active for current students, your site (<a href="${site}" style="color: #6fb3ff;">${site}</a>) has been automatically removed from the directory.</p>
              <p>Thank you for being part of the SRM^NCR WebRing community. We wish you all the best in your post-college journey!</p>
              <p>Best regards,<br>SRM^NCR WebRing Bot</p>
            </div>
          `;
        } else {
          return new Response('Invalid notification type', { status: 400, headers: corsHeaders });
        }

        // Send email via Brevo REST API
        const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'api-key': env.BREVO_API_KEY,
            'content-type': 'application/json',
            'accept': 'application/json'
          },
          body: JSON.stringify({
            sender: { name: 'SRM^NCR WebRing', email: senderEmail },
            to: [
              { email: collegeEmail, name: recipientName },
              { email: personalEmail, name: recipientName }
            ],
            subject: subject,
            htmlContent: htmlContent
          })
        });

        const brevoResult = await brevoRes.json();

        return new Response(JSON.stringify({ success: brevoRes.ok, brevo: brevoResult }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // ── UPDATE BADGE ROUTE (overwrite KV value for an existing site) ──
      if (url.pathname === '/update-badge') {
        if (request.method !== 'POST') {
          return new Response('Method not allowed', { status: 405, headers: corsHeaders });
        }
        const { fields, fileBytes } = await parseBadgeForm(request);
        const site = (fields.site || '').trim();
        if (!site) {
          return new Response(JSON.stringify({ success: false, error: 'Missing site parameter' }), {
            status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        if (!fileBytes) {
          return new Response(JSON.stringify({ success: false, error: 'Missing badgeFile' }), {
            status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        const sig = detectBadgeType(fileBytes);
        if (!sig) {
          return new Response(JSON.stringify({ success: false, error: 'Badge must be a PNG, GIF, or JPEG image' }), {
            status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        if (fileBytes.byteLength > BADGE_MAX_BYTES) {
          return new Response(JSON.stringify({ success: false, error: 'Badge is too large (max 1 MB)' }), {
            status: 413, headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        const key = badgeKey(site, sig.ext);
        await env.BADGE_STORE.put(key, fileBytes);
        return new Response(JSON.stringify({ success: true, badgeUrl: url.origin + '/' + key }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // ── JOIN ROUTE (Modified to store emails in KV and strip them) ──
      if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405, headers: corsHeaders });
      }

      const { fields: rawFields, fileBytes } = await parseBadgeForm(request);

      const entry = {
        name: (rawFields.name || '').trim(),
        website: (rawFields.website || '').trim(),
        program: (rawFields.program || '').trim(),
        gradDate: (rawFields.gradDate || '').trim(),
        collegeEmail: (rawFields.collegeEmail || '').trim(),
        personalEmail: (rawFields.personalEmail || '').trim(),
        location: (rawFields.location || '').trim(),
      };

      if (!entry.name || !entry.website || !entry.program || !entry.location) {
        return new Response(JSON.stringify({ success: false, error: 'Name, website, program, and location are required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // Validate presence of emails
      if (!entry.collegeEmail || !entry.personalEmail) {
        return new Response(JSON.stringify({ success: false, error: 'Emails are required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // Badge: prefer an uploaded image (stored in KV), fall back to a plain URL
      if (fileBytes) {
        const sig = detectBadgeType(fileBytes);
        if (!sig) {
          return new Response(JSON.stringify({ success: false, error: 'Badge must be a PNG, GIF, or JPEG image' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        if (fileBytes.byteLength > BADGE_MAX_BYTES) {
          return new Response(JSON.stringify({ success: false, error: 'Badge is too large (max 1 MB)' }), {
            status: 413,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        const key = badgeKey(entry.website, sig.ext);
        await env.BADGE_STORE.put(key, fileBytes);
        entry.badge = url.origin + '/' + key;
      } else if (rawFields.badge && typeof rawFields.badge === 'string') {
        entry.badge = rawFields.badge.trim();
      }

      // Store private email mapping in KV
      const emailData = {
        name: entry.name,
        collegeEmail: entry.collegeEmail,
        personalEmail: entry.personalEmail
      };
      await env.EMAIL_STORE.put(entry.website, JSON.stringify(emailData));

      // Strip emails from the public payload before committing to git
      delete entry.collegeEmail;
      delete entry.personalEmail;

      const BRANCH_NAME = `join-${entry.name.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}`;

      // 1. Get the current members.json + main branch SHA
      const fileRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/data/members.json`, { headers: ghHeaders });
      const fileData = await fileRes.json();
      const cleanBase64 = fileData.content.replace(/\s/g, '');
      const members = JSON.parse(atob(cleanBase64));
      
      // Prevent duplicate website url registration
      const exists = members.some(m => m.website.replace(/\/$/, '') === entry.website.replace(/\/$/, ''));
      if (exists) {
        return new Response(JSON.stringify({ success: false, error: 'This website URL is already in the webring!' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      members.push(entry);

      const mainRef = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/git/ref/heads/main`, { headers: ghHeaders }).then(r => r.json());

      // 2. Create a new branch
      await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/git/refs`, {
        method: 'POST',
        headers: ghHeaders,
        body: JSON.stringify({ ref: `refs/heads/${BRANCH_NAME}`, sha: mainRef.object.sha }),
      });

      // 3. Update members.json on that new branch
      await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/data/members.json`, {
        method: 'PUT',
        headers: ghHeaders,
        body: JSON.stringify({
          message: `Add ${entry.name} to webring`,
          content: btoa(JSON.stringify(members, null, 2)),
          sha: fileData.sha,
          branch: BRANCH_NAME,
        }),
      });

      // 4. Add the member's city to data/cities.json when it's new
      const cityKey = entry.location.toLowerCase().trim();
      if (cityKey) {
        try {
          const citiesRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/data/cities.json`, { headers: ghHeaders });
          if (citiesRes.ok) {
            const citiesFile = await citiesRes.json();
            const cities = JSON.parse(atob(citiesFile.content.replace(/\s/g, '')));
            if (!cities[cityKey]) {
              const geo = await geocodeLocation(entry.location);
              if (geo) {
                cities[cityKey] = geo;
                await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/data/cities.json`, {
                  method: 'PUT',
                  headers: ghHeaders,
                  body: JSON.stringify({
                    message: `Add ${geo.name} to cities`,
                    content: btoa(JSON.stringify(cities, null, 2)),
                    sha: citiesFile.sha,
                    branch: BRANCH_NAME,
                  }),
                });
              }
            }
          }
        } catch (err) {
          // cities update is best-effort; the member entry still succeeds
        }
      }

      // 5. Open the PR
      const prRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/pulls`, {
        method: 'POST',
        headers: ghHeaders,
        body: JSON.stringify({
          title: `Join request: ${entry.name}`,
          head: BRANCH_NAME,
          base: 'main',
          body: `Automated join request.\n\n${JSON.stringify(entry, null, 2)}`,
        }),
      });
      const pr = await prRes.json();

      return new Response(JSON.stringify({ success: true, prUrl: pr.html_url }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
  },
};