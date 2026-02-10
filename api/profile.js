const KLAVIYO_API_BASE = 'https://a.klaviyo.com/api';
const KLAVIYO_API_VERSION = '2025-01-15';

// Reverse-map raw Klaviyo `preference` value to UI radio value
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
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
    `/profiles/?filter=${encodeURIComponent(filter)}&additional-fields[profile]=subscriptions`
  );
  return data?.data?.[0] || null;
}

async function getProfileByShopifyId(shopifyId) {
  const filter = `equals(external_id,"shopify_${shopifyId}")`;
  let data = await klaviyoRequest(
    `/profiles/?filter=${encodeURIComponent(filter)}&additional-fields[profile]=subscriptions`
  );
  if (data?.data?.[0]) return data.data[0];

  const fallbackFilter = `equals(properties.shopify_customer_id,"${shopifyId}")`;
  data = await klaviyoRequest(
    `/profiles/?filter=${encodeURIComponent(fallbackFilter)}&additional-fields[profile]=subscriptions`
  );
  return data?.data?.[0] || null;
}

async function createOrUpdateProfile({ email, firstName, lastName, shopifyId, properties = {} }) {
  const payload = {
    data: {
      type: 'profile',
      attributes: {
        email,
        ...(firstName && { first_name: firstName }),
        ...(lastName && { last_name: lastName }),
        ...(shopifyId && { external_id: `shopify_${shopifyId}` }),
        properties: {
          ...(shopifyId && { shopify_customer_id: shopifyId }),
          ...properties,
        },
      },
    },
  };
  return await klaviyoRequest('/profiles/', { method: 'POST', body: JSON.stringify(payload) });
}

async function updateProfile(profileId, updates) {
  const payload = {
    data: {
      type: 'profile',
      id: profileId,
      attributes: { properties: updates.properties || {} },
    },
  };
  return await klaviyoRequest(`/profiles/${profileId}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

function formatProfileResponse(profile) {
  if (!profile) return null;

  const attrs        = profile.attributes || {};
  const subscriptions = attrs.subscriptions || {};
  const emailSub     = subscriptions.email || {};
  const properties   = attrs.properties || {};

  const emailConsent      = emailSub.marketing?.consent;
  const isSubscribed      = emailConsent === 'SUBSCRIBED';
  const isUnsubscribed    = emailConsent === 'UNSUBSCRIBED';
  const isNeverSubscribed = !emailConsent || emailConsent === 'NEVER_SUBSCRIBED';
  const isSuppressed      = emailConsent === 'SUPPRESSED';

  return {
    id: profile.id,
    email: attrs.email,
    firstName: attrs.first_name,
    lastName: attrs.last_name,
    subscription: {
      email: {
        isSubscribed,
        isUnsubscribed,
        isNeverSubscribed,
        isSuppressed,
        consent: emailConsent || 'NEVER_SUBSCRIBED',
        canSubscribe: isNeverSubscribed || isUnsubscribed,
        timestamp: emailSub.marketing?.timestamp,
      },
    },
    preferences: {
      marketingPreference: parsePreference(properties.preference || null),
    },
  };
}

export default async function handler(req, res) {
  corsHeaders(res);

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // GET — fetch profile
    if (req.method === 'GET') {
      const { email, shopifyId, debug } = req.query;

      if (!email && !shopifyId) {
        return res.status(400).json({ success: false, error: 'email or shopifyId required' });
      }

      // Debug mode: show raw Klaviyo response
      if (debug === 'true' && email) {
        const filter = `equals(email,"${email}")`;
        const url = `${KLAVIYO_API_BASE}/profiles/?filter=${encodeURIComponent(filter)}&additional-fields[profile]=subscriptions`;
        try {
          const r = await fetch(url, {
            headers: {
              Authorization: `Klaviyo-API-Key ${process.env.KLAVIYO_PRIVATE_API_KEY}`,
              Accept: 'application/vnd.api+json',
              revision: KLAVIYO_API_VERSION,
            },
          });
          const rawData = await r.json();
          return res.status(200).json({
            debug: true,
            apiKeySet: !!process.env.KLAVIYO_PRIVATE_API_KEY,
            apiKeyPrefix: process.env.KLAVIYO_PRIVATE_API_KEY?.substring(0, 6) + '...',
            filterUsed: filter,
            httpStatus: r.status,
            rawResponse: rawData,
          });
        } catch (err) {
          return res.status(500).json({ debug: true, error: err.message });
        }
      }

      const profile = email
        ? await getProfileByEmail(email)
        : await getProfileByShopifyId(shopifyId);

      if (!profile) {
        return res.status(404).json({ success: false, error: 'Profile not found', data: null });
      }

      return res.status(200).json({ success: true, data: formatProfileResponse(profile) });
    }

    // POST — create or update profile
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { email, firstName, lastName, shopifyId, properties } = body;

      if (!email) return res.status(400).json({ success: false, error: 'Email is required' });

      await createOrUpdateProfile({ email, firstName, lastName, shopifyId, properties });
      const updated = await getProfileByEmail(email);

      return res.status(200).json({ success: true, data: formatProfileResponse(updated) });
    }

    // PATCH — update profile properties
    if (req.method === 'PATCH') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { email, shopifyId, properties } = body;

      if (!email && !shopifyId) {
        return res.status(400).json({ success: false, error: 'email or shopifyId required' });
      }

      const profile = email
        ? await getProfileByEmail(email)
        : await getProfileByShopifyId(shopifyId);

      if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });

      await updateProfile(profile.id, { properties });
      const updated = await getProfileByEmail(profile.attributes.email);

      return res.status(200).json({ success: true, data: formatProfileResponse(updated) });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('Profile API error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
