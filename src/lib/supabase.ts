import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY!

export const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey)

export function createClient() {
  return createSupabaseClient(supabaseUrl, supabaseAnonKey)
}

export function createAdminClient() {
  return createSupabaseClient(supabaseUrl, supabaseSecretKey)
}

// the createClient() and createAdminClient() functions were done with the help of ai (claude 4), i asked it why my fetch requests couldn't resolve and pasted in the error, I could not fix it myself D: