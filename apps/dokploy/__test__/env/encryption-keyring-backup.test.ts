import { createCipheriv } from "node:crypto";
import { expect, it, vi } from "vitest";

const { restoredKey, restoredKeyHex } = vi.hoisted(() => ({
	restoredKey: Buffer.alloc(32, 7),
	restoredKeyHex: "07".repeat(32),
}));

vi.mock("node:fs", async (importOriginal) => ({
	...(await importOriginal<typeof import("node:fs")>()),
	readFileSync: vi.fn(() => restoredKeyHex),
}));

import {
	decryptValue,
	exportEncryptionKeys,
} from "@dokploy/server/lib/encryption";

const encryptWithRestoredKey = (value: string) => {
	const iv = Buffer.alloc(12, 3);
	const cipher = createCipheriv("aes-256-gcm", restoredKey, iv);
	const ciphertext = Buffer.concat([
		cipher.update(value, "utf8"),
		cipher.final(),
	]);
	return `enc:v1:${Buffer.concat([
		iv,
		cipher.getAuthTag(),
		ciphertext,
	]).toString("base64")}`;
};

it("keeps restored keys in subsequent backup keyring exports", () => {
	const storedValue = encryptWithRestoredKey("KEY=server-a");

	expect(decryptValue(storedValue)).toBe("KEY=server-a");
	expect(exportEncryptionKeys().split("\n")).toContain(restoredKeyHex);
});
