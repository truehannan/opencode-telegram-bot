import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  healthMock: vi.fn(),
  fetchCurrentAgentMock: vi.fn(),
  fetchCurrentModelMock: vi.fn(),
  sessionStatusMock: vi.fn(),
  getCurrentSessionMock: vi.fn(),
  getCurrentProjectMock: vi.fn(),
  loggerDebugMock: vi.fn(),
  config: {
    opencode: {
      monitorIntervalSec: 300,
      stateMonitorIntervalSec: 15,
    },
  },
}));

vi.mock("../../src/config.js", () => ({
  config: mocked.config,
}));

vi.mock("../../src/opencode/client.js", () => ({
  opencodeClient: {
    global: {
      health: mocked.healthMock,
    },
    session: {
      status: mocked.sessionStatusMock,
    },
  },
}));

vi.mock("../../src/agent/manager.js", () => ({
  fetchCurrentAgent: mocked.fetchCurrentAgentMock,
}));

vi.mock("../../src/model/manager.js", () => ({
  fetchCurrentModel: mocked.fetchCurrentModelMock,
}));

vi.mock("../../src/session/manager.js", () => ({
  getCurrentSession: mocked.getCurrentSessionMock,
}));

vi.mock("../../src/settings/manager.js", () => ({
  getCurrentProject: mocked.getCurrentProjectMock,
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    debug: mocked.loggerDebugMock,
  },
}));

import { opencodeStateMonitor } from "../../src/opencode/state-monitor.js";

describe("opencode/state-monitor", () => {
  async function flushAsyncWork(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
  }

  beforeEach(() => {
    vi.useFakeTimers();
    opencodeStateMonitor.__resetForTests();
    mocked.healthMock.mockReset();
    mocked.fetchCurrentAgentMock.mockReset();
    mocked.fetchCurrentModelMock.mockReset();
    mocked.sessionStatusMock.mockReset();
    mocked.getCurrentSessionMock.mockReset();
    mocked.getCurrentProjectMock.mockReset();
    mocked.loggerDebugMock.mockReset();

    mocked.getCurrentProjectMock.mockReturnValue({ id: "p1", worktree: "/repo" });
    mocked.getCurrentSessionMock.mockReturnValue({ id: "s1", title: "Session", directory: "/repo" });
    mocked.fetchCurrentModelMock.mockReturnValue({ providerID: "opencode", modelID: "big-pickle" });
    mocked.fetchCurrentAgentMock.mockResolvedValue("build");
    mocked.healthMock.mockResolvedValue({ data: { healthy: true, version: "1.0.0" }, error: null });
    mocked.sessionStatusMock.mockResolvedValue({ data: { s1: { type: "busy" } }, error: null });
  });

  afterEach(() => {
    opencodeStateMonitor.__resetForTests();
    vi.useRealTimers();
  });

  it("collects background snapshot with project/session/model/agent", async () => {
    opencodeStateMonitor.start();
    await flushAsyncWork();

    const snapshot = opencodeStateMonitor.getSnapshot();
    expect(snapshot).not.toBeNull();
    expect(snapshot?.healthy).toBe(true);
    expect(snapshot?.projectWorktree).toBe("/repo");
    expect(snapshot?.sessionId).toBe("s1");
    expect(snapshot?.sessionStatusType).toBe("busy");
    expect(snapshot?.model).toBe("opencode/big-pickle");
    expect(snapshot?.agent).toBe("build");
  });

  it("keeps monitor alive on refresh errors", async () => {
    mocked.healthMock.mockRejectedValue(new Error("offline"));

    opencodeStateMonitor.start();
    await flushAsyncWork();

    const snapshot = opencodeStateMonitor.getSnapshot();
    expect(snapshot).not.toBeNull();
    expect(snapshot?.healthy).toBe(false);
  });
});
