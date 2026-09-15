# Authentication deployment status

Production client authentication is now active on `portal.reaperai.com` using same-origin Supabase email/password sessions. Client accounts are created only after an administrator approves a website intake. Each new client receives a one-time, 48-hour portal activation link that initializes the permanent password without exposing a temporary credential.

Supabase session guards protect portal entry, dashboard, documents, and payments. Database and storage access are enforced with row-level security. Client document uploads use the private `client-documents` bucket with server-side MIME and 20 MB file-size restrictions.

Custom SMTP / branded magic-link delivery remains an optional enhancement rather than a blocker for first-client acceptance. Leaked-password protection should still be enabled in the Supabase Auth dashboard when dashboard access is available.
