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

      // ── JOIN ROUTE (Modified to store emails in KV and strip them) ──
      if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405, headers: corsHeaders });
      }

      const entry = await request.json();

      // Validate presence of emails
      if (!entry.collegeEmail || !entry.personalEmail) {
        return new Response(JSON.stringify({ success: false, error: 'Emails are required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
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

      // 4. Open the PR
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