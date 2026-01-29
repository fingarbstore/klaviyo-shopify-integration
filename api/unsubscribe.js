const KLAVIYO_API_BASE = 'https://a.klaviyo.com/api';
const REVISION = '2025-01-15';

async function klaviyoRequest(endpoint, options = {}) {
  const res = await fetch(`${KLAVIYO_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Klaviyo-API-Key ${process.env.KLAVIYO_PRIVATE_API_KEY}`,
      'Content-Type': 'application/vnd.api+json',
      Accept: 'application/vnd.api+json',
      revision: REVISION
    }
  });

  if (res.status === 202 || res.status === 204) return null;

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.errors?.[0]?.detail || 'Klaviyo error');
  }

  return data;
}

async function getProfileIdByEmail(email) {
  const res = await klaviyoRequest(
    `/profiles?filter=equals(email,"${email}")`
  );

  if (!res?.data?.length) {
    throw new Error('Profile not found');
  }

  return res.data[0].id;
}

async function unsubscribeProfile(profileId) {
  return klaviyoRequest('/profile-subscriptions/bulk-unsubscribe', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'profile-subscription-bulk-unsubscribe',
        attributes: {
          channel: 'email',
          profile_ids: [profileId]
        }
      }
    })
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false });
  }

  try {
    const { email } = req.body;
    if (!email) throw new Error('Email required');

    const profileId = await getProfileIdByEmail(email);
    await unsubscribeProfile(profileId);

    return res.status(200).json({
      success: true,
      unsubscribed: true
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
}
