/* The registry of applications. In memory; given a file, every change is
 * written through so a restart keeps what was filed. */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Application } from "./contract.ts";

export type Store = {
  list(): Application[];
  get(id: string): Application | undefined;
  byReference(reference: string): Application | undefined;
  byIdempotencyKey(entity: string, key: string): Application | undefined;
  save(application: Application): void;
  /** The next number in a reference sequence. */
  next(prefix: string): number;
};

type Snapshot = { applications: Application[]; sequences: Record<string, number> };

const clone = <T>(value: T): T => structuredClone(value);

export function createStore(file?: string): Store {
  let data: Snapshot = { applications: [], sequences: {} };
  if (file && existsSync(file)) data = JSON.parse(readFileSync(file, "utf8")) as Snapshot;

  const flush = () => {
    if (!file) return;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2));
    renameSync(`${file}.tmp`, file);
  };

  return {
    list: () => clone(data.applications),
    get: (id) => clone(data.applications.find((a) => a.id === id)),
    byReference: (reference) => clone(data.applications.find((a) => a.reference === reference)),
    byIdempotencyKey: (entity, key) => clone(data.applications.find((a) => a.entity === entity && a.idempotencyKey === key)),
    save(application) {
      const index = data.applications.findIndex((a) => a.id === application.id);
      if (index >= 0) data.applications[index] = clone(application);
      else data.applications.push(clone(application));
      flush();
    },
    next(prefix) {
      data.sequences[prefix] = (data.sequences[prefix] ?? 0) + 1;
      flush();
      return data.sequences[prefix];
    },
  };
}
