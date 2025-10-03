import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY!

export const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey)

export function createAdminClient() {
  if (typeof window !== 'undefined') {
    throw new Error('createAdminClient() can only be used on the server side') // i was scared to use this function because AdminClient sounds intimidating and i just took it from the documentation and so i asked claude to potentially secure it and he did this so i hope that's fine!
  }
  return createSupabaseClient(supabaseUrl, supabaseSecretKey)
}