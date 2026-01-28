# Klaviyo-Shopify Integration

A serverless API integration between Klaviyo and Shopify, similar to the Stamped rewards integration pattern. This allows customers to view and manage their email preferences directly from their Shopify account page.

## Features

- **Newsletter Subscription Status**: Shows whether customer is subscribed to the newsletter
- **Subscribe Form**: Allows unsubscribed customers to sign up for the newsletter
- **Marketing Preferences**: Customers can choose their preference (Menswear, Womenswear, Both, or No Preference)
- **Real-time Updates**: Changes sync directly to Klaviyo profile properties

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Shopify       │────▶│   Vercel API    │────▶│    Klaviyo      │
│   Liquid        │     │   (Serverless)  │     │    API          │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Project Structure

```
klaviyo-shopify-integration/
├── api/
│   ├── profile.js      # Get/create/update profile
│   ├── subscribe.js    # Newsletter subscription
│   └── preferences.js  # Marketing preferences
├── shopify-liquid/
│   └── customer-email-preferences.liquid
├── vercel.json         # Vercel configuration
├── package.json
└── README.md
```

## Setup Instructions

### 1. Klaviyo Setup

1. **Get your API Keys** from Klaviyo:
   - Go to **Settings** → **Account** → **API Keys**
   - Copy your **Private API Key** (starts with `pk_`)
   - Copy your **Public API Key** / Site ID (6 characters)

2. **Get your Newsletter List ID**:
   - Go to **Audience** → **Lists & Segments**
   - Click on your newsletter list
   - The List ID is in the URL: `https://www.klaviyo.com/lists/{LIST_ID}`

3. **Configure API Key Scopes**:
   Your private API key needs these scopes:
   - `profiles:read`
   - `profiles:write`
   - `subscriptions:read`
   - `subscriptions:write`

### 2. Vercel Deployment

1. **Fork/Clone this repository** to your GitHub account

2. **Connect to Vercel**:
   - Go to [vercel.com](https://vercel.com)
   - Import your repository
   - Vercel will auto-detect the configuration

3. **Add Environment Variables** in Vercel:
   
   | Variable | Description | Example |
   |----------|-------------|---------|
   | `KLAVIYO_PRIVATE_API_KEY` | Your Klaviyo private API key | `pk_abc123...` |
   | `KLAVIYO_PUBLIC_API_KEY` | Your Klaviyo public API key (site ID) | `AbCdEf` |
   | `KLAVIYO_NEWSLETTER_LIST_ID` | Your newsletter list ID | `Y6nRLr` |

4. **Deploy** - Vercel will automatically deploy on push

5. **Note your deployment URL**: `https://your-project.vercel.app`

### 3. Shopify Setup

1. **Add the Liquid Template**:
   - Go to **Online Store** → **Themes** → **Edit code**
   - Under `sections/`, click **Add a new section**
   - Name it `customer-email-preferences.liquid`
   - Paste the contents of `shopify-liquid/customer-email-preferences.liquid`

2. **Configure the API URL**:
   - In the template, find the `API_BASE` variable in the `<script>` section
   - Replace `https://your-klaviyo-api.vercel.app/api` with your Vercel URL
   
   Or use the section settings in the Theme Customizer.

3. **Add to Customer Account Template**:
   
   **Option A: Using JSON templates (Dawn theme, etc.)**
   - Edit `templates/customers/account.json`
   - Add the section reference:
   ```json
   {
     "sections": {
       "email-preferences": {
         "type": "customer-email-preferences"
       }
     },
     "order": ["email-preferences"]
   }
   ```

   **Option B: Using Liquid templates**
   - Edit `templates/customers/account.liquid`
   - Add: `{% section 'customer-email-preferences' %}`

## API Endpoints

### GET /api/profile

Fetch customer profile including subscription status.

**Query Parameters:**
- `email` - Customer email address
- `shopifyId` - Shopify customer ID

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "abc123",
    "email": "customer@example.com",
    "subscription": {
      "email": {
        "isSubscribed": true,
        "consent": "SUBSCRIBED"
      }
    },
    "preferences": {
      "marketingPreference": "both"
    }
  }
}
```

### POST /api/subscribe

Subscribe a customer to the newsletter.

**Request Body:**
```json
{
  "email": "customer@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "shopifyId": "12345",
  "source": "Shopify Account Page"
}
```

### POST /api/preferences

Update customer marketing preferences.

**Request Body:**
```json
{
  "email": "customer@example.com",
  "shopifyId": "12345",
  "marketing_preference": "womenswear"
}
```

**Valid preference values:**
- `menswear`
- `womenswear`
- `both`
- `no_preference`

## Klaviyo Profile Properties

The integration stores these custom properties on Klaviyo profiles:

| Property | Description | Values |
|----------|-------------|--------|
| `marketing_preference` | Customer's preferred content | `menswear`, `womenswear`, `both`, `no_preference` |
| `marketing_preference_updated_at` | Last update timestamp | ISO 8601 datetime |
| `shopify_customer_id` | Shopify customer ID | String |

## Using Preferences in Klaviyo

### Segmentation

Create segments based on marketing preference:
- **Menswear Interested**: `marketing_preference equals "menswear"` OR `marketing_preference equals "both"`
- **Womenswear Interested**: `marketing_preference equals "womenswear"` OR `marketing_preference equals "both"`

### Flows & Campaigns

Use these segments to:
- Send targeted product launches
- Personalize email content
- Create conditional flow branches

## Customization

### Adding More Preferences

1. **Update `api/preferences.js`**:
   ```js
   const VALID_PREFERENCES = ['menswear', 'womenswear', 'both', 'no_preference', 'your_new_option'];
   ```

2. **Update the Liquid template**:
   Add a new radio button option in the `preference-options` div.

### Styling

The Liquid template uses CSS custom properties for easy theming:

```css
.customer-block.email-preferences {
  --prefs-primary: #000;
  --prefs-accent: #c9a86c;    /* Accent color */
  --prefs-success: #28a745;
  --prefs-muted: #6c757d;
}
```

### Section Settings

The Shopify section includes settings for:
- Block title
- Preference labels
- API URL

These can be configured in the Theme Customizer without editing code.

## Troubleshooting

### "Unable to load preferences"
- Check browser console for errors
- Verify Vercel environment variables are set
- Ensure API URL is correct in the Liquid template

### Subscription not working
- Check if your Klaviyo list uses double opt-in
- With double opt-in, customers receive a confirmation email first
- Check Klaviyo for pending confirmations

### Profile not found
- New Shopify customers may not exist in Klaviyo yet
- The integration will create profiles when they subscribe or update preferences

### CORS errors
- Verify `vercel.json` has correct CORS headers
- Ensure your Shopify domain isn't blocked

## Security Notes

- Never expose your private API key in client-side code
- The Vercel serverless functions act as a secure proxy
- Customer email validation is performed server-side
- Profile lookups use email or Shopify ID for identification

## License

MIT License - Feel free to use and modify for your projects.
