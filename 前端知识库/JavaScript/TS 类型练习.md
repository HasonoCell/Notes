更多的类型练习可以看看 https://github.com/type-challenges/type-challenges 这个仓库，这里只有基础的一些练习

```typescript
interface User {
  name: string;
  age: number;
}

const arr = [1, "a", true];

type MyPick<T, K extends keyof T> = {
  [Q in K]: T[Q];
};

type ItemType<T extends unknown[]> = T[number];

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Record<string, unknown>
    ? DeepPartial<T[K]>
    : T[K];
};

type FunctionType = (...args: any[]) => unknown;
type FirstParams<T extends FunctionType> = T extends (
  first: infer R,
  ...args: any[]
) => any
  ? R
  : never;
type SomeFunc = (x: number, y: string) => boolean;

// 联合类型的自动分发！
type MyExclude<T, K> = T extends K ? never : T;

type MyOmit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

type RES1 = MyPick<User, "age">;
type RES2 = ItemType<typeof arr>;
type RES3 = DeepPartial<User>;
type RES4 = FirstParams<SomeFunc>;
type RES5 = MyOmit<User, "name">;
```

