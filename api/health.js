/**
 * Health Check Endpoint
 * GET /api/health
 * 
 * Use this to verify your Vercel deployment is working
 */

export default function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Check if environment variables are set
  const hasPrivateKey = !!process.env.KLAVIYO_PRIVATE_API_KEY;
  const hasPublicKey = !!process.env.KLAVIYO_PUBLIC_API_KEY;
  const hasListId = !!process.env.KLAVIYO_NEWSLETTER_LIST_ID;

  return res.status(200).json({
    success: true,
    message: 'Klaviyo API is running',
    timestamp: new Date().toISOString(),
    environment: {
      KLAVIYO_PRIVATE_API_KEY: hasPrivateKey ? '✓ Set' : '✗ Missing',
      KLAVIYO_PUBLIC_API_KEY: hasPublicKey ? '✓ Set' : '✗ Missing',
      KLAVIYO_NEWSLETTER_LIST_ID: hasListId ? '✓ Set' : '✗ Missing'
    }
  });
}
