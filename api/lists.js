const KLAVIYO_API_BASE = 'https://a.klaviyo.com/api';
const KLAVIYO_API_VERSION = '2025-01-15';

function corsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
}

export default async function handler(req, res) {
  corsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    const response = await fetch(`${KLAVIYO_API_BASE}/lists/`, {
      headers: {
        Authorization: `Klaviyo-API-Key ${process.env.KLAVIYO_PRIVATE_API_KEY}`,
        Accept: 'application/vnd.api+json',
        revision: KLAVIYO_API_VERSION,
      },
    });
    const data = await response.json();
    const lists = (data.data || []).map(l => ({ id: l.id, name: l.attributes?.name }));
    return res.status(200).json({ success: true, lists, configured_list_id: process.env.KLAVIYO_NEWSLETTER_LIST_ID });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
