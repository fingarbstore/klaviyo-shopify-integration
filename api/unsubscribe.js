const KLAVIYO_API_BASE = 'https://a.klaviyo.com/api';
const KLAVIYO_API_VERSION = '2025-01-15';

function corsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
}

async function klaviyoRequest(endpoint, options = {}) {
  const response = await fetch(`${KLAVIYO_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Klaviyo-API-Key ${process.env.KLAVIYO_PRIVATE_API_KEY}`,
      'Content-Type': 'application/vnd.api+json',
      Accept: 'application/vnd.api+json',
      revision: KLAVIYO_API_VERSION,
    },
  });

  if (response.status === 202 || response.status === 204) return null;

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.errors?.[0]?.detail || `Klaviyo error ${response.status}`);
  }
  return data;
}

export default async function handler(req, res) {
  corsHeaders(res);

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { email } = body;

    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    await klaviyoRequest('/profile-subscription-bulk-delete-jobs/', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'profile-subscription-bulk-delete-job',
          attributes: {
            profiles: {
              data: [{ type: 'profile', attributes: { email } }],
            },
          },
          relationships: {
            list: {
              data: {
                type: 'list',
                id: process.env.KLAVIYO_NEWSLETTER_LIST_ID,
              },
            },
          },
        },
      }),
    });

    return res.status(200).json({ success: true, unsubscribed: true });
  } catch (err) {
    console.error('Unsubscribe error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
