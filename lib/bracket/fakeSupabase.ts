/* eslint-disable @typescript-eslint/no-explicit-any */
// Tiny in-memory stand-in for the Supabase client, just enough to exercise the
// bracket generation / scoring code paths in unit tests. Only the query-builder
// methods those modules actually use are implemented.

type Row = Record<string, any>;

class Query {
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private payload: any = null;
  private filters: [string, any][] = [];
  private wantSelect = false;
  private wantSingle = false;

  constructor(private db: FakeSupabase, private table: string) {}

  insert(rows: Row | Row[]) {
    this.op = 'insert';
    this.payload = rows;
    return this;
  }
  update(fields: Row) {
    this.op = 'update';
    this.payload = fields;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }
  select() {
    // Column args are ignored — the fake returns whole rows.
    this.wantSelect = true;
    return this;
  }
  eq(col: string, val: any) {
    this.filters.push([col, val]);
    return this;
  }
  order() {
    return this;
  }
  single() {
    this.wantSingle = true;
    return this;
  }

  private matches(row: Row) {
    return this.filters.every(([c, v]) => row[c] === v);
  }

  private exec(): { data: any; error: null } {
    const rows = this.db.tables[this.table] ?? (this.db.tables[this.table] = []);

    if (this.op === 'insert') {
      const incoming = Array.isArray(this.payload) ? this.payload : [this.payload];
      const created = incoming.map(r => ({ id: `id_${++this.db.counter}`, ...r }));
      rows.push(...created);
      return { data: this.wantSelect ? created.map(r => ({ ...r })) : null, error: null };
    }

    if (this.op === 'update') {
      const updated = rows.filter(r => this.matches(r));
      updated.forEach(r => Object.assign(r, this.payload));
      return { data: this.wantSelect ? updated.map(r => ({ ...r })) : null, error: null };
    }

    if (this.op === 'delete') {
      this.db.tables[this.table] = rows.filter(r => !this.matches(r));
      return { data: null, error: null };
    }

    // select
    const found = rows.filter(r => this.matches(r)).map(r => ({ ...r }));
    return { data: this.wantSingle ? found[0] ?? null : found, error: null };
  }

  then(resolve: (v: any) => any, reject?: (e: any) => any) {
    return Promise.resolve()
      .then(() => this.exec())
      .then(resolve, reject);
  }
}

export class FakeSupabase {
  tables: Record<string, Row[]> = {};
  counter = 0;

  constructor(seed?: Record<string, Row[]>) {
    if (seed) this.tables = seed;
  }

  from(table: string) {
    return new Query(this, table);
  }
}
