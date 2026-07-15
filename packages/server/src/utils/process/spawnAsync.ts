import {
	type ChildProcess,
	type SpawnOptions,
	spawn,
} from "node:child_process";
import BufferList from "bl";

const MAX_CAPTURED_OUTPUT_BYTES = 1024 * 1024;

const appendCapturedOutput = (output: BufferList, data: Buffer) => {
	output.append(data);
	const excessBytes = output.length - MAX_CAPTURED_OUTPUT_BYTES;
	if (excessBytes > 0) {
		output.consume(excessBytes);
	}
};

export const spawnAsync = (
	command: string,
	args?: string[] | undefined,
	onData?: (data: string) => void, // Callback opcional para manejar datos en tiempo real
	options?: SpawnOptions,
): Promise<BufferList> & { child: ChildProcess } => {
	const child = spawn(command, args ?? [], options ?? {});
	const stdout = child.stdout ? new BufferList() : new BufferList();
	const stderr = child.stderr ? new BufferList() : new BufferList();

	if (child.stdout) {
		child.stdout.on("data", (data: Buffer) => {
			appendCapturedOutput(stdout, data);
			if (onData) {
				onData(data.toString());
			}
		});
	}
	if (child.stderr) {
		child.stderr.on("data", (data: Buffer) => {
			appendCapturedOutput(stderr, data);
			if (onData) {
				onData(data.toString());
			}
		});
	}

	const promise = new Promise<BufferList>((resolve, reject) => {
		child.on("error", reject);

		child.on("close", (code) => {
			if (code === 0) {
				resolve(stdout);
			} else {
				const err = new Error(`${stderr.toString()}`) as Error & {
					code: number;
					stderr: BufferList;
					stdout: BufferList;
				};
				err.code = code || -1;
				err.stderr = stderr;
				err.stdout = stdout;
				reject(err);
			}
		});
	}) as Promise<BufferList> & { child: ChildProcess };

	promise.child = child;

	return promise;
};
