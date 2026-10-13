import { createClient } from '@supabase/supabase-js'

// Accept the URL even if it was pasted with a trailing /rest/v1 or slash.
const url = (import.meta.env.VITE_SUPABASE_URL || '')
  .trim()
  .replace(/\/rest\/v1\/?$/, '')
  .replace(/\/+$/, '')
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()

export const configured = Boolean(url && key)
export const supabase = configured ? createClient(url, key) : null
