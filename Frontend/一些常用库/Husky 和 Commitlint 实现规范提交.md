在每次提交代码前，我们可以使用 CommitLint + Husky + Lint-Staged 实现对代码的 ESlint + Prettier 审查，从而规范代码质量。



初始化配置流程：

1. 安装 commitlint，husky 和 lint-staged：  
`pnpm install @commitlint/cli @commitlint/config-conventional -D`  
`pnpm install husky lint-staged -D`
2. 初始化 git 仓库：`git init`
3. 创建 commitlint.config.js，如：

```javascript
export default {
  extends: ["@commitlint/config-conventional"],
};
```

4. 在 package.json 中配置相关 lint-staged 信息，如

```json
"lint-staged": {
  "*.{js,jsx,ts,tsx,vue}": [
    "eslint . --fix",
  ]
}
```

5. 执行 `npx husky init`，创建 husky 配置文件，配置命令：  
创建 commit-msg 文件：`pnpm exec commitlint --edit "$1"`  
创建 pre-commit 文件：`pnpm lint-staged`
6. 执行 `pnpm husky`，**关联 git 钩子与 husky 的脚本**

****

**feat：新功能**

**fix：修复 bug**

**docs：文档变更**

**style：代码格式（不影响功能，如空格、分号等）**

**refactor：重构（既不是新增功能，也不是修 bug）**

**perf：性能优化**

**test：增加或修改测试**

**build：构建系统或依赖相关变更**

**ci：CI/CD 配置变更**

**chore：其他杂项（如构建流程、辅助工具、依赖管理等）**

