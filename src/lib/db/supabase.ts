// supabase client initialization
import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY!

export const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey)

let adminClient: SupabaseClient | null = null

export function createAdminClient() {
  if (typeof window !== 'undefined') {
    throw new Error('createAdminClient() can only be used on the server side')
  }
  if (!adminClient) {
    adminClient = createSupabaseClient(supabaseUrl, supabaseSecretKey)
  }
  return adminClient
}
