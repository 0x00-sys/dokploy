import { organizationServicesQuery } from "@dokploy/server";
import { db } from "@dokploy/server/db";
import {
	applications,
	compose,
	libsql,
	mariadb,
	mongo,
	mysql,
	postgres,
	redis,
} from "@dokploy/server/db/schema";
import { expect, it, vi } from "vitest";

it("checks every service family before organization deletion", () => {
	const select = vi.mocked(db.select);
	select.mockClear();
	const chain: Record<string, unknown> = {};
	chain.from = () => chain;
	chain.innerJoin = () => chain;
	chain.where = () => chain;
	chain.limit = () => chain;
	select.mockReturnValue(chain as never);

	organizationServicesQuery("org-1");

	const selectedServiceIds = select.mock.calls.flatMap(([fields]) =>
		fields !== undefined && "serviceId" in fields ? [fields.serviceId] : [],
	);

	expect(selectedServiceIds).toEqual([
		applications.applicationId,
		compose.composeId,
		libsql.libsqlId,
		mariadb.mariadbId,
		mongo.mongoId,
		mysql.mysqlId,
		postgres.postgresId,
		redis.redisId,
	]);
});
