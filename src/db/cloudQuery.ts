// Transitional bridge for existing repository statements, not a general SQL parser.
const tables = new Set(['projects','conversations','messages','ui_widgets','attachments','artifacts','artifact_revisions','domain_records','project_files','app_settings','model_catalog','token_usage','global_memory','game_mode_events','mcp_servers']);
type Filter = { column: string; value: unknown };
export type CloudQuery = { table: string; operation: 'select' | 'insert' | 'update' | 'delete'; values?: Record<string, unknown>; filter?: Filter; order?: { column: string; ascending: boolean }; limit?: number };
function identifier(value: string) {
  if (!/^[a-z_]+$/.test(value) || ['user_id', 'scope'].includes(value)) throw new Error('Unsupported cloud column');
  return value;
}
export function parseCloudQuery(sql: string, binds: unknown[] = []): CloudQuery | null {
  const q = sql.trim().replace(/\s+/g, ' ').replace(/;$/, '');
  if (/^(CREATE TABLE IF NOT EXISTS|ALTER TABLE) /i.test(q)) return null;
  const table = q.match(/^(?:SELECT \* FROM|INSERT INTO|UPDATE|DELETE FROM) (\w+)/i)?.[1];
  if (!table || !tables.has(table)) throw new Error('Unsupported cloud statement');
  const value = (position: string) => {
    const index = Number(position) - 1;
    if (index < 0 || index >= binds.length) throw new Error('Missing query parameter');
    return binds[index];
  };
  const insert = q.match(/^INSERT INTO \w+ \(([^)]+)\) VALUES \(([^)]+)\)$/i);
  if (insert) {
    const columns = insert[1].split(',').map(s => identifier(s.trim()));
    const params = insert[2].split(',').map(s => s.trim());
    if (columns.length !== params.length || params.some(p => !/^\$\d+$/.test(p))) throw new Error('Unsupported insert');
    return { table, operation: 'insert', values: Object.fromEntries(columns.map((c,i) => [c,value(params[i].slice(1))])) };
  }
  const update = q.match(/^UPDATE \w+ SET (.+) WHERE (\w+)\s*=\s*\$(\d+)$/i);
  if (update) {
    const entries = update[1].split(',').map(part => {
      const match = part.trim().match(/^(\w+)\s*=\s*\$(\d+)$/);
      if (!match) throw new Error('Unsupported update');
      return [identifier(match[1]), value(match[2])] as const;
    });
    return { table, operation:'update', values:Object.fromEntries(entries), filter:{ column:identifier(update[2]), value:value(update[3]) } };
  }
  const read = q.match(/^(SELECT \* FROM|DELETE FROM) \w+(?: WHERE (\w+)\s*=\s*\$(\d+))?(?: ORDER BY (\w+) (ASC|DESC))?(?: LIMIT (\d+))?$/i);
  if (!read || (read[1].toUpperCase() === 'DELETE FROM' && !read[2])) throw new Error('Unsupported cloud query');
  return { table, operation:read[1].toUpperCase() === 'DELETE FROM' ? 'delete':'select',
    filter: read[2] ? { column:identifier(read[2]), value:value(read[3]) }:undefined,
    order: read[4] ? { column:identifier(read[4]), ascending:read[5].toUpperCase() === 'ASC' }:undefined,
    limit: read[6] ? Math.min(Number(read[6]), 1000):undefined };
}
