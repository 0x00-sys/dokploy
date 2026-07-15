import { getBackupCommand } from "@dokploy/server/utils/backups/utils";
import { expect, it } from "vitest";

const postgresBackup = {
	backupType: "database",
	database: "app",
	databaseType: "postgres",
	postgres: {
		appName: "postgres-service",
		databaseUser: "postgres",
	},
} as never;

it("streams each database dump to storage exactly once", () => {
	const command = getBackupCommand(
		postgresBackup,
		"rclone rcat :s3:bucket/backup.sql.gz",
		"/tmp/backup.log",
	);

	expect(command.match(/pg_dump/g)).toHaveLength(1);
	expect(command).not.toContain("BACKUP_OUTPUT");
	expect(command).toContain(
		"2>> /tmp/backup.log | rclone rcat :s3:bucket/backup.sql.gz",
	);
});
