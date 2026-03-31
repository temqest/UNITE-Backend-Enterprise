require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = 
  process.env.SUPABASE_SERVICE_ROLE_KEY || 
  process.env.SUPABSE_SERVICE_ROLE_KEY; // Handle typo in env

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function deleteAuthUser(email) {
  try {
    console.log(`🔍 Looking for auth user with email: ${email}`);

    // List all users to find the one with this email
    const { data: users, error: listError } = await supabase.auth.admin.listUsers();

    if (listError) {
      console.error('❌ Failed to list users:', listError.message);
      return false;
    }

    const user = users.users.find(u => u.email?.toLowerCase() === email.toLowerCase());

    if (!user) {
      console.log('✅ No auth user found with this email');
      return true;
    }

    console.log(`Found auth user ID: ${user.id}`);
    console.log(`⏳ Deleting auth user...`);

    const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);

    if (deleteError) {
      console.error('❌ Failed to delete auth user:', deleteError.message);
      return false;
    }

    console.log(`✅ Successfully deleted auth user!`);
    return true;
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

async function main() {
  const email = process.argv[2];

  if (!email) {
    console.log('Usage: node cleanup-auth-user.js <email>');
    console.log('Example: node cleanup-auth-user.js test@example.com');
    process.exit(1);
  }

  console.log('🧹 UNITE Backend - Auth User Cleanup\n');
  const success = await deleteAuthUser(email);
  process.exit(success ? 0 : 1);
}

main();
