import {
	Children,
	isValidElement,
	type ReactElement,
	type ReactNode,
} from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	useDebounce: vi.fn(),
	useQuery: vi.fn(),
	useReactTable: vi.fn(),
}));

vi.mock("react", async (importOriginal) => ({
	...(await importOriginal<typeof import("react")>()),
	useMemo: <T>(factory: () => T) => factory(),
	useState: <T>(initial: T) => [
		(typeof initial === "string" ? "settled.example.co" : initial) as T,
		vi.fn(),
	],
}));

vi.mock("@tanstack/react-table", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tanstack/react-table")>()),
	useReactTable: mocks.useReactTable,
}));

vi.mock("@/utils/hooks/use-debounce", () => ({
	useDebounce: mocks.useDebounce,
}));

vi.mock("@/components/ui/input", () => ({
	Input: "input",
}));

vi.mock("@/utils/api", () => ({
	api: {
		settings: {
			readStatsLogs: {
				useQuery: mocks.useQuery,
			},
		},
	},
}));

import { RequestsTable } from "@/components/dashboard/requests/requests-table";

const findElement = (
	node: ReactNode,
	predicate: (element: ReactElement<Record<string, unknown>>) => boolean,
): ReactElement<Record<string, unknown>> | undefined => {
	if (!isValidElement<Record<string, unknown>>(node)) {
		return undefined;
	}

	if (predicate(node)) {
		return node;
	}

	for (const child of Children.toArray(node.props.children as ReactNode)) {
		const match = findElement(child, predicate);
		if (match) {
			return match;
		}
	}

	return undefined;
};

describe("RequestsTable search", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.useDebounce.mockReturnValue("settled.example.com");
		mocks.useQuery.mockReturnValue({ data: { data: [], totalCount: 0 } });
		mocks.useReactTable.mockReturnValue({
			getAllColumns: () => [],
			getCanNextPage: () => false,
			getCanPreviousPage: () => false,
			getHeaderGroups: () => [],
			getRowModel: () => ({ rows: [] }),
			nextPage: vi.fn(),
			previousPage: vi.fn(),
		});
	});

	it("only sends the settled hostname search to the access-log query", () => {
		const rendered = RequestsTable({
			dateRange: {
				from: new Date("2026-07-13T00:00:00.000Z"),
				to: new Date("2026-07-16T00:00:00.000Z"),
			},
		});
		const searchInput = findElement(
			rendered,
			(element) => element.props.placeholder === "Filter by hostname...",
		);

		expect(mocks.useDebounce).toHaveBeenCalledWith("settled.example.co", 350);
		expect(searchInput?.props.value).toBe("settled.example.co");
		expect(mocks.useQuery).toHaveBeenCalledWith(
			{
				sort: undefined,
				page: { pageIndex: 0, pageSize: 10 },
				search: "settled.example.com",
				status: [],
				dateRange: {
					start: "2026-07-13T00:00:00.000Z",
					end: "2026-07-16T00:00:00.000Z",
				},
			},
			{ refetchInterval: 1333 },
		);
	});
});
