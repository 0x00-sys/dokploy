import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	syncDeploymentLogScroll,
	VirtualizedDeploymentLogs,
} from "@/components/dashboard/application/deployments/virtualized-deployment-logs";
import type { LogLine } from "@/components/dashboard/docker/logs/utils";
import { DrawerLogRows } from "@/components/shared/drawer-logs";

describe("VirtualizedDeploymentLogs", () => {
	it("renders only the visible rows from a large deployment log", () => {
		const logs: LogLine[] = Array.from({ length: 40_000 }, (_, index) => ({
			message: `log-line-${index}`,
			rawTimestamp: null,
			timestamp: null,
		}));

		const html = renderToStaticMarkup(
			createElement(VirtualizedDeploymentLogs, {
				autoScroll: false,
				logs,
				scrollRef: createRef<HTMLDivElement>(),
			}),
		);
		const renderedRows = html.match(/data-index=/g)?.length ?? 0;

		expect(renderedRows).toBeGreaterThan(0);
		expect(renderedRows).toBeLessThan(100);
		expect(html).toContain("log-line-0");
		expect(html).not.toContain("log-line-1000");
	});

	it("virtualizes large backup logs in the shared drawer", () => {
		const logs: LogLine[] = Array.from({ length: 40_000 }, (_, index) => ({
			message: `backup-log-line-${index}`,
			rawTimestamp: null,
			timestamp: null,
		}));

		const html = renderToStaticMarkup(
			createElement(DrawerLogRows, {
				autoScroll: false,
				logs,
				scrollRef: createRef<HTMLDivElement>(),
			}),
		);
		const renderedRows = html.match(/data-index=/g)?.length ?? 0;

		expect(renderedRows).toBeGreaterThan(0);
		expect(renderedRows).toBeLessThan(100);
		expect(html).toContain("backup-log-line-0");
		expect(html).not.toContain("backup-log-line-1000");
	});

	it("follows the physical scroll bottom when auto-scroll is enabled", () => {
		const scrollElement = {
			scrollHeight: 1_000,
			scrollTop: 100,
		};

		syncDeploymentLogScroll(scrollElement, true);

		expect(scrollElement.scrollTop).toBe(1_000);
	});

	it("preserves the user's position when auto-scroll is disabled", () => {
		const scrollElement = {
			scrollHeight: 1_000,
			scrollTop: 100,
		};

		syncDeploymentLogScroll(scrollElement, false);

		expect(scrollElement.scrollTop).toBe(100);
	});
});
