export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const entry = await request.json();
    const OWNER = 'io-PEAK';
    const REPO = 'srm-ncr-webring';
    const BRANCH_NAME = `join-${entry.name.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}`;

    const ghHeaders = {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'srm-ncr-webring-worker',
    };

    try {
      // 1. Get the current members.json + main branch SHA
      const fileRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/data/members.json`, { headers: ghHeaders });
      const fileData = await fileRes.json();
      const members = JSON.parse(atob(fileData.content));
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
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
  },
};