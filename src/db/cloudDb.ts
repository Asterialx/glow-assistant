import { supabase } from '../auth/client';
import { parseCloudQuery } from './cloudQuery';

export function createCloudDb(scope: string) {
  if (!supabase) throw new Error('Облачное хранилище не настроено.');
  const client = supabase;
  const table = (name: string) => client.from(`glow_data_${name}`);
  return {
    async execute(sql: string, binds: unknown[] = []) {
      const plan = parseCloudQuery(sql, binds);
      if (!plan) return { rowsAffected: 0 };
      let request;
      if (plan.operation === 'insert') {
        // Duplicate IDs are rejected, never silently overwrite another device.
        request = table(plan.table).insert({ ...plan.values, scope }).select('*');
      } else {
        if (!plan.filter || !['update','delete'].includes(plan.operation)) throw new Error('Invalid write');
        const write = plan.operation === 'update' ? table(plan.table).update(plan.values!) : table(plan.table).delete();
        request = write.eq('scope',scope).eq(plan.filter.column,plan.filter.value).select('*');
      }
      const { data, error } = await request;
      if (error) throw new Error(`Не удалось сохранить данные в облаке (${error.code}).`);
      return { rowsAffected: data?.length || 0 };
    },
    async select<T>(sql: string, binds: unknown[] = []): Promise<T[]> {
      const plan = parseCloudQuery(sql, binds);
      if (!plan || plan.operation !== 'select') throw new Error('Invalid read');
      let request = table(plan.table).select('*').eq('scope',scope);
      if (plan.filter) request = request.eq(plan.filter.column,plan.filter.value);
      if (plan.order) request = request.order(plan.order.column, { ascending:plan.order.ascending });
      request = request.order(plan.table === 'app_settings' ? 'key' : 'id');
      // Explicit pagination avoids Supabase's default 1000-row truncation.
      const rows: T[] = [];
      const limit = plan.limit ?? 100000;
      for (let offset=0; offset<limit; offset+=500) {
        const { data,error } = await request.range(offset, Math.min(offset+499,limit-1));
        if (error) throw new Error(`Не удалось загрузить облачные данные (${error.code}).`);
        rows.push(...(data || []) as T[]);
        if (!data || data.length < 500) break;
      }
      return rows;
    },
  };
}
