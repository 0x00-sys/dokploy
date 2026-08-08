import { createWriteStream } from "node:fs";
import path from "node:path";
import { IS_CLOUD, paths } from "@dokploy/server/constants";
import type { Schedule } from "@dokploy/server/db/schema/schedule";
import {
	createDeploymentSchedule,
	updateDeployment,
	updateDeploymentStatus,
} from "@dokploy/server/services/deployment";
import { findScheduleById } from "@dokploy/server/services/schedule";
import { scheduledJobs, scheduleJob as scheduleJobNode } from "node-schedule";
import { quote } from "shell-quote";
import { getComposeContainer, getServiceContainer } from "../docker/utils";
import { execAsyncRemote } from "../process/execAsync";
import { spawnAsync } from "../process/spawnAsync";

export type ScheduleRunResult = {
	scheduleId: string;
	deploymentId: string;
	status: "done" | "error";
	message?: string;
	warning?: string;
};

export class ScheduleRunError extends Error {
	readonly result: ScheduleRunResult;

	constructor(
		scheduleId: string,
		deploymentId: string,
		cause: unknown,
		warning?: string,
	) {
		const message =
			cause instanceof Error ? cause.message : "Schedule run failed";
		super(message, { cause });
		this.name = "ScheduleRunError";
		this.result = {
			scheduleId,
			deploymentId,
			status: "error",
			message,
			...(warning ? { warning } : {}),
		};
	}
}

const persistScheduleRunStatus = async (
	deploymentId: string,
	status: "done" | "error",
) => {
	try {
		await updateDeploymentStatus(deploymentId, status);
	} catch (error) {
		console.error(
			`Failed to persist ${status} status for schedule deployment ${deploymentId}`,
			error,
		);
		return status === "done"
			? "Command completed, but its deployment status could not be saved."
			: "Command failed, but its deployment status could not be saved.";
	}
};

export const scheduleJob = (schedule: Schedule) => {
	const { cronExpression, scheduleId, timezone } = schedule;

	// Use timezone from schedule, default to UTC if not specified
	const tz = timezone || "UTC";

	scheduleJobNode(
		scheduleId,
		{
			tz,
			rule: cronExpression,
		},
		async () => {
			await runCommand(scheduleId);
		},
	);
};

export const removeScheduleJob = (scheduleId: string) => {
	const currentJob = scheduledJobs[scheduleId];
	currentJob?.cancel();
};

export const runCommand = async (scheduleId: string) => {
	const {
		application,
		command,
		shellType,
		scheduleType,
		compose,
		serviceName,
		appName,
		serverId,
	} = await findScheduleById(scheduleId);

	const deployment = await createDeploymentSchedule({
		scheduleId,
		title: "Schedule",
		description: "Schedule",
	});

	try {
		if (scheduleType === "application" || scheduleType === "compose") {
			let containerId = "";
			let serverId = "";
			if (scheduleType === "application" && application) {
				const container = await getServiceContainer(
					application.appName,
					application.serverId,
				);
				containerId = container?.Id || "";
				serverId = application.serverId || "";
			}
			if (scheduleType === "compose" && compose) {
				const container = await getComposeContainer(compose, serviceName || "");
				containerId = container?.Id || "";
				serverId = compose.serverId || "";
			}
			if (!containerId) {
				const message =
					scheduleType === "compose"
						? `No running container found for compose service "${serviceName || "unknown"}"`
						: "No running container found for this application";
				if (serverId) {
					await execAsyncRemote(
						serverId,
						`echo ${quote([`❌ ${message}`])} >> ${quote([deployment.logPath])}`,
					);
				} else {
					const writeStream = createWriteStream(deployment.logPath, {
						flags: "a",
					});
					writeStream.write(`❌ ${message}\n`);
					writeStream.end();
				}
				throw new Error(message);
			}

			if (serverId) {
				await execAsyncRemote(
					serverId,
					`
					set -e
					echo "Running scheduled command" >> ${quote([deployment.logPath])};
					docker exec ${quote([containerId])} ${quote([shellType])} -c ${quote([command])} >> ${quote([deployment.logPath])} 2>> ${quote([deployment.logPath])} || {
						echo "❌ Command failed" >> ${quote([deployment.logPath])};
						exit 1;
					}
					echo "✅ Command executed successfully" >> ${quote([deployment.logPath])};
					`,
				);
			} else {
				const writeStream = createWriteStream(deployment.logPath, {
					flags: "a",
				});

				try {
					if (IS_CLOUD) {
						throw new Error(
							"This feature is not available in the cloud version.",
						);
					}
					writeStream.write(
						`docker exec ${containerId} ${shellType} -c ${command}\n`,
					);
					await spawnAsync(
						"docker",
						["exec", containerId, shellType, "-c", command],
						(data) => {
							if (writeStream.writable) {
								writeStream.write(data);
							}
						},
					);

					writeStream.write("✅ Command executed successfully\n");
				} catch (error) {
					writeStream.write("❌ Command failed\n");
					writeStream.write(
						error instanceof Error ? error.message : "Unknown error",
					);
					throw error;
				} finally {
					writeStream.end();
				}
			}
		} else if (scheduleType === "dokploy-server") {
			const writeStream = createWriteStream(deployment.logPath, { flags: "a" });
			try {
				const { SCHEDULES_PATH } = paths();
				const fullPath = path.join(SCHEDULES_PATH, appName || "");

				await spawnAsync(
					"bash",
					["-c", "./script.sh"],
					async (data) => {
						if (writeStream.writable) {
							// we need to extract the PID and Schedule ID from the data
							const pid = data?.match(/PID: (\d+)/)?.[1];

							if (pid) {
								await updateDeployment(deployment.deploymentId, {
									pid,
								});
							}
							writeStream.write(data);
						}
					},
					{
						cwd: fullPath,
					},
				);
			} finally {
				writeStream.end();
			}
		} else if (scheduleType === "server") {
			const { SCHEDULES_PATH } = paths(true);
			const fullPath = path.join(SCHEDULES_PATH, appName || "");
			const command = `
				set -euo pipefail
				echo "Running script" >> ${deployment.logPath};
				bash -o pipefail -c "bash '${fullPath}/script.sh' 2>&1 | tee -a '${deployment.logPath}'" || {
					echo "❌ Command failed" >> ${deployment.logPath};
					exit 1;
				  }
				echo "✅ Command executed successfully" >> ${deployment.logPath};
			`;
			await execAsyncRemote(serverId, command, async (data) => {
				// we need to extract the PID and Schedule ID from the data
				const pid = data?.match(/PID: (\d+)/)?.[1];
				if (pid) {
					await updateDeployment(deployment.deploymentId, {
						pid,
					});
				}
			});
		}
	} catch (error) {
		const warning = await persistScheduleRunStatus(
			deployment.deploymentId,
			"error",
		);
		throw new ScheduleRunError(
			scheduleId,
			deployment.deploymentId,
			error,
			warning,
		);
	}

	const warning = await persistScheduleRunStatus(
		deployment.deploymentId,
		"done",
	);
	return {
		scheduleId,
		deploymentId: deployment.deploymentId,
		status: "done",
		...(warning ? { warning } : {}),
	} satisfies ScheduleRunResult;
};
