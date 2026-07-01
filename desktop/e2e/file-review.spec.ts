import { expect, test, type Page } from "@playwright/test";

import {
  APP_BASE,
  RICH_SESSION,
  WORKSPACE_A,
  createWorkbenchBackend,
  installWebSocketMock,
  mockWorkbenchBackend,
} from "./workbench-e2e-fixtures";

const REVIEW_DIFF = "--- a/README.md\n+++ b/README.md\n@@ -1 +1,2 @@\n-old\n+new\n+added";
const DEFERRED_REVIEW_DIFF =
  "--- a/README.md\n+++ b/README.md\n@@ -1 +1,2 @@\n-old\n+loaded\n+reviewed";

test("right sidebar review action opens an empty review panel", async ({ page }) => {
  const backend = createWorkbenchBackend({
    historyBySession: {
      [RICH_SESSION]: [],
    },
  });
  await installWebSocketMock(page);
  await mockWorkbenchBackend(page, backend);

  await gotoRichConversation(page);
  await expect(page.getByTestId("app-shell")).toBeVisible();

  await page.getByLabel("展开右侧栏").click();
  await page.getByRole("button", { name: "审阅" }).click();

  await expect(page.getByTestId("app-shell")).toHaveAttribute("data-right-sidebar", "open");
  await expect(page.getByRole("tab", { name: "审阅" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("right-sidebar-review-panel")).toBeVisible();
  await expect(page.getByTestId("review-empty-state")).toContainText("暂无可审阅的文件变更");
});

test("file mutation tool filename opens the right sidebar unified review diff", async ({ page }) => {
  const backend = createWorkbenchBackend({
    historyBySession: {
      [RICH_SESSION]: [fileMutationMessage({ id: "file-review-click" })],
    },
  });
  await installWebSocketMock(page);
  await mockWorkbenchBackend(page, backend);

  await gotoRichConversation(page);
  const fileTool = await revealFileMutationTool(page);

  await fileTool.getByRole("button", { name: "README.md" }).click();

  await expect(page.getByTestId("app-shell")).toHaveAttribute("data-right-sidebar", "open");
  await expect(page.getByRole("tab", { name: "审阅" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("right-sidebar-review-panel")).toBeVisible();
  await expect(page.getByTestId("right-sidebar-review-panel").getByTestId("file-review-card")).toHaveCount(0);
  await expect(page.getByLabel("文件 diff")).toContainText("+new");
  await expect(page.getByLabel("文件 diff")).toContainText("+added");
  const wrapButton = page.getByRole("button", { name: "关闭自动换行" });
  await expect(wrapButton).toHaveAttribute("aria-pressed", "true");
  await expect(wrapButton).toHaveAttribute("data-tooltip-label", "取消换行");
  await expect(page.getByLabel("文件 diff")).toHaveAttribute("data-wrap", "true");
  await wrapButton.hover();
  await expect(page.locator("[role='tooltip']").filter({ hasText: "取消换行" })).toBeVisible();
  await wrapButton.click();
  await expect(page.getByLabel("文件 diff")).toHaveAttribute("data-wrap", "false");
  await page.getByRole("button", { name: "开启自动换行" }).click();
  await expect(page.getByLabel("文件 diff")).toHaveAttribute("data-wrap", "true");
  await page.getByRole("button", { name: "收起 README.md diff" }).click();
  await expect(page.getByLabel("文件 diff")).toHaveCount(0);
  await page.getByRole("button", { name: "展开 README.md diff" }).click();
  await expect(page.getByLabel("文件 diff")).toContainText("+new");
  await expect(page.getByRole("tab", { name: "文件" })).toHaveCount(0);

  const openFileButton = page.getByRole("button", { name: "打开文件 README.md" });
  await expect(openFileButton).toHaveAttribute("data-tooltip-label", "打开文件");
  expect(await openFileButton.getAttribute("title")).toBeNull();
  await openFileButton.hover();
  await expect(page.locator("[role='tooltip']").filter({ hasText: "打开文件" })).toBeVisible();
  await openFileButton.click();

  await expect(page.getByRole("tab", { name: "文件" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("workspace-file-browser-preview")).toBeVisible();
  expect(backend.workspaceReadRequests.at(-1)).toMatchObject({ workspaceId: WORKSPACE_A, path: "README.md" });
});

test("file mutation tool details render a compact diff panel instead of raw JSON", async ({ page }) => {
  const backend = createWorkbenchBackend({
    historyBySession: {
      [RICH_SESSION]: [fileMutationMessage({ id: "file-review-details" })],
    },
  });
  await installWebSocketMock(page);
  await mockWorkbenchBackend(page, backend);

  await gotoRichConversation(page);
  const fileTool = await revealFileMutationTool(page);

  const detailsToggle = fileTool.getByRole("button", { name: "展开工具详情" });
  await detailsToggle.focus();
  await detailsToggle.press("Enter");

  await expect(fileTool.getByTestId("file-review-card")).toBeVisible();
  await expect(fileTool.getByLabel("文件 diff")).toContainText("+new");
  await expect(fileTool.getByLabel("文件 diff")).toContainText("+added");
  await expect(fileTool.getByText("工具入参")).toHaveCount(0);
  await expect(fileTool.getByText("工具输出")).toHaveCount(0);
});

test("deferred file mutation click loads tool details before opening the review diff", async ({ page }) => {
  const backend = createWorkbenchBackend({
    historyBySession: {
      [RICH_SESSION]: [
        fileMutationMessage({
          diff: "",
          id: "deferred-file-review",
          deferred: true,
        }),
      ],
    },
    toolDetailsByRef: {
      "review-start:review-end": {
        detailRef: {
          startEventId: "review-start",
          endEventId: "review-end",
          runId: "run-review",
          toolCallId: "call-review",
        },
        runId: "run-review",
        toolCallId: "call-review",
        toolName: "apply_patch",
        toolParams: { path: "README.md" },
        toolResult: "patched",
        status: "completed",
        fileChanges: [
          {
            path: "README.md",
            operation: "update",
            added_lines: 2,
            deleted_lines: 1,
            diff: DEFERRED_REVIEW_DIFF,
          },
        ],
      },
    },
  });
  await installWebSocketMock(page);
  await mockWorkbenchBackend(page, backend);

  await gotoRichConversation(page);
  const fileTool = await revealFileMutationTool(page);

  await fileTool.getByRole("button", { name: "README.md" }).click();

  await expect.poll(() => backend.toolDetailsRequests.length).toBe(1);
  expect(backend.toolDetailsRequests.at(-1)).toMatchObject({
    sessionId: RICH_SESSION,
    startEventId: "review-start",
    endEventId: "review-end",
  });
  await expect(page.getByTestId("app-shell")).toHaveAttribute("data-right-sidebar", "open");
  await expect(page.getByRole("tab", { name: "审阅" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("文件 diff")).toContainText("+loaded");
  await expect(page.getByLabel("文件 diff")).toContainText("+reviewed");
});

async function revealFileMutationTool(page: Page) {
  await expect(page.getByLabel("继续输入")).toBeVisible();
  await page.getByTestId("message-list-scroll").evaluate((element) => {
    element.scrollTop = 0;
  });
  const group = page.getByTestId("message-group-block").first();
  if (await group.count()) {
    await group.getByRole("button").first().click();
  }
  const fileTool = page.getByTestId("tool-call-block").filter({ hasText: "README.md" }).first();
  await expect(fileTool).toBeVisible();
  return fileTool;
}

async function gotoRichConversation(page: Page) {
  await page.goto(`${APP_BASE}/#/conversation/${RICH_SESSION}`, { waitUntil: "commit" });
}

function fileMutationMessage({
  deferred = false,
  diff = REVIEW_DIFF,
  id = "file-review",
}: {
  deferred?: boolean;
  diff?: string;
  id?: string;
}) {
  return {
    id,
    sessionId: RICH_SESSION,
    role: "tool",
    content: "README.md",
    timestamp: 1_782_518_400_000,
    toolName: "apply_patch",
    toolParams: { path: "README.md" },
    toolResult: deferred ? "" : "patched",
    status: "completed",
    toolDetailsDeferred: deferred,
    toolDetailRef: deferred
      ? {
          startEventId: "review-start",
          endEventId: "review-end",
          runId: "run-review",
          toolCallId: "call-review",
        }
      : null,
    runId: "run-review",
    toolCallId: "call-review",
    fileChanges: [
      {
        path: "README.md",
        operation: "update",
        added_lines: deferred ? 0 : 2,
        deleted_lines: deferred ? 0 : 1,
        diff,
      },
    ],
  };
}
