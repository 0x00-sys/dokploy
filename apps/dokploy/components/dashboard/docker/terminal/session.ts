export const disposeTerminalSession = (
	terminal: { dispose: () => void },
	socket: { close: () => void },
) => {
	terminal.dispose();
	socket.close();
};
