import { Pool } from 'pg';

const dbPassword = process.env.DB_PASSWORD;
if (!dbPassword) {
  console.warn('DB_PASSWORD 环境变量未配置，数据库连接将不使用密码');
}

// 数据库连接池
export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'notesapp',
  user: process.env.DB_USER || 'notesapp_user',
  password: dbPassword,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// 测试连接
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

export async function testConnection() {
  try {
    const client = await pool.connect();
    console.log('✅ Database connected successfully');
    client.release();
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
}
