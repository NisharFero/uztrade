/** One graded case. `badGold` means the expectation itself is wrong - the case
 *  names a procedure or a category the corpus does not publish - which fails
 *  the run separately from a product regression. */
export type CaseResult = {
  id: string;
  ok: boolean;
  badGold?: boolean;
  detail?: string;
};

export type RunOptions = { limit?: number; verbose?: boolean };

export type Suite = {
  name: string;
  about: string;
  /** Calls a language model, so it is skipped without a key and scored against
   *  a threshold rather than required to be perfect. */
  needsModel?: boolean;
  /** Reads Postgres, so it is skipped without DATABASE_URL. */
  needsDatabase?: boolean;
  /** Share of cases that must pass. Deterministic suites default to all of them. */
  threshold?: number;
  run(options: RunOptions): Promise<CaseResult[]>;
};

export type SuiteResult = {
  suite: string;
  about: string;
  needsModel: boolean;
  skipped?: string;
  cases: CaseResult[];
  passed: number;
  total: number;
  threshold?: number;
  ms?: number;
};
