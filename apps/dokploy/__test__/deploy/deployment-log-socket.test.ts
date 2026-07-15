import { expect, it, vi } from "vitest";
import { closeDeploymentLogSocket } from "@/components/dashboard/application/deployments/show-deployment";

it("closes a deployment log socket without waiting for it to open", () => {
	const close = vi.fn();

	closeDeploymentLogSocket({ close });

	expect(close).toHaveBeenCalledOnce();
});
