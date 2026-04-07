# Token Lifetime Configuration Guide

## Current Setup
- **Access Token Lifetime**: 30 minutes (7,200 seconds should be 1,800)
- **Refresh Token Lifetime**: 14 days (1,209,600 seconds)

## Steps to Update Token Lifetimes in Supabase

### Access Token (30 minutes)

1. Go to your **Supabase Project Dashboard**
2. Navigate to: **Settings → Authentication → JWT Settings**
3. Under **JWT Expiration (seconds)**: Set to `1800` (30 minutes)
4. Click **Save**

### Refresh Token (14 days)

1. In the same **Authentication → JWT Settings** section
2. Look for **Refresh Token Expiration (days)**: Set to `14`
3. Click **Save**

### Alternative: Environment Variable
If Supabase allows environment configuration, you can also set:
```bash
SUPABASE_JWT_EXPIRE_SECONDS=1800
SUPABASE_JWT_REFRESH_EXPIRE_SECONDS=1209600
```

## How the Frontend Handles 1

### Access Token Refresh Strategy
- **Token Lifetime**: 30 minutes
- **Refresh Trigger**: At 75% of lifetime = 22.5 minutes
- **Manual Refresh with Buffer**: If token expires within 5 minutes, refresh immediately
- **Automatic Background Refresh**: Scheduled when token is 22.5+ minutes old

### Why 30 Minutes?
- ✅ Short enough to limit damage if token is leaked
- ✅ Long enough to avoid excessive refresh calls
- ✅ Balanced for normal browsing sessions

### Why 14 Days Refresh Token?
- ✅ Allows persistent sessions for up to 14 days
- ✅ Requires re-authentication after 14 days
- ✅ Prevents indefinitely valid tokens

## Frontend Automatic Refresh Behavior

When user logs in:
1. Token stored with expiry timestamp
2. BroadcastChannel notifies all tabs of refresh
3. Each tab schedules refresh at 22.5 minutes
4. Background task auto-refreshes credentials
5. If refresh fails, retry with exponential backoff

## Testing Token Refresh

### Test 1: Verify 30-min Access Token
```sh
# After login, check token in browser DevTools
# Console: localStorage.getItem('unite.auth.session')
# Look for JWT payload (decrypt if needed)
# exp claim should be 30 minutes from login time
```

### Test 2: Multi-Tab Refresh Sync
1. Tab 1: Log in at 9:00 AM
2. Tab 2: Open at 9:22 AM  
3. Both tabs should notify each other when token refreshes
4. No manual refresh needed

### Test 3: Force Token Expiry
```sh
# In browser DevTools Console:
# Clear token to test expiry handling
localStorage.removeItem('unite.auth.session')
# Then try to make an API request
# Should redirect to login gracefully
```

## What Changed in Your Frontend

1. **Token Expiry Extraction** (lib/auth-storage.ts)
   - Reads `exp` claim from JWT
   - Calculates time remaining
   - Stores in session metadata

2. **Auto-Refresh Schedule** (lib/token-refresh.ts)
   - Triggers at 75% of token lifetime
   - With new 30-min tokens = refresh every ~22.5 min
   - Handles failures with exponential backoff

3. **Cross-Tab Sync** (BroadcastChannel)
   - Notifies other tabs when token refreshes
   - Prevents duplicate refresh calls
   - Ensures consistent session across tabs

4. **Smart Request Retry** (lib/api.ts)
   - If 401 received, attempts refresh + retry
   - Network errors don't clear session
   - Auth errors clear session gracefully

## After Configuration

Your system will:
✅ Keep access tokens fresh without user interaction
✅ Sync authentication across all browser tabs
✅ Handle network interruptions gracefully  
✅ Require re-authentication after 14 days
✅ Provide seamless multi-tab experience
✅ Prevent unexpected logouts
