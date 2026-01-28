/**
 * Klaviyo Preferences API Endpoint
 * 
 * GET /api/preferences?email=xxx or ?shopifyId=xxx
 *   - Returns current marketing preferences
 * 
 * POST /api/preferences
 *   - Updates marketing preferences
 *   - Body: { email, shopifyId?, marketing_preference: "menswear"|"womenswear"|"both"|"no_preference" }
 */

const KLAVIYO_API_BASE = 'https://a.klaviyo.com/api';
const KLAVIYO_API_VERSION = '2025-01-15';

// Valid preference values
const VALID_PREFERENCES = ['menswear', 'womenswear', 'both', 'no_preference'];

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
    `/profiles/?filter=${encodeURIComponent(filter)}`
  );
  
  return data?.data?.[0] || null;
}

// Get profile by Shopify Customer ID
async function getProfileByShopifyId(shopifyId) {
  const filter = `equals(external_id,"shopify_${shopifyId}")`;
  
  let data = await klaviyoRequest(
    `/profiles/?filter=${encodeURIComponent(filter)}`
  );
  
  if (data?.data?.[0]) {
    return data.data[0];
  }

  // Fallback: search by custom property
  const propertyFilter = `equals(properties.shopify_customer_id,"${shopifyId}")`;
  data = await klaviyoRequest(
    `/profiles/?filter=${encodeURIComponent(propertyFilter)}`
  );

  return data?.data?.[0] || null;
}

// Update profile properties
async function updateProfilePreferences(profileId, preferences) {
  const payload = {
    data: {
      type: 'profile',
      id: profileId,
      attributes: {
        properties: {
          marketing_preference: preferences.marketing_preference,
          marketing_preference_updated_at: new Date().toISOString()
        }
      }
    }
  };

  return await klaviyoRequest(`/profiles/${profileId}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

// Create profile with preferences (for new users)
async function createProfileWithPreferences({ email, shopifyId, marketing_preference }) {
  const payload = {
    data: {
      type: 'profile',
      attributes: {
        email,
        ...(shopifyId && { external_id: `shopify_${shopifyId}` }),
        properties: {
          ...(shopifyId && { shopify_customer_id: shopifyId }),
          marketing_preference: marketing_preference || 'no_preference',
          marketing_preference_updated_at: new Date().toISOString()
        }
      }
    }
  };

  return await klaviyoRequest('/profiles/', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

// Format preferences response
function formatPreferencesResponse(profile) {
  if (!profile) {
    return null;
  }

  const properties = profile.attributes?.properties || {};
  
  return {
    marketing_preference: properties.marketing_preference || 'no_preference',
    marketing_preference_label: getPreferenceLabel(properties.marketing_preference),
    updated_at: properties.marketing_preference_updated_at || null
  };
}

// Get human-readable preference label
function getPreferenceLabel(preference) {
  const labels = {
    'menswear': "Men's Wear",
    'womenswear': "Women's Wear",
    'both': "Both Men's & Women's",
    'no_preference': 'No Preference'
  };
  return labels[preference] || 'No Preference';
}

// CORS headers
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };
}

// Main handler
export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  // Set CORS headers
  Object.entries(corsHeaders()).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  try {
    // GET - Fetch current preferences
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
        // Return default preferences for new users
        return res.status(200).json({
          success: true,
          data: {
            marketing_preference: 'no_preference',
            marketing_preference_label: 'No Preference',
            updated_at: null,
            isNewProfile: true
          }
        });
      }

      return res.status(200).json({
        success: true,
        data: formatPreferencesResponse(profile)
      });
    }

    // POST - Update preferences
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { email, shopifyId, marketing_preference } = body;

      if (!email && !shopifyId) {
        return res.status(400).json({
          success: false,
          error: 'Either email or shopifyId is required'
        });
      }

      // Validate preference value
      if (marketing_preference && !VALID_PREFERENCES.includes(marketing_preference)) {
        return res.status(400).json({
          success: false,
          error: `Invalid marketing_preference. Must be one of: ${VALID_PREFERENCES.join(', ')}`
        });
      }

      // Get existing profile
      let profile;
      if (email) {
        profile = await getProfileByEmail(email);
      } else {
        profile = await getProfileByShopifyId(shopifyId);
      }

      // If profile doesn't exist and we have email, create it
      if (!profile) {
        if (!email) {
          return res.status(404).json({
            success: false,
            error: 'Profile not found. Email is required to create a new profile.'
          });
        }

        await createProfileWithPreferences({
          email,
          shopifyId,
          marketing_preference
        });

        profile = await getProfileByEmail(email);
      } else {
        // Update existing profile
        await updateProfilePreferences(profile.id, {
          marketing_preference: marketing_preference || 'no_preference'
        });

        // Fetch updated profile
        profile = await getProfileByEmail(profile.attributes.email);
      }

      return res.status(200).json({
        success: true,
        message: 'Marketing preferences updated successfully',
        data: formatPreferencesResponse(profile)
      });
    }

    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });

  } catch (error) {
    console.error('Preferences API error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
}
