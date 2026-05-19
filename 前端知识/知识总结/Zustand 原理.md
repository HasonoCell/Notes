```javascript
import { useSyncExternalStore } from 'react';

function createStore(createState) {
    let state;
    const listeners = new Set();

    const setState = partial => {
        const nextState = typeof partial === 'function' ? partial(state) : partial;

        if (!Object.is(nextState, state)) {
            state = { ...state, ...nextState };
            listeners.forEach(l => l());
        }
    };

    const getState = () => state;

    const subscribe = callback => {
        if (!listeners.has(callback)) {
            listeners.add(callback);
        }

        return () => listeners.delete(callback);
    };

    state = createState(setState, getState);

    return { setState, getState, subscribe };
}

function useStore(api, selector = state => state) {
    return useSyncExternalStore(
        callback => api.subscribe(callback),
        () => selector(api.getState()),
    );
}

export const create = createState => {
    // 1. 创建纯粹的 JS store
    const api = createStore(createState);

    // 2. 创建自定义 hook
    const useBoundStore = selector => useStore(api, selector);

    return useBoundStore;
};

const useConuntStore = create(set => ({
    count: 1,
    add: () => set(state => ({ count: state.count++ })),
}));
```
