import { expect, it, vi } from "vitest";
import { closeContainerLogSocket } from "@/components/dashboard/docker/logs/docker-logs-id";

it("closes a container log socket without waiting for it to open", () => {
	const close = vi.fn();

	closeContainerLogSocket({ close });

	expect(close).toHaveBeenCalledOnce();
});
