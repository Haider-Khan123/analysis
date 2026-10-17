// Server-side database access. Import like:
//   import { db } from "@/integrations/postgres/client.server";
// SECURITY: server functions / routes only. Row-level security is not used,
// so every caller must authorise the request before reading or writing data.
import { auth } from "./auth.server";
import { QueryBuilder } from "./query-builder.server";
import { storageFrom, type Bucket } from "./storage.server";

export const db = {
  from: (table: string) => new QueryBuilder(table),
  auth,
  storage: { from: (bucket: Bucket) => storageFrom(bucket) },
};
