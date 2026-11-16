# Admin login code (Phase C, part 3) — design

Approved by the user on 2026-11-17 ("Oo, simulan"). No database change.

## Why
Leyah's account can change bookings, money records and client data. Today a password alone opens it; a second step
(a code sent to her email) means a leaked password is not enough.

## Goals
1. After Leyah's correct password, she is not signed in yet: the site asks for a 6-digit code sent to her email
   ("l•••@gmail.com"), valid 10 minutes, 5 wrong tries per code, a new one after 60 seconds.
2. "Remember this device for 30 days" (ticked by default): that browser skips the code for 30 days. A password change
   or "sign out other devices" ends every remembered device.
3. A switch for the defense: `Auth:AdminLoginCode` (default on; Render env `Auth__AdminLoginCode=false` turns it off
   without a deploy).
4. Clients sign in exactly as before.
5. Activity log: code sent, wrong code, signed in.

## Design (Claude's calls, open to correction)
- The code is a `user_tokens` row with the new purpose `AdminLoginCode` (text column; no schema change), hashed like
  the sign-up code; a new code ends the earlier ones.
- Between the two steps the browser holds an encrypted, 10-minute, HttpOnly cookie naming the account and its
  security stamp; the remembered device is the same kind of cookie for 30 days. Both use the site's existing
  encryption keys.
- The password step answers 202 with `{ codeRequired, emailHint, expiresInMinutes }` instead of signing in.
- The password step still counts failed passwords and locks the account as today.

## Non-goals
- Codes by SMS or an authenticator app; codes for clients.
