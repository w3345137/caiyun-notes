/**
 * Admin Console API - 管理员接口
 * 所有管理操作在后端执行，避免 service_role key 暴露在前端
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ADMIN_EMAILS = ['767493611@qq.com']

interface UserRecord {
  id: string
  email: string
  display_name: string | null
  created_at: string
  note_count: number
  is_admin: boolean
}

interface NoteRecord {
  id: string
  title: string
  type: string
  owner_email: string
  owner_id: string
  created_at: string
  updated_at: string
  word_count: number
}

interface DbStats {
  total_users: number
  total_notes: number
  total_sessions: number
  db_size_mb: number
  top_users: { email: string; note_count: number }[]
}

interface ActivityStat {
  date: string
  new_users: number
  new_notes: number
}

export default async function handler(req: Request) {
  try {
    const body = await req.json()
    const { action, userId, ...params } = body

    // 使用 anon key 验证用户身份
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const anonClient = createClient(supabaseUrl, supabaseAnonKey)
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    })

    // 验证用户是否为管理员
    const { data: user, error: userError } = await anonClient
      .from('user_profiles')
      .select('email')
      .eq('id', userId)
      .single()

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!ADMIN_EMAILS.includes(user.email.toLowerCase())) {
      return new Response(JSON.stringify({ error: 'Unauthorized - Admin only' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 执行管理操作
    let result: any

    switch (action) {
      case 'checkIsAdmin':
        result = { isAdmin: true }
        break

      case 'getAllUsers': {
        const { data: profiles } = await serviceClient
          .from('user_profiles')
          .select('*')
          .order('created_at', { ascending: false })

        if (!profiles) {
          result = []
          break
        }

        const userIds = profiles.map((p: any) => p.id)
        const { data: notes } = await serviceClient
          .from('notes')
          .select('owner_id')

        const countMap: Record<string, number> = {}
        ;(notes || []).forEach((n: any) => {
          countMap[n.owner_id] = (countMap[n.owner_id] || 0) + 1
        })

        result = profiles.map((p: any) => ({
          id: p.id,
          email: p.email,
          display_name: p.display_name || p.email.split('@')[0],
          created_at: p.created_at,
          note_count: countMap[p.id] || 0,
          is_admin: ADMIN_EMAILS.includes(p.email.toLowerCase()),
        }))
        break
      }

      case 'deleteUser': {
        const { targetUserId } = params
        await serviceClient.from('notes').delete().eq('owner_id', targetUserId)
        await serviceClient.from('note_shares').delete().eq('shared_by', targetUserId)
        const { error } = await serviceClient.auth.admin.deleteUser(targetUserId)
        if (error) throw new Error(error.message)
        result = { success: true }
        break
      }

      case 'getDbStats': {
        const [{ data: users }, { data: notes }] = await Promise.all([
          serviceClient.from('user_profiles').select('id, email'),
          serviceClient.from('notes').select('owner_id'),
        ])

        const noteCountMap: Record<string, number> = {}
        ;(notes || []).forEach((n: any) => {
          noteCountMap[n.owner_id] = (noteCountMap[n.owner_id] || 0) + 1
        })

        const emailMap: Record<string, string> = {}
        ;(users || []).forEach((u: any) => {
          emailMap[u.id] = u.email
        })

        const topUsers = Object.entries(noteCountMap)
          .map(([owner_id, note_count]) => ({
            email: emailMap[owner_id] || owner_id,
            note_count,
          }))
          .sort((a, b) => b.note_count - a.note_count)
          .slice(0, 5)

        result = {
          total_users: (users || []).length,
          total_notes: (notes || []).length,
          total_sessions: 0,
          db_size_mb: 0,
          top_users: topUsers,
        }
        break
      }

      case 'getAllNotes': {
        const { data: notes } = await serviceClient
          .from('notes')
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(200)

        if (!notes) {
          result = []
          break
        }

        const ownerIds = [...new Set(notes.map((n: any) => n.owner_id))]
        const { data: profiles } = await serviceClient
          .from('user_profiles')
          .select('id, email')
          .in('id', ownerIds.length > 0 ? ownerIds : ['__none__'])

        const emailMap: Record<string, string> = {}
        ;(profiles || []).forEach((p: any) => {
          emailMap[p.id] = p.email
        })

        result = notes.map((n: any) => ({
          id: n.id,
          title: n.title,
          type: n.type,
          owner_email: emailMap[n.owner_id] || n.owner_id,
          owner_id: n.owner_id,
          created_at: n.created_at,
          updated_at: n.updated_at,
          word_count: (n.content || '').replace(/<[^>]+>/g, '').length,
        }))
        break
      }

      case 'deleteAnyNote': {
        const { noteId } = params
        const { error } = await serviceClient.from('notes').delete().eq('id', noteId)
        if (error) throw new Error(error.message)
        result = { success: true }
        break
      }

      case 'getActivityStats': {
        const { days = 30 } = params
        const cutoff = new Date()
        cutoff.setDate(cutoff.getDate() - days)
        const cutoffStr = cutoff.toISOString().split('T')[0]

        const [{ data: users }, { data: notes }] = await Promise.all([
          serviceClient
            .from('user_profiles')
            .select('created_at')
            .gte('created_at', cutoffStr),
          serviceClient
            .from('notes')
            .select('created_at')
            .gte('created_at', cutoffStr),
        ])

        const userCountByDate: Record<string, number> = {}
        const noteCountByDate: Record<string, number> = {}

        ;(users || []).forEach((u: any) => {
          const d = u.created_at.split('T')[0]
          userCountByDate[d] = (userCountByDate[d] || 0) + 1
        })

        ;(notes || []).forEach((n: any) => {
          const d = n.created_at.split('T')[0]
          noteCountByDate[d] = (noteCountByDate[d] || 0) + 1
        })

        const allDates = new Set([
          ...Object.keys(userCountByDate),
          ...Object.keys(noteCountByDate),
        ])

        result = Array.from(allDates)
          .sort()
          .map((date) => ({
            date,
            new_users: userCountByDate[date] || 0,
            new_notes: noteCountByDate[date] || 0,
          }))
        break
      }

      default:
        return new Response(JSON.stringify({ error: 'Unknown action' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
    }

    return new Response(JSON.stringify({ success: true, data: result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[admin-api] Error:', err)
    return new Response(
      JSON.stringify({ error: err.message || 'Internal server error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}
