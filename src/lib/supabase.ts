// Supabase SDK 已移除。此文件仅保留占位符，防止旧版组件导入报错。
export const supabase = {
  auth: {
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    getSession: async () => ({ data: { session: null } }),
    signOut: async () => {}
  },
  from: () => ({ select: () => ({ eq: () => ({ data: [], error: null }) }) })
};
