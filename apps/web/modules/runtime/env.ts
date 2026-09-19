type RuntimeEnv = Record<string, unknown>;

export function getRuntimeEnv(): RuntimeEnv {
  return process.env as RuntimeEnv;
}

