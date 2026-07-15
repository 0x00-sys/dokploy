import type http from "node:http";
import {
	docker,
	execAsync,
	execAsyncRemote,
	findServerById,
	getHostSystemStats,
	getLastAdvancedStatsFile,
	IS_CLOUD,
	recordAdvancedStats,
	validateRequest,
} from "@dokploy/server";
import { WebSocketServer } from "ws";
import { isValidContainerId } from "./utils";

export const setupDockerStatsMonitoringSocketServer = (
	server: http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>,
) => {
	const wssTerm = new WebSocketServer({
		noServer: true,
		path: "/listen-docker-stats-monitoring",
	});

	server.on("upgrade", (req, socket, head) => {
		const { pathname } = new URL(req.url || "", `http://${req.headers.host}`);

		if (pathname === "/_next/webpack-hmr") {
			return;
		}
		if (pathname === "/listen-docker-stats-monitoring") {
			wssTerm.handleUpgrade(req, socket, head, function done(ws) {
				wssTerm.emit("connection", ws, req);
			});
		}
	});

	wssTerm.on("connection", async (ws, req) => {
		const url = new URL(req.url || "", `http://${req.headers.host}`);

		if (IS_CLOUD) {
			ws.send("This feature is not available in the cloud version.");
			ws.close();
			return;
		}
		const appName = url.searchParams.get("appName");
		const serverId = url.searchParams.get("serverId");
		const appType = (url.searchParams.get("appType") || "application") as
			| "application"
			| "stack"
			| "docker-compose";
		const { user, session } = await validateRequest(req);

		if (!appName) {
			ws.close(4000, "appName no provided");
			return;
		}
		if (!isValidContainerId(appName)) {
			ws.close(4000, "Invalid app name");
			return;
		}

		if (!user || !session) {
			ws.close();
			return;
		}
		if (serverId) {
			const server = await findServerById(serverId);
			if (server.organizationId !== session.activeOrganizationId) {
				ws.close();
				return;
			}
		}
		let isPolling = false;
		const intervalId = setInterval(async () => {
			if (isPolling) return;
			isPolling = true;
			try {
				// Special case: when monitoring "dokploy", get host system stats instead of container stats
				if (appName === "dokploy") {
					const stat = await getHostSystemStats();

					await recordAdvancedStats(stat, appName);
					const data = await getLastAdvancedStatsFile(appName);

					ws.send(
						JSON.stringify({
							data,
						}),
					);
					return;
				}

				const filter = {
					status: ["running"],
					...(appType === "application" && {
						label: [`com.docker.swarm.service.name=${appName}`],
					}),
					...(appType === "stack" && {
						label: [`com.docker.swarm.task.name=${appName}`],
					}),
					...(appType === "docker-compose" && {
						name: [appName],
					}),
				};

				let containerId: string | undefined;
				if (serverId) {
					const remoteFilter =
						appType === "application"
							? `label=com.docker.swarm.service.name=${appName}`
							: appType === "stack"
								? `label=com.docker.swarm.task.name=${appName}`
								: `name=${appName}`;
					const result = await execAsyncRemote(
						serverId,
						`docker ps -q --filter "${remoteFilter}" | head -1`,
					);
					containerId = result.stdout.trim() || undefined;
				} else {
					const containers = await docker.listContainers({
						filters: JSON.stringify(filter),
					});
					const container = containers[0];
					if (container?.State === "running") containerId = container.Id;
				}

				if (!containerId) {
					ws.close(4000, "Container not running");
					return;
				}
				const statsCommand = `docker stats ${containerId} --no-stream --format \'{"BlockIO":"{{.BlockIO}}","CPUPerc":"{{.CPUPerc}}","Container":"{{.Container}}","ID":"{{.ID}}","MemPerc":"{{.MemPerc}}","MemUsage":"{{.MemUsage}}","Name":"{{.Name}}","NetIO":"{{.NetIO}}"}\'`;
				const { stdout, stderr } = serverId
					? await execAsyncRemote(serverId, statsCommand)
					: await execAsync(statsCommand);
				if (stderr) {
					console.error("Docker stats error:", stderr);
					return;
				}
				const stat = JSON.parse(stdout);

				await recordAdvancedStats(stat, appName);
				const data = await getLastAdvancedStatsFile(appName);

				ws.send(
					JSON.stringify({
						data,
					}),
				);
			} catch (error) {
				// @ts-ignore
				ws.close(4000, `Error: ${error.message}`);
			} finally {
				isPolling = false;
			}
		}, 1300);

		ws.on("close", () => {
			clearInterval(intervalId);
		});
	});
};
