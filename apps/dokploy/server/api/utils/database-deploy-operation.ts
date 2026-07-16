import { observable } from "@trpc/server/observable";
import {
	fingerprintRestoreInput,
	getOrCreateRestoreOperation,
} from "@/server/api/utils/restore-lock";

type DatabaseType =
	| "postgres"
	| "mysql"
	| "mariadb"
	| "mongo"
	| "redis"
	| "libsql";

interface DatabaseDeployOperationOptions {
	scope: string;
	operationId: string;
	databaseType: DatabaseType;
	databaseId: string;
	deploy: (
		databaseId: string,
		onData: (log: string) => void,
	) => Promise<unknown>;
}

export const createDatabaseDeployOperation = ({
	scope,
	operationId,
	databaseType,
	databaseId,
	deploy,
}: DatabaseDeployOperationOptions) =>
	observable<string>((observer) => {
		try {
			const operation = getOrCreateRestoreOperation({
				scope: `database-deploy:${scope}`,
				key: `database-deploy:${operationId}`,
				fingerprint: fingerprintRestoreInput({ databaseType, databaseId }),
				resourceKey: `database-deploy:${databaseType}:${databaseId}`,
				busyMessage: "A deployment is already running for this database",
				capacityMessage:
					"Too many recent deployment operations; try again later",
				mismatchMessage:
					"This deployment operation ID was already used for a different request",
				run: async (emit) => {
					await deploy(databaseId, emit);
				},
			});

			return operation.subscribe(
				(log) => observer.next(log),
				() => observer.complete(),
			);
		} catch (error) {
			observer.error(error);
			return () => {};
		}
	});
