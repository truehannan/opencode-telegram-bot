import { fetchCurrentAgent } from "../agent/manager.js";
import { config } from "../config.js";
import { fetchCurrentModel } from "../model/manager.js";
import { opencodeClient } from "./client.js";
import { getCurrentSession } from "../session/manager.js";
import { getCurrentProject } from "../settings/manager.js";
import { logger } from "../utils/logger.js";

export interface OpencodeStateSnapshot {
  checkedAt: string;
  healthy: boolean;
  version: string | null;
  projectWorktree: string | null;
  sessionId: string | null;
  sessionTitle: string | null;
  sessionStatusType: string | null;
  model: string | null;
  agent: string | null;
}

class OpencodeStateMonitor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private refreshInFlight = false;
  private snapshot: OpencodeStateSnapshot | null = null;

  start(): void {
    if (this.timer) {
      return;
    }

    const intervalMs = config.opencode.stateMonitorIntervalSec * 1000;

    void this.refresh("startup");
    this.timer = setInterval(() => {
      void this.refresh("interval");
    }, intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.refreshInFlight = false;
  }

  __resetForTests(): void {
    this.stop();
    this.snapshot = null;
  }

  getSnapshot(): OpencodeStateSnapshot | null {
    return this.snapshot;
  }

  private async refresh(reason: "startup" | "interval"): Promise<void> {
    if (this.refreshInFlight) {
      return;
    }
    this.refreshInFlight = true;

    try {
      const currentProject = getCurrentProject();
      const currentSession = getCurrentSession();
      const model = fetchCurrentModel();
      const [healthResponse, agentResponse, sessionStatusResponse] = await Promise.all([
        opencodeClient.global.health(),
        fetchCurrentAgent().catch(() => null),
        currentProject
          ? opencodeClient.session.status({ directory: currentProject.worktree })
          : Promise.resolve({ data: null, error: null }),
      ]);

      const sessionStatusType =
        currentSession && sessionStatusResponse.data
          ? (sessionStatusResponse.data as Record<string, { type?: string }>)[currentSession.id]?.type ??
            null
          : null;

      this.snapshot = {
        checkedAt: new Date().toISOString(),
        healthy: !healthResponse.error && healthResponse.data?.healthy === true,
        version: healthResponse.data?.version ?? null,
        projectWorktree: currentProject?.worktree ?? null,
        sessionId: currentSession?.id ?? null,
        sessionTitle: currentSession?.title ?? null,
        sessionStatusType,
        model: model ? `${model.providerID}/${model.modelID}` : null,
        agent: agentResponse,
      };
    } catch (error) {
      logger.debug(`[OpenCodeStateMonitor] Failed to refresh snapshot: reason=${reason}`, error);
      if (!this.snapshot) {
        this.snapshot = {
          checkedAt: new Date().toISOString(),
          healthy: false,
          version: null,
          projectWorktree: null,
          sessionId: null,
          sessionTitle: null,
          sessionStatusType: null,
          model: null,
          agent: null,
        };
      }
    } finally {
      this.refreshInFlight = false;
    }
  }
}

export const opencodeStateMonitor = new OpencodeStateMonitor();
