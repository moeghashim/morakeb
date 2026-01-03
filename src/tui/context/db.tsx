import React, { createContext, useContext, useMemo, useState } from 'react';
import { DB } from '../../db';

const DATABASE_PATH = process.env.DATABASE_PATH || './data/changes.db';

type DBState = { db: DB };

const DBContext = createContext<DBState | null>(null);

export function useDB() {
  const ctx = useContext(DBContext);
  if (!ctx) throw new Error('DBContext not found');
  return ctx.db;
}

export function DBProvider({ children }: { children: React.ReactNode }) {
  const [db] = useState(() => new DB(DATABASE_PATH));
  const value = useMemo(() => ({ db }), [db]);
  return <DBContext.Provider value={value}>{children}</DBContext.Provider>;
}
