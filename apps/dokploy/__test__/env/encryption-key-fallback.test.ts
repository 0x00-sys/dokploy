import { expect, it, vi } from "vitest";

const { readFileSyncMock } = vi.hoisted(() => ({
	readFileSyncMock: vi.fn(() => {
		throw new Error("ENOENT");
	}),
}));

vi.mock("node:fs", async (importOriginal) => ({
	...(await importOriginal<typeof import("node:fs")>()),
	readFileSync: readFileSyncMock,
}));

import { decryptValue, encryptValue } from "@dokploy/server/lib/encryption";

it("loads restored encryption keys only after local keys fail", () => {
	const encrypted = encryptValue("KEY=value");

	expect(decryptValue(encrypted)).toBe("KEY=value");
	expect(decryptValue(encrypted)).toBe("KEY=value");
	expect(readFileSyncMock).not.toHaveBeenCalled();

	expect(() => decryptValue("enc:v1:invalid")).toThrow();
	expect(readFileSyncMock).toHaveBeenCalledOnce();
});
