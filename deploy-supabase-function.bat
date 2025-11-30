@echo off

REM Set your Supabase URL and keys here
set SUPABASE_URL=https://prhhlvdoplavakbgcbes.supabase.co
set SUPABASE_ANON_KEY=your_anon_key_here
set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
set INVITE_REDIRECT_TO=

REM Deploy the function with environment variables
echo Deploying invite-user function...
supabase functions deploy invite-user --no-verify-jwt

REM Set the secrets
echo Setting environment variables...
supabase secrets set SUPABASE_URL=%SUPABASE_URL%
supabase secrets set SUPABASE_ANON_KEY=%SUPABASE_ANON_KEY%
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=%SUPABASE_SERVICE_ROLE_KEY%
supabase secrets set INVITE_REDIRECT_TO=%INVITE_REDIRECT_TO%

echo Deployment complete!
pause