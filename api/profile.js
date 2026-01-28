/**
 * Klaviyo Profile API Endpoint
 * 
 * GET /api/profile?email=xxx or ?shopifyId=xxx
 *   - Returns profile data including subscription status and marketing preferences
 * 
 * POST /api/profile
 *   - Creates or updates a profile
 *   - Body: { email, firstName?, lastName?, properties?: { marketing_preference } }
 * 
 * PATCH /api/profile
 *   - Updates profile properties (marketing preferences)
 *   - Body: { email, properties: { marketing_preference } }
 */

const KLAVIYO_API_BASE = 'https://a.klaviyo.com/api';
const KLAVIYO_API_VERSION = '2025-01-15';

// Helper to make Klaviyo API requests
async function klaviyoRequest(endpoint, options = {}) {
  const url = `${KLAVIYO_API_BASE}${endpoint}`;
  
  const headers = {
    'Authorization': `Klaviyo-API-Key ${process.env.KLAVIYO_PRIVATE_API_KEY}`,
    'Accept': 'application/vnd.api+json',
    'Content-Type': 'application/vnd.api+json',
    'revision': KLAVIYO_API_VERSION,
    ...options.headers
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  // Handle non-JSON responses
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/')) {
    if (!response.ok) {
      throw new Error(`Klaviyo API error: ${response.status} ${response.statusText}`);
    }
    return null;
  }

  const data = await response.json();

  if (!response.ok) {
    const errorMessage = data.errors?.[0]?.detail || data.errors?.[0]?.title || 'Unknown error';
    throw new Error(`Klaviyo API error: ${errorMessage}`);
  }

  return data;
}

// Get profile by email
async function getProfileByEmail(email) {
  const encodedEmail = encodeURIComponent(email);
  const filter = `equals(email,"${encodedEmail}")`;
  
  const data = await klaviyoRequest(
    `/profiles/?filter=${encodeURIComponent(filter)}&additional-fields[profile]=subscriptions`
  );
  
  return data?.data?.[0] || null;
}

// Get profile by Shopify Customer ID (stored as external_id or custom property)
async function getProfileByShopifyId(shopifyId) {
  // Try external_id first
  const filter = `equals(external_id,"shopify_${shopifyId}")`;
  
  let data = await klaviyoRequest(
    `/profiles/?filter=${encodeURIComponent(filter)}&additional-fields[profile]=subscriptions`
  );
  
  if (data?.data?.[0]) {
    return data.data[0];
  }

  // Fallback: search by custom property (if you store shopify_customer_id as a property)
  const propertyFilter = `equals(properties.shopify_customer_id,"${shopifyId}")`;
  data = await klaviyoRequest(
    `/profiles/?filter=${encodeURIComponent(propertyFilter)}&additional-fields[profile]=subscriptions`
  );

  return data?.data?.[0] || null;
}

// Create or update profile
async function createOrUpdateProfile(profileData) {
  const { email, firstName, lastName, shopifyId, properties = {} } = profileData;
  
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
          ...properties
        }
      }
    }
  };

  return await klaviyoRequest('/profiles/', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

// Update profile by ID
async function updateProfile(profileId, updates) {
  const payload = {
    data: {
      type: 'profile',
      id: profileId,
      attributes: {
        properties: updates.properties || {}
      }
    }
  };

  return await klaviyoRequest(`/profiles/${profileId}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

// Format profile response for frontend
function formatProfileResponse(profile) {
  if (!profile) {
    return null;
  }

  const attrs = profile.attributes || {};
  const subscriptions = attrs.subscriptions || {};
  const emailSub = subscriptions.email || {};
  const smsSub = subscriptions.sms || {};
  const properties = attrs.properties || {};

  // Determine subscription status
  const emailConsent = emailSub.marketing?.consent;
  const isSubscribed = emailConsent === 'SUBSCRIBED';
  const isNeverSubscribed = emailConsent === 'NEVER_SUBSCRIBED' || !emailConsent;
  const isUnsubscribed = emailConsent === 'UNSUBSCRIBED';
  const isSuppressed = emailConsent === 'SUPPRESSED';

  return {
    id: profile.id,
    email: attrs.email,
    firstName: attrs.first_name,
    lastName: attrs.last_name,
    subscription: {
      email: {
        isSubscribed,
        isNeverSubscribed,
        isUnsubscribed,
        isSuppressed,
        consent: emailConsent || 'NEVER_SUBSCRIBED',
        canSubscribe: isNeverSubscribed || isUnsubscribed,
        timestamp: emailSub.marketing?.timestamp
      },
      sms: {
        consent: smsSub.marketing?.consent,
        isSubscribed: smsSub.marketing?.consent === 'SUBSCRIBED'
      }
    },
    preferences: {
      marketingPreference: properties.marketing_preference || 'no_preference',
      // Add any other custom properties you want to expose
    },
    raw: {
      properties,
      subscriptions
    }
  };
}

// CORS headers
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };
}

// Main handler
export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  // Set CORS headers for all responses
  Object.entries(corsHeaders()).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  try {
    // GET - Fetch profile
    if (req.method === 'GET') {
      const { email, shopifyId } = req.query;

      if (!email && !shopifyId) {
        return res.status(400).json({
          success: false,
          error: 'Either email or shopifyId query parameter is required'
        });
      }

      let profile;
      if (email) {
        profile = await getProfileByEmail(email);
      } else {
        profile = await getProfileByShopifyId(shopifyId);
      }

      if (!profile) {
        return res.status(404).json({
          success: false,
          error: 'Profile not found',
          data: null
        });
      }

      return res.status(200).json({
        success: true,
        data: formatProfileResponse(profile)
      });
    }

    // POST - Create or update profile
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { email, firstName, lastName, shopifyId, properties } = body;

      if (!email) {
        return res.status(400).json({
          success: false,
          error: 'Email is required'
        });
      }

      const result = await createOrUpdateProfile({
        email,
        firstName,
        lastName,
        shopifyId,
        properties
      });

      // Fetch the updated profile to get full data
      const updatedProfile = await getProfileByEmail(email);

      return res.status(200).json({
        success: true,
        data: formatProfileResponse(updatedProfile),
        created: !result?.data?.id // API returns existing profile if it exists
      });
    }

    // PATCH - Update profile properties
    if (req.method === 'PATCH') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { email, shopifyId, properties } = body;

      if (!email && !shopifyId) {
        return res.status(400).json({
          success: false,
          error: 'Either email or shopifyId is required'
        });
      }

      // Get existing profile
      let profile;
      if (email) {
        profile = await getProfileByEmail(email);
      } else {
        profile = await getProfileByShopifyId(shopifyId);
      }

      if (!profile) {
        return res.status(404).json({
          success: false,
          error: 'Profile not found'
        });
      }

      // Update the profile
      await updateProfile(profile.id, { properties });

      // Fetch updated profile
      const updatedProfile = await getProfileByEmail(profile.attributes.email);

      return res.status(200).json({
        success: true,
        data: formatProfileResponse(updatedProfile)
      });
    }

    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });

  } catch (error) {
    console.error('Profile API error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
}
