import { db } from "@dokploy/server/db";
import {
	applications,
	compose,
	environments,
	libsql,
	mariadb,
	mongo,
	mysql,
	postgres,
	projects,
	redis,
} from "@dokploy/server/db/schema";
import { and, eq, exists, or } from "drizzle-orm";

export const organizationServicesQuery = (organizationId: string) =>
	db
		.select({ environmentId: environments.environmentId })
		.from(environments)
		.innerJoin(projects, eq(environments.projectId, projects.projectId))
		.where(
			and(
				eq(projects.organizationId, organizationId),
				or(
					exists(
						db
							.select({ serviceId: applications.applicationId })
							.from(applications)
							.where(
								eq(applications.environmentId, environments.environmentId),
							),
					),
					exists(
						db
							.select({ serviceId: compose.composeId })
							.from(compose)
							.where(eq(compose.environmentId, environments.environmentId)),
					),
					exists(
						db
							.select({ serviceId: libsql.libsqlId })
							.from(libsql)
							.where(eq(libsql.environmentId, environments.environmentId)),
					),
					exists(
						db
							.select({ serviceId: mariadb.mariadbId })
							.from(mariadb)
							.where(eq(mariadb.environmentId, environments.environmentId)),
					),
					exists(
						db
							.select({ serviceId: mongo.mongoId })
							.from(mongo)
							.where(eq(mongo.environmentId, environments.environmentId)),
					),
					exists(
						db
							.select({ serviceId: mysql.mysqlId })
							.from(mysql)
							.where(eq(mysql.environmentId, environments.environmentId)),
					),
					exists(
						db
							.select({ serviceId: postgres.postgresId })
							.from(postgres)
							.where(eq(postgres.environmentId, environments.environmentId)),
					),
					exists(
						db
							.select({ serviceId: redis.redisId })
							.from(redis)
							.where(eq(redis.environmentId, environments.environmentId)),
					),
				),
			),
		)
		.limit(1);

export const organizationHasServices = async (organizationId: string) => {
	const result = await organizationServicesQuery(organizationId);
	return result.length > 0;
};
