/**
 * Klaviyo Unsubscribe API Endpoint
 * 
 * POST /api/unsubscribe
 *   - Unsubscribes a profile from email marketing
 *   - Body: { email }
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

  // Handle 202/204 responses (accepted/no content)
  if (response.status === 202 || response.status === 204) {
    return { accepted: true };
  }

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

// Unsubscribe profile from email marketing
async function unsubscribeProfile(email, listId) {
  const newsletterListId = listId || process.env.KLAVIYO_NEWSLETTER_LIST_ID;

  const payload = {
    data: {
      type: 'profile-subscription-bulk-delete-job',
      attributes: {
        profiles: {
          data: [
            {
              type: 'profile',
              attributes: {
                email
              }
            }
          ]
        }
      },
      ...(newsletterListId && {
        relationships: {
          list: {
            data: {
              type: 'list',
              id: newsletterListId
            }
          }
        }
      })
    }
  };

  return await klaviyoRequest('/profile-subscription-bulk-delete-jobs/', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

// CORS headers
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };
}

// Main handler
export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  // Set CORS headers
  Object.entries(corsHeaders()).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { email, listId } = body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    await unsubscribeProfile(email, listId);

    return res.status(200).json({
      success: true,
      message: 'Successfully unsubscribed from newsletter',
      data: {
        email,
        unsubscribed: true
      }
    });

  } catch (error) {
    console.error('Unsubscribe API error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to unsubscribe'
    });
  }
}
