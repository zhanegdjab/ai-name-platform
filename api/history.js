import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: '只支持 GET 请求' });
    return;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    res.status(200).json({ items: [], warning: '未配置 Supabase，历史记录不可用' });
    return;
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await supabase
    .from('name_history')
    .select('id, user_requirement, name_result, model_name, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    res.status(200).json({ items: [], warning: error.message });
    return;
  }

  res.status(200).json({ items: data || [] });
}
