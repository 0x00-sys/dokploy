import debounce from "lodash/debounce";
import { useEffect, useMemo, useState } from "react";

export function useDebounce<T>(value: T, delay?: number): T {
	const [debouncedValue, setDebouncedValue] = useState<T>(value);

	useEffect(() => {
		const timer = setTimeout(() => setDebouncedValue(value), delay || 500);

		return () => {
			clearTimeout(timer);
		};
	}, [value, delay]);

	return debouncedValue;
}

export function useDebouncedCallback<TArgs extends unknown[]>(
	callback: (...args: TArgs) => void,
	delay = 500,
) {
	const debouncedCallback = useMemo(
		() => debounce(callback, delay),
		[callback, delay],
	);

	useEffect(() => {
		return () => {
			debouncedCallback.cancel();
		};
	}, [debouncedCallback]);

	return debouncedCallback;
}
