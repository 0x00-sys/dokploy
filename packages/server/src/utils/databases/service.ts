import type { Service } from "dockerode";

type ServiceInspect = Awaited<ReturnType<Service["inspect"]>>;

export const updateOrCreateService = async (
	service: Service,
	createService: () => Promise<unknown>,
	updateService: (inspect: ServiceInspect) => Promise<unknown>,
) => {
	let inspect: ServiceInspect;
	try {
		inspect = await service.inspect();
	} catch (error) {
		if (!isDockerNotFoundError(error)) {
			throw error;
		}
		await createService();
		return;
	}

	await updateService(inspect);
};

const isDockerNotFoundError = (error: unknown) =>
	typeof error === "object" &&
	error !== null &&
	"statusCode" in error &&
	error.statusCode === 404;
