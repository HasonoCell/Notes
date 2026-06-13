```javascript
import { useState, useEffect, useSyncExternalStore } from 'react';

// ==========================================
// 1. 核心类：QueryClient (全局缓存与状态管理)
// ==========================================
class QueryClient {
    constructor() {
        // 缓存字典：存储所有 query 的状态、数据和订阅者
        this.queries = new Map();
    }

    // 获取或初始化一个 query 对象
    getQuery(queryKey) {
        const key = JSON.stringify(queryKey); // 简单的序列化作为唯一键

        if (!this.queries.has(key)) {
            this.queries.set(key, {
                data: undefined,
                status: 'pending', // 'pending' | 'success' | 'error'
                error: null,
                promise: null, // 用于【请求去重】
                subscribers: new Set(), // 观察者队列
            });
        }
        return this.queries.get(key);
    }

    // 执行请求
    async fetchQuery(queryKey, queryFn) {
        const query = this.getQuery(queryKey);

        // 【核心机制：请求去重】
        // 如果当前正在请求中（promise 存在），直接返回同一个 promise，避免重复发请求
        if (query.promise) {
            return query.promise;
        }

        // 更新状态为请求中，并通知所有订阅了该请求的组件
        query.status = 'pending';
        this.notify(queryKey);

        // 发起真实请求并缓存 promise
        query.promise = queryFn()
            .then(data => {
                query.status = 'success';
                query.data = data;
                query.error = null;
                this.notify(queryKey); // 请求成功，触发组件重新渲染
            })
            .catch(error => {
                query.status = 'error';
                query.error = error;
                this.notify(queryKey); // 请求失败，触发组件重新渲染
            })
            .finally(() => {
                query.promise = null; // 请求结束，清空 promise
            });

        return query.promise;
    }

    // 订阅机制：让 React 组件监听缓存变化
    subscribe(queryKey, callback) {
        const query = this.getQuery(queryKey);
        query.subscribers.add(callback);
        // 返回取消订阅的函数
        return () => {
            query.subscribers.delete(callback);
        };
    }

    // 通知所有订阅者更新状态
    notify(queryKey) {
        const query = this.getQuery(queryKey);
        query.subscribers.forEach(callback => callback());
    }
}

// 实例化一个全局单例（实际 React Query 中通常通过 Context 提供）
const queryClient = new QueryClient();

// ==========================================
// 2. 自定义 Hook：useQuery (连接 React 与缓存)
// ==========================================
export function useQuery({ queryKey, queryFn }) {
    // 获取当前缓存中的初始状态
    const getSnapshot = () => {
        const query = queryClient.getQuery(queryKey);
        return { data: query.data, status: query.status, error: query.error };
    };

    const [state, setState] = useState(getSnapshot);

    useEffect(() => {
        // 1. 订阅缓存变化。当请求成功或失败时，QueryClient 会调用 setState 更新组件
        const unsubscribe = queryClient.subscribe(queryKey, () => {
            setState(getSnapshot());
        });

        // 2. 挂载时主动触发一次请求
        queryClient.fetchQuery(queryKey, queryFn);

        // 3. 卸载时取消订阅，防止内存泄漏
        return unsubscribe;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(queryKey)]);

    // 返回给组件的状态：isLoading, data, error 等
    return {
        ...state,
        isLoading: state.status === 'pending',
        isSuccess: state.status === 'success',
        isError: state.status === 'error',
    };
}

export function useQuery({ queryKey, queryFn }) {
    // 1. 使用 useSyncExternalStore 将组件与 QueryClient 的缓存状态绑定
    const state = useSyncExternalStore(
        // subscribe 函数：告诉 React 如何订阅外部 store
        callback => queryClient.subscribe(queryKey, callback),

        // getSnapshot 函数：告诉 React 如何获取当前最新的状态
        () => {
            const query = queryClient.getQuery(queryKey);
            // 注意：真实场景中需要保证返回对象的引用在数据不变时相同，
            // 这里为了简便每次都返回了新对象，严谨的话可以在 QueryClient 中缓存 snapshot
            return JSON.stringify({ data: query.data, status: query.status, error: query.error });
        },
    );

    // 解析状态（因为上面的 snapshot 为了引用稳定做了序列化，实际源码里是维护了一个不可变对象）
    const parsedState = JSON.parse(state);

    // 2. 触发请求逻辑：确保在组件挂载或 queryKey 改变时去拉取数据
    useEffect(() => {
        queryClient.fetchQuery(queryKey, queryFn);
    }, [JSON.stringify(queryKey), queryFn]);

    // 3. 返回友好的 API 供组件使用
    return {
        ...parsedState,
        isLoading: parsedState.status === 'pending',
        isSuccess: parsedState.status === 'success',
        isError: parsedState.status === 'error',
    };
}
```
