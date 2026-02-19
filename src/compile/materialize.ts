import type { CompiledProgram, CompiledSession } from "./compileProgram.js";

export interface MaterializedSession extends CompiledSession {
  sequence: number;
}

export function materialize(program: CompiledProgram): MaterializedSession[] {
  return program.sessions.map((session, index) => ({
    ...session,
    sequence: index + 1
  }));
}
