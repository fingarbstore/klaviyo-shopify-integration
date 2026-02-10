const KLAVIYO_API_BASE = 'https://a.klaviyo.com/api';
const KLAVIYO_API_VERSION = '2025-01-15';

const VALID_PREFERENCES = ['menswear', 'womenswear', 'both', 'no_preference'];

// Maps UI radio values to the exact string written to Klaviyo's `preference` property
const PREFERENCE_MAP = {
  menswear:     '"Menswear"',
  womenswear:   '"Womenswear"',
  both:         '"Menswear","Womenswear"',
  no_preference: null,
};

// Reverse: reads Klaviyo stored value and returns UI radio value
function parsePreference(raw) {
  if (!raw) return 'no_preference';
  const hasMens   = raw.includes('"Menswear"');
  const hasWomens = raw.includes('"Womenswear"');
  if (hasMens && hasWomens) return 'both';
  if (hasMens)   return 'menswear';
  if (hasWomens) return 'womenswear';
  return 'no_preference';
}

function corsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
}

async function klaviyoRequest(endpoint, options = {}) {
  const url = `${KLAVIYO_API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Klaviyo-API-Key ${process.env.KLAVIYO_PRIVATE_API_KEY}`,
      'Content-Type': 'application/vnd.api+json',
      Accept: 'application/vnd.api+json',
      revision: KLAVIYO_API_VERSION,
    },
  });

  if (response.status === 202 || response.status === 204) return null;

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/')) {
    if (!response.ok) throw new Error(`Klaviyo API error: ${response.status}`);
    return null;
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.errors?.[0]?.detail || `Klaviyo error ${response.status}`);
  }
  return data;
}

async function getProfileByEmail(email) {
  const filter = `equals(email,"${email}")`;
  const data = await klaviyoRequest(
    `/profiles/?filter=${encodeURIComponent(filter)}`
  );
  return data?.data?.[0] || null;
}

async function updateProfilePreferences(profileId, marketingPreference) {
  const klaviyoValue = PREFERENCE_MAP[marketingPreference] ?? null;

  const payload = {
    data: {
      type: 'profile',
      id: profileId,
      attributes: {
        properties: {
          preference: klaviyoValue,
          preference_updated_at: new Date().toISOString(),
        },
      },
    },
  };

  return await klaviyoRequest(`/profiles/${profileId}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

async function createProfileWithPreferences({ email, shopifyId, marketing_preference }) {
  const klaviyoValue = PREFERENCE_MAP[marketing_preference] ?? null;

  const payload = {
    data: {
      type: 'profile',
      attributes: {
        email,
        ...(shopifyId && { external_id: `shopify_${shopifyId}` }),
        properties: {
          ...(shopifyId && { shopify_customer_id: shopifyId }),
          preference: klaviyoValue,
          preference_updated_at: new Date().toISOString(),
        },
      },
    },
  };

  return await klaviyoRequest('/profiles/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export default async function handler(req, res) {
  corsHeaders(res);

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // GET — return current preferences
    if (req.method === 'GET') {
      const { email } = req.query;

      if (!email) {
        return res.status(400).json({ success: false, error: 'email query parameter is required' });
      }

      const profile = await getProfileByEmail(email);

      if (!profile) {
        return res.status(200).json({
          success: true,
          data: { marketing_preference: 'no_preference', isNewProfile: true },
        });
      }

      const raw = profile.attributes?.properties?.preference || null;
      return res.status(200).json({
        success: true,
        data: { marketing_preference: parsePreference(raw) },
      });
    }

    // POST — update preferences
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { email, shopifyId, marketing_preference } = body;

      if (!email && !shopifyId) {
        return res.status(400).json({ success: false, error: 'email or shopifyId is required' });
      }

      if (marketing_preference && !VALID_PREFERENCES.includes(marketing_preference)) {
        return res.status(400).json({
          success: false,
          error: `Invalid marketing_preference. Must be one of: ${VALID_PREFERENCES.join(', ')}`,
        });
      }

      let profile = email ? await getProfileByEmail(email) : null;

      if (!profile) {
        if (!email) {
          return res.status(404).json({ success: false, error: 'Profile not found' });
        }
        await createProfileWithPreferences({ email, shopifyId, marketing_preference });
        profile = await getProfileByEmail(email);
      } else {
        await updateProfilePreferences(profile.id, marketing_preference || 'no_preference');
        profile = await getProfileByEmail(email || profile.attributes.email);
      }

      const raw = profile?.attributes?.properties?.preference || null;
      return res.status(200).json({
        success: true,
        message: 'Preferences updated',
        data: { marketing_preference: parsePreference(raw) },
      });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('Preferences error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
