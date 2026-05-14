import { Router, Request, Response } from 'express';
import { pool } from '../utils/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

/**
 * 兼容 Supabase SDK 查询语法
 * 前端代码：await wt.from("notes").select(...).eq(...)
 * 后端代理：GET /supabase-compat/notes?select=...&owner_id=eq.xxx
 */
router.get('/:table', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { table } = req.params;
  const { select, ...filters } = req.query;

  try {
    let query = `SELECT ${select || '*'} FROM ${table} WHERE 1=1`;
    const values: any[] = [];
    let paramIndex = 1;

    // 处理过滤条件
    for (const [key, value] of Object.entries(filters)) {
      const val = value as string;
      if (val.includes('eq.')) {
        const eqValue = val.replace('eq.', '');
        query += ` AND ${key} = $${paramIndex}`;
        values.push(eqValue);
        paramIndex++;
      } else if (val.includes('in.')) {
        const inValue = val.replace('in.', '').split(',');
        query += ` AND ${key} = ANY($${paramIndex})`;
        values.push(inValue);
        paramIndex++;
      }
    }

    // 自动添加权限过滤
    if (table === 'notes' && !query.includes('owner_id')) {
      query += ` AND (owner_id = $${paramIndex} OR id IN (SELECT note_id FROM note_shares WHERE user_id = $${paramIndex}))`;
      values.push(userId);
      paramIndex++;
    }

    query += ' ORDER BY order_index ASC';

    const result = await pool.query(query, values);
    res.json({ data: result.rows, error: null });
  } catch (error: any) {
    console.error(`[Supabase Compat] GET ${table} error:`, error);
    res.json({ data: null, error: { message: error.message, code: error.code } });
  }
});

/**
 * 兼容 Supabase SDK 插入语法
 * 前端代码：await wt.from("notes").insert(data)
 * 后端代理：POST /supabase-compat/notes
 */
router.post('/:table', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { table } = req.params;
  const data = req.body;

  try {
    const isArray = Array.isArray(data);
    const records = isArray ? data : [data];

    const inserted: any[] = [];

    for (const record of records) {
      const keys = Object.keys(record);
      const values = Object.values(record);

      // 自动添加 owner_id
      if (!record.owner_id && ['notes', 'note_shares'].includes(table)) {
        keys.push('owner_id');
        values.push(userId);
      }

      const query = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`;
      const result = await pool.query(query, values);
      inserted.push(result.rows[0]);
    }

    res.json({ data: isArray ? inserted : inserted[0], error: null });
  } catch (error: any) {
    console.error(`[Supabase Compat] POST ${table} error:`, error);
    res.json({ data: null, error: { message: error.message, code: error.code } });
  }
});

/**
 * 兼容 Supabase SDK 更新语法
 * 前端代码：await wt.from("update_logs").update(data).eq("id", logId)
 * 后端代理：PUT /supabase-compat/update_logs
 */
router.put('/:table', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { table } = req.params;
  const { data, filterKey, filterValue } = req.body;

  try {
    const keys = Object.keys(data);
    const values = Object.values(data);

    if (filterKey) {
      keys.push(filterKey);
      values.push(filterValue);
    }

    const setClauses = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
    const whereClause = filterKey ? ` WHERE ${filterKey} = $${keys.length + 1}` : '';
    const allValues = filterKey ? [...values, filterValue] : values;

    const query = `UPDATE ${table} SET ${setClauses}${whereClause} RETURNING *`;
    const result = await pool.query(query, allValues);

    res.json({ data: result.rows[0], error: null });
  } catch (error: any) {
    console.error(`[Supabase Compat] PUT ${table} error:`, error);
    res.json({ data: null, error: { message: error.message, code: error.code } });
  }
});

/**
 * 兼容 Supabase SDK 删除语法
 * 前端代码：await wt.from("notebook_invites").delete().eq("id", inviteId)
 * 后端代理：DELETE /supabase-compat/notebook_invites
 */
router.delete('/:table', authMiddleware, async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { table } = req.params;
  const { filterKey, filterValue } = req.body;

  try {
    const query = `DELETE FROM ${table} WHERE ${filterKey} = $1 RETURNING *`;
    const result = await pool.query(query, [filterValue]);

    res.json({ data: result.rows, error: null });
  } catch (error: any) {
    console.error(`[Supabase Compat] DELETE ${table} error:`, error);
    res.json({ data: null, error: { message: error.message, code: error.code } });
  }
});

export { router as supabaseCompatRouter };
