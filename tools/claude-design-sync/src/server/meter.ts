// What the bar's flame shows: the Claude Code calls this server has running right now (each one spends
// tokens), and what the finished ones cost since the server started. Every runner the server hands out is
// metered here, so the flame follows the processes themselves, not a guess from job states. The GUI polls
// it (GET /api/meter) rather than holding a stream open: a page already keeps a job stream or two, and a
// browser allows six connections per host.
import type { Runner } from "../engine/designsync";

export interface Burning {
  id: number;
  /** What the call is doing, in the GUI's words ("Pulling the Design project") */
  what: string;
  since: string;
  jobId?: string;
}

export interface MeterState {
  burning: Burning[];
  /** Finished calls since the server started, and their cost as Claude Code reports it */
  calls: number;
  spentUsd: number;
  since: string;
}

export class Meter {
  private live = new Map<number, Burning>();
  private next = 1;
  private calls = 0;
  private spentUsd = 0;
  private readonly since = new Date().toISOString();

  state(): MeterState {
    return { burning: [...this.live.values()], calls: this.calls, spentUsd: this.spentUsd, since: this.since };
  }

  /** The same runner, with each of its calls counted as burning while it runs */
  meter(runner: Runner, what: string, jobId?: string): Runner {
    return async (prompt, opts, on) => {
      const id = this.next++;
      this.live.set(id, { id, what, since: new Date().toISOString(), ...(jobId ? { jobId } : {}) });
      try {
        const done = await runner(prompt, opts, on);
        if (typeof done.costUsd === "number") this.spentUsd += done.costUsd;
        return done;
      } finally {
        this.calls++;
        this.live.delete(id);
      }
    };
  }
}
