import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	audit: vi.fn(),
	checkPortInUse: vi.fn(),
	prepareEnvironmentVariables: vi.fn(),
	readEnvironmentVariables: vi.fn(),
	readPorts: vi.fn(),
	reloadDockerResource: vi.fn(),
	writeTraefikSetup: vi.fn(),
}));

vi.mock("@dokploy/server", async (importOriginal) => ({
	...(await importOriginal<typeof import("@dokploy/server")>()),
	checkPortInUse: mocks.checkPortInUse,
	prepareEnvironmentVariables: mocks.prepareEnvironmentVariables,
	readEnvironmentVariables: mocks.readEnvironmentVariables,
	readPorts: mocks.readPorts,
	reloadDockerResource: mocks.reloadDockerResource,
	writeTraefikSetup: mocks.writeTraefikSetup,
}));

vi.mock("@/server/api/utils/audit", () => ({ audit: mocks.audit }));

const { settingsRouter } = await import("@/server/api/routers/settings");

const caller = settingsRouter.createCaller({
	req: {} as never,
	res: {} as never,
	db: null as never,
	session: { activeOrganizationId: "org-1" } as never,
	user: { id: "user-1", role: "admin" } as never,
});

beforeEach(() => {
	vi.clearAllMocks();
	mocks.audit.mockResolvedValue(undefined);
	mocks.checkPortInUse.mockResolvedValue({ isInUse: false });
	mocks.prepareEnvironmentVariables.mockReturnValue({});
	mocks.readEnvironmentVariables.mockResolvedValue("");
	mocks.readPorts.mockResolvedValue([]);
});

it("reports a remote Traefik reload failure to the dashboard", async () => {
	mocks.reloadDockerResource.mockRejectedValue(
		new Error("Remote Traefik reload failed"),
	);
	const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

	try {
		await expect(
			caller.reloadTraefik({ serverId: "server-1" }),
		).rejects.toThrow("Remote Traefik reload failed");
	} finally {
		consoleError.mockRestore();
	}
});

it("keeps a local Traefik reload in the background", async () => {
	let release!: () => void;
	const reload = new Promise<void>((resolve) => {
		release = resolve;
	});
	mocks.reloadDockerResource.mockReturnValue(reload);

	await expect(caller.reloadTraefik(undefined)).resolves.toBe(true);
	release();
	await reload;
});

it.each([
	{
		name: "dashboard toggle",
		run: () =>
			caller.toggleDashboard({
				enableDashboard: false,
				serverId: "server-1",
			}),
	},
	{
		name: "environment update",
		run: () =>
			caller.writeTraefikEnv({
				env: "KEY=value",
				serverId: "server-1",
			}),
	},
	{
		name: "port update",
		run: () =>
			caller.updateTraefikPorts({
				additionalPorts: [],
				serverId: "server-1",
			}),
	},
])(
	"reports a remote Traefik $name failure to the dashboard",
	async ({ run }) => {
		mocks.writeTraefikSetup.mockRejectedValue(
			new Error("Remote Traefik update failed"),
		);
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});

		try {
			await expect(run()).rejects.toThrow("Remote Traefik update failed");
		} finally {
			consoleError.mockRestore();
		}
	},
);
