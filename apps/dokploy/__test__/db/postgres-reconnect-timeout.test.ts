import { once } from "node:events";
import { Duplex } from "node:stream";
import postgres from "postgres";
import { afterEach, describe, expect, it } from "vitest";

const authenticationOk = Buffer.from([82, 0, 0, 0, 8, 0, 0, 0, 0]);
const readyForQuery = Buffer.from([90, 0, 0, 0, 5, 73]);

class PostgresSocket extends Duplex {
	private writes = 0;

	_read() {}

	_write(
		_chunk: Buffer,
		_encoding: BufferEncoding,
		callback: (error?: Error | null) => void,
	) {
		this.writes += 1;
		if (this.writes === 1) {
			queueMicrotask(() =>
				this.push(Buffer.concat([authenticationOk, readyForQuery])),
			);
		} else if (this.writes === 2) {
			queueMicrotask(() => this.push(readyForQuery));
		}
		callback();
	}

	setKeepAlive() {
		return this;
	}
}

describe("Postgres reconnect scheduling", () => {
	const originalSetTimeout = globalThis.setTimeout;

	afterEach(() => {
		globalThis.setTimeout = originalSetTimeout;
	});

	it("never schedules a negative reconnect timeout after an idle disconnect", async () => {
		const sockets: PostgresSocket[] = [];
		const options: postgres.Options<{}> & {
			socket: () => PostgresSocket;
		} = {
			backoff: () => 0.001,
			fetch_types: false,
			max: 1,
			socket: () => {
				const socket = new PostgresSocket();
				sockets.push(socket);
				return socket;
			},
		};
		const sql = postgres(options);

		try {
			await sql`select 1`;
			const firstSocket = sockets[0];
			if (!firstSocket) {
				throw new Error("Postgres did not create its initial socket");
			}
			const closed = once(firstSocket, "close");
			firstSocket.destroy();
			await closed;
			await new Promise((resolve) => originalSetTimeout(resolve, 20));

			const delays: number[] = [];
			globalThis.setTimeout = ((
				handler: (...args: unknown[]) => void,
				delay?: number,
				...args: unknown[]
			) => {
				delays.push(Number(delay ?? 0));
				return originalSetTimeout(handler, delay, ...args);
			}) as typeof setTimeout;

			await sql`select 2`;

			expect(delays[0]).toBeGreaterThanOrEqual(0);
			expect(delays.every((delay) => delay >= 0)).toBe(true);
		} finally {
			globalThis.setTimeout = originalSetTimeout;
			await sql.end({ timeout: 0 });
		}
	});
});
