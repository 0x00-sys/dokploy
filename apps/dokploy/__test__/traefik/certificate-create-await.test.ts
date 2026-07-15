import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const deleteChain = {
		where: vi.fn(),
	};
	const insertChain = {
		returning: vi.fn(),
		values: vi.fn(),
	};
	insertChain.values.mockReturnValue(insertChain);

	return {
		delete: vi.fn(() => deleteChain),
		deleteChain,
		execAsyncRemote: vi.fn(),
		insertChain,
	};
});

vi.mock("@dokploy/server/db", () => ({
	db: {
		delete: mocks.delete,
		insert: vi.fn(() => mocks.insertChain),
	},
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsyncRemote: mocks.execAsyncRemote,
}));

import { createCertificate } from "@dokploy/server/services/certificate";

const certificate = {
	certificateId: "certificate-id",
	certificatePath: "certificate-path",
	name: "Certificate",
	certificateData: "certificate-data",
	privateKey: "private-key",
	autoRenew: null,
	organizationId: "organization-id",
	serverId: "server-id",
};

beforeEach(() => {
	vi.clearAllMocks();
	mocks.execAsyncRemote.mockReset();
	mocks.insertChain.values.mockReturnValue(mocks.insertChain);
	mocks.insertChain.returning.mockResolvedValue([certificate]);
	mocks.deleteChain.where.mockResolvedValue(undefined);
});

it("waits for remote certificate files before reporting creation success", async () => {
	let finishWrite!: () => void;
	const write = new Promise<{ stdout: string; stderr: string }>((resolve) => {
		finishWrite = () => resolve({ stdout: "", stderr: "" });
	});
	mocks.execAsyncRemote.mockReturnValue(write);

	let creationSettled = false;
	const creation = createCertificate(
		{
			name: certificate.name,
			certificateData: certificate.certificateData,
			privateKey: certificate.privateKey,
			organizationId: certificate.organizationId,
			serverId: certificate.serverId,
		},
		certificate.organizationId,
	).finally(() => {
		creationSettled = true;
	});

	await vi.waitFor(() => {
		expect(mocks.execAsyncRemote).toHaveBeenCalledOnce();
	});
	expect(creationSettled).toBe(false);

	finishWrite();
	await expect(creation).resolves.toEqual(certificate);
	expect(mocks.delete).not.toHaveBeenCalled();
});

it("reports a remote certificate write failure", async () => {
	mocks.execAsyncRemote
		.mockRejectedValueOnce(new Error("Remote certificate write failed"))
		.mockResolvedValueOnce({ stdout: "", stderr: "" });

	await expect(
		createCertificate(
			{
				name: certificate.name,
				certificateData: certificate.certificateData,
				privateKey: certificate.privateKey,
				organizationId: certificate.organizationId,
				serverId: certificate.serverId,
			},
			certificate.organizationId,
		),
	).rejects.toThrow("Remote certificate write failed");
	expect(mocks.delete).toHaveBeenCalledOnce();
	expect(mocks.deleteChain.where).toHaveBeenCalledOnce();
	expect(mocks.execAsyncRemote).toHaveBeenCalledTimes(2);
	expect(mocks.execAsyncRemote).toHaveBeenLastCalledWith(
		"server-id",
		"rm -rf /etc/dokploy/traefik/dynamic/certificates/certificate-path",
	);
});

it("preserves the write failure if compensating cleanup also fails", async () => {
	mocks.execAsyncRemote.mockRejectedValue(
		new Error("Remote certificate write failed"),
	);
	mocks.deleteChain.where.mockRejectedValue(
		new Error("Database cleanup failed"),
	);
	const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

	try {
		await expect(
			createCertificate(
				{
					name: certificate.name,
					certificateData: certificate.certificateData,
					privateKey: certificate.privateKey,
					organizationId: certificate.organizationId,
					serverId: certificate.serverId,
				},
				certificate.organizationId,
			),
		).rejects.toThrow("Remote certificate write failed");
		expect(consoleError).toHaveBeenCalledWith(
			expect.stringContaining(certificate.certificateId),
			expect.objectContaining({ message: "Database cleanup failed" }),
		);
	} finally {
		consoleError.mockRestore();
	}
});
