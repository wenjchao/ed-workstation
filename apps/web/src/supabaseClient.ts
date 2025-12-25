import { createClient } from '@supabase/supabase-js'

// 填入你從 Supabase Project Settings > API 複製的資訊
const supabaseUrl = 'https://lfnyddowdgrqrptueboj.supabase.co'
const supabaseAnonKey = 'sb_publishable_XJW1Er9OwO99B57C7MIqsQ_NPkq4CsW'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)