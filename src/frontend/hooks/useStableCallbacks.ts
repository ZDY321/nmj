import { useLayoutEffect, useRef, useState } from "react";

// The caller supplies a fixed set of handlers. Their identities stay stable while
// event dispatch always uses the most recently committed render's implementation.
export function useStableCallbacks<T extends { [K in keyof T]: (...args: never[]) => unknown }>(callbacks: T): T {
  const current = useRef(callbacks);
  useLayoutEffect(() => { current.current = callbacks; });
  const [stable] = useState(() => Object.fromEntries(
    (Object.keys(callbacks) as Array<keyof T>).map(key => [key, (...args: never[]) => current.current[key](...args)])
  ) as T);
  return stable;
}
