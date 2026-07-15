import { describe, expect, it } from "vitest";
import { convertDockerSizeToMegabytes } from "@/components/dashboard/monitoring/free/container/docker-size";

describe("convertDockerSizeToMegabytes", () => {
	it("converts Docker decimal units to numeric megabytes", () => {
		expect(convertDockerSizeToMegabytes("512kB")).toBe(0.512);
		expect(convertDockerSizeToMegabytes("12.4MB")).toBe(12.4);
		expect(convertDockerSizeToMegabytes("1.5GB")).toBe(1500);
	});

	it("converts host binary units to numeric megabytes", () => {
		expect(convertDockerSizeToMegabytes("1024KiB")).toBeCloseTo(1.048576);
		expect(convertDockerSizeToMegabytes("1.5GiB")).toBeCloseTo(1610.612736);
	});

	it("preserves existing numeric megabyte samples", () => {
		expect(convertDockerSizeToMegabytes(3.25)).toBe(3.25);
		expect(convertDockerSizeToMegabytes("3.25")).toBe(3.25);
	});

	it("returns zero for invalid or non-finite samples", () => {
		expect(convertDockerSizeToMegabytes("not-a-size")).toBe(0);
		expect(convertDockerSizeToMegabytes(Number.NaN)).toBe(0);
	});
});
