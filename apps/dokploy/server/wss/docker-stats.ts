import type http from "node:http";
import {
	docker,
	execAsync,
	execAsyncRemote,
	findServerById,
	getHostSystemStats,
	IS_CLOUD,
	recordAdvancedStats,
	validateRequest,
} from "@dokploy/server";
import { type WebSocket, WebSocketServer } from "ws";
import { isValidContainerId } from "./utils";

export const setupDockerStatsMonitoringSocketServer = (
	server: http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>,
) => {
	const wssTerm = new WebSocketServer({
		noServer: true,
		path: "/listen-docker-stats-monitoring",
	});
	type PollingState = {
		clients: Set<WebSocket>;
		intervalId?: ReturnType<typeof setInterval>;
		isPolling: boolean;
	};
	const activePollers = new Map<string, PollingState>();

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
		let unsubscribe = () => {};
		let isClosed = false;
		ws.on("close", () => {
			isClosed = true;
			unsubscribe();
		});

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
		if (isClosed) return;
		const pollerKey = JSON.stringify([
			session.activeOrganizationId,
			serverId,
			appType,
			appName,
		]);
		let poller = activePollers.get(pollerKey);
		if (!poller) {
			const clients = new Set<WebSocket>();
			const pollingState: PollingState = {
				clients,
				isPolling: false,
			};
			const sendToClients = (message: string) => {
				for (const client of [...clients]) {
					try {
						client.send(message);
					} catch {
						client.close();
					}
				}
			};
			const closeClients = (code: number, reason: string) => {
				for (const client of [...clients]) {
					client.close(code, reason);
				}
			};

			pollingState.intervalId = setInterval(async () => {
				if (pollingState.isPolling) return;
				pollingState.isPolling = true;
				try {
					// Special case: when monitoring "dokploy", get host system stats instead of container stats
					if (appName === "dokploy") {
						const stat = await getHostSystemStats();
						const data = await recordAdvancedStats(stat, appName);
						sendToClients(JSON.stringify({ data }));
						return;
					}

					const filter = {
						status: ["running"],
						...(appType === "application" && {
							label: [`com.docker.swarm.service.name=${appName}`],
						}),
						...(appType === "stack" && {
							label: [`com.docker.stack.namespace=${appName}`],
						}),
						...(appType === "docker-compose" && {
							label: [`com.docker.compose.project=${appName}`],
						}),
					};

					const statsFormat = `\'{"BlockIO":"{{.BlockIO}}","CPUPerc":"{{.CPUPerc}}","Container":"{{.Container}}","ID":"{{.ID}}","MemPerc":"{{.MemPerc}}","MemUsage":"{{.MemUsage}}","Name":"{{.Name}}","NetIO":"{{.NetIO}}"}\'`;
					let stdout = "";
					let stderr = "";
					if (serverId) {
						const remoteFilter =
							appType === "application"
								? `label=com.docker.swarm.service.name=${appName}`
								: appType === "stack"
									? `label=com.docker.stack.namespace=${appName}`
									: `label=com.docker.compose.project=${appName}`;
						const result = await execAsyncRemote(
							serverId,
							`container_id=$(docker ps -q --filter "${remoteFilter}" | head -1); if [ -n "$container_id" ]; then docker stats "$container_id" --no-stream --format ${statsFormat}; fi`,
						);
						stdout = result.stdout;
						stderr = result.stderr;
					} else {
						const containers = await docker.listContainers({
							filters: JSON.stringify(filter),
						});
						const container = containers[0];
						if (container?.State === "running") {
							const result = await execAsync(
								`docker stats ${container.Id} --no-stream --format ${statsFormat}`,
							);
							stdout = result.stdout;
							stderr = result.stderr;
						}
					}
					if (stderr) {
						console.error("Docker stats error:", stderr);
						return;
					}
					if (!stdout.trim()) {
						closeClients(4000, "Container not running");
						return;
					}
					const stat = JSON.parse(stdout);
					const data = await recordAdvancedStats(stat, appName);
					sendToClients(JSON.stringify({ data }));
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					closeClients(4000, `Error: ${message}`);
				} finally {
					pollingState.isPolling = false;
				}
			}, 1300);
			activePollers.set(pollerKey, pollingState);
			poller = pollingState;
		}

		poller.clients.add(ws);
		const subscribedPoller = poller;
		unsubscribe = () => {
			subscribedPoller.clients.delete(ws);
			if (subscribedPoller.clients.size === 0) {
				if (subscribedPoller.intervalId) {
					clearInterval(subscribedPoller.intervalId);
				}
				if (activePollers.get(pollerKey) === subscribedPoller) {
					activePollers.delete(pollerKey);
				}
			}
		};
	});
};
