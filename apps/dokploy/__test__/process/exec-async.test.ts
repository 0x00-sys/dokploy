import { inspect } from "node:util";
import { ExecError, execAsync } from "@dokploy/server/utils/process/execAsync";
import { describe, expect, it } from "vitest";

describe("execAsync", () => {
	it("keeps failed commands out of messages and automatic error logging", async () => {
		const secret = "registry-password-that-must-not-leak";

		try {
			await execAsync(`false '${secret}'`);
			expect.unreachable("command should fail");
		} catch (error) {
			expect(error).toBeInstanceOf(ExecError);
			expect((error as ExecError).command).toContain(secret);
			expect((error as Error).message).not.toContain(secret);
			expect(inspect(error)).not.toContain(secret);
		}
	});
});
