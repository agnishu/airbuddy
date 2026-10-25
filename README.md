# Airbuddy

Share a cab to or from the airport with a traveller nearby. Riders add their flight and address; Airbuddy matches
people at the same airport whose addresses are within 2 km and whose ride times are within 1 hour, lets them chat,
and records the ride plan they agree on.

Built with Next.js (as an installable web app) and Supabase (Postgres + PostGIS, auth, photo storage, realtime chat),
hosted on Vercel.

## How it works

| Piece | Where |
| --- | --- |
| Matching rules (2 km, 1 hour, same airport, seats/bags, same-gender, blocks) | `find_matches()` in `supabase/migrations/20261025000000_init.sql` |
| Request → chat → ride plan → confirmed | `request_match`, `respond_to_request`, `propose_plan`, `accept_plan`, `cancel_match` in the same file |
| Privacy: other riders never see an address | Row-level security on `trips`; matches expose only a distance band and area |
| Flight lookups (AeroDataBox), cached per flight per day | `src/lib/flights.ts` |
| Address search (Google Places API, new) | `src/lib/places.ts` |
| Ride time for arrivals: live ETA + 45 min (domestic) / 75 min (international) | `src/lib/rideTime.ts` |
| UPI donation prompt after a confirmed ride | `src/app/chat/[id]/Donation.tsx` |
| Phone login: SMS code via Message Central VerifyNow, then a Supabase session | `src/app/login/actions.ts`, `src/lib/verifynow.ts` |
| Login abuse limits: Cloudflare Turnstile, 3 codes per number per 15 min, 10 per IP per hour | same file, `phone_verifications` table |
| Profile photo required before matching; stored in the `avatars` bucket | `src/app/profile/PhotoUpload.tsx`, `20261025000400_phone_login.sql` |
| Trips and chats deleted 7 days after travel | `supabase/migrations/20261025000100_cleanup.sql` |

## Setting it up

1. **Supabase**: create a project in the **Mumbai (ap-south-1)** region. In the SQL editor, run the files in
   `supabase/migrations/` in order.
2. **Phone login (VerifyNow)**: sign up at Message Central, choose VerifyNow, and copy your Customer ID and
   password into `VERIFYNOW_CUSTOMER_ID` and `VERIFYNOW_PASSWORD`. VerifyNow sends from its own registered sender,
   so you don't need your own DLT registration. Each code costs about ₹0.30.
   **Bot check**: in Cloudflare, add a Turnstile widget for your domain and copy the site key and secret key.
   In Supabase, under Authentication → Providers → Email, keep email enabled (phone logins use a stand-in address
   on `PHONE_LOGIN_EMAIL_DOMAIN` that never receives mail) and turn off "Confirm email".
3. **Google sign-in** (optional second option): in Google Cloud, create an OAuth client (Web application) with the redirect URI Supabase shows
   under Authentication → Providers → Google, then paste the client ID and secret there. Under Authentication → URL
   Configuration, add your site URL and `https://<your-domain>/auth/callback`.
4. **Google Maps**: in the same Google Cloud project, enable **Places API (New)** and create an API key restricted to
   that API. Set a budget alert.
5. **AeroDataBox**: subscribe on RapidAPI (the free Basic plan is enough to start) and copy the key.
6. **Vercel**: import the GitHub repository, add the variables from `.env.example`, and deploy.

Without the flight or maps keys the app still works: riders enter flight details by hand and use their current location.

## Development

```bash
cp .env.example .env.local   # fill in values
npm install
npm run dev                  # http://localhost:3000
npm test                     # unit tests
npm run test:db              # database tests; needs local Postgres 16 + PostGIS (PGHOST/PGPORT/PGUSER)
npm run lint
```
