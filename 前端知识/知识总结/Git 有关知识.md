### 基础用法
个人常用 Git 工作流：

1. 创建项目，本地初始化 Git 仓库，随后连接 Github 远程仓库

```git
git init
git add .
git commit -m 'init commit'
git remote add origin <远程仓库地址>
# origin 就是指你的远程仓库
git push -u origin master
```

2. 创建新分支，在新分支上开发功能/测试

```git
# -c 意思是 create
git switch -c <分支名>

# 每次开发完一个功能模块
git add .
git commit -m '<更改信息>'
git push origin <当前分支名>
```

3. 若确定当前分支的功能开发完毕，开始合并分支

首先在 Github 的远程仓库上处理 Pull Request，无误后即可 Merge Branch 到主分支上，但是注意：<font style="color:#DF2A3F;">此时只是在远程仓库上合并了分支，本地仓库还并没有将分支切换回来</font>

<font style="color:#DF2A3F;">随后在本地仓库内切换回主分支并拉取远程仓库内主分支上的最新代码，完成此操作后再新开分支进行开发</font>

```git
git switch master
git fetch
git merge origin/master
```

4. （可选）若已完成当前分支的开发，可以删除本地和远程仓库里的分支

```git
git branch -d <分支名>
git push origin -d <分支名>
```

### 一些 Git 的高级操作
#### **1. 模拟冲突与解决 (Merge Conflict)**
**场景**：你和同事同时修改了同一个文件的同一部分。当你们先后合并代码到主分支时，Git 不知道该保留谁的修改，于是就产生了“合并冲突”。

**讲解**：  
冲突并不可怕，它只是 Git 在请求你（开发者）来做最终决定。Git 会在冲突文件中用特殊的标记符（`<<<<<<<`, `=======`, `>>>>>>>`）标出不同分支的内容，你需要手动编辑文件，决定最终要保留的代码，然后再次提交。

**实战演练**：

假设你的工作区是干净的，并且当前在 `main` 分支。

1. **创建 dev-A 分支并修改文件**

```git
# 从 main 分支创建并切换到 dev-A
git switch -c dev-A

# 修改 README.md 文件，在第一行添加内容
# 例如，将 "This is a Next.js project." 修改为 "Project Readme by Developer A"
# (请手动修改文件)

# 提交你的修改
git add README.md
git commit -m "docs: Update README from dev-A"
```

2. **创建 dev-B 分支并修改同一文件**

```git
# 首先，切回 main 分支，这是模拟另一位开发者从最新的 main 开始工作
git switch main

# 创建并切换到 dev-B
git switch -c dev-B

# 同样修改 README.md 的第一行，但内容不同
# 例如，修改为 "Project Readme by Developer B"

# 提交修改
git add README.md
git commit -m "docs: Update README from dev-B"
```

3. **合并并触发冲突**

```git
# 切回主分支，准备合并
git switch main

# 合并 dev-A，此时会成功 (Fast-forward)
git merge dev-A

# 再次合并 dev-B，此时 Git 会报告冲突！
git merge dev-B
# 终端会提示：
# CONFLICT (content): Merge conflict in README.md
# Automatic merge failed; fix conflicts and then commit the result.
```

4. **解决冲突**：打开 `README.md` 文件，你会看到类似下面的内容：

```git
<<<<<<< HEAD
Project Readme by Developer A
=======
Project Readme by Developer B
>>>>>>> dev-B
```

解读：
`<<<<<<< HEAD` 到 `=======` 之间是 `main` 分支（`HEAD` 指向的位置）当前的内容。

`=======` 到 `>>>>>>> dev-B` 之间是来自 `dev-B` 分支的内容。

手动解决：删除这些特殊标记行，并根据你的需要保留、修改或组合代码。例如，我们决定两者都保留一些信息：

```git
Project Readme updated by Developer A & B
```

在 VS Code 中解决：VS Code 提供了非常方便的图形化界面来解决冲突。在冲突文件的上方，你会看到 "Accept Current Change | Accept Incoming Change | Accept Both Changes | Compare Changes" 的选项，点击它们可以快速解决冲突。

5. **提交解决后的结果**

```git
# 标记冲突已解决
git add README.md

# 提交一个新的合并 commit
# Git 会自动生成一个默认的 commit message，可以直接使用
git commit 
# (此时会打开一个编辑器让你确认 commit message，保存并关闭即可)
# 或者直接指定 message:
# git commit -m "fix: Resolve merge conflict in README"
```

至此，冲突已成功解决。

---

#### **2. 撤销更改的多种方式**
**场景**：代码写错了，或者提交了不想提交的内容，需要“反悔”。

**讲解**：Git 提供了不同级别的“后悔药”，分别对应工作区、暂存区和版本库的修改。

**实战演练**：

1. **场景一：改动了文件，但还没 **`git add`**，想撤销。**
    - **操作**：`git restore <file>`
    - **效果**：将指定文件从工作区恢复到上一次提交时的状态。你的所有本地修改都会丢失。
    - **演练**：

```git
# 随便修改一下 server.tsx 文件
# 查看状态，会提示 "changes not staged for commit"
git status

# 撤销对 server.tsx 的所有修改
git restore src/components/server.tsx
```

2. **场景二：已经 **`git add`** 到暂存区，但还没 **`commit`**，想撤销 **`add`**。**
    - **操作**：`git restore --staged <file>`
    - **效果**：将文件从暂存区“拉回”到工作区。文件修改的内容还在，但状态从 "staged" 变回了 "not staged"。
    - **演练**：

```git
# 修改 server.tsx 并添加到暂存区
# (手动修改文件)
git add src/components/server.tsx

# 查看状态，会提示 "changes to be committed"
git status

# 将文件移出暂存区
git restore --staged src/components/server.tsx

# 再次查看状态，会提示 "changes not staged for commit"
git status
```

3. **场景三：已经 **`commit`** 了，但发现提交错了，想撤销这次提交。**
- 方式A：撤销提交，但保留代码更改 (**`--soft`**)
    操作：`git reset --soft HEAD~1`
    效果：撤销最近的一次提交，并将那次提交的所有更改放回暂存区。这非常适合修改 commit message 或将这次更改合并到下一次提交中。
```git
# 查看最近的提交记录
git log --oneline

# 执行软重置
git reset --soft HEAD~1

# 再次查看日志，会发现最近一次 commit 消失了
git log --oneline

# 查看状态，会发现上次 commit 的内容已经回到暂存区
git status
```
- 方式B：撤销提交，并彻底丢弃代码更改 (**`--hard`**)
    操作：`git reset --hard HEAD~1`
    效果：彻底移除最近的一次提交，并且工作区和暂存区的所有相关代码更改都会被**永久删除**。请务必确认不再需要这些代码时才使用。

```git
# 确保你有一个可以丢弃的 commit
git commit -m "feat: A temporary commit to be discarded"
git log --oneline

# 执行硬重置
git reset --hard HEAD~1

# 查看日志和状态，你会发现世界恢复了平静，仿佛那个 commit 从未发生过
git log --oneline
git status
```

---

#### **3. Stash - 临时保存工作**
**场景**：你正在 `feat/new-feature` 分支上开发一个复杂功能，代码写了一半，还不能提交。这时线上突然出现一个紧急 bug 需要你立即修复。你必须切换到 `main` 分支，但又不想提交当前未完成的工作。

**讲解**：`git stash` 就是你的救星。它可以将你当前工作区和暂存区的所有未提交的更改“藏”起来，让你的工作目录变得干净，从而可以安全地切换分支。修复完 bug 后，再切回来“解封”你的工作。

**实战演练**：

1. **保存当前工作**

```git
# 假设你在某个功能分支上，并修改了几个文件
# (手动修改 server.tsx 和 client.tsx)
git status # 你会看到一些未提交的更改

# 将这些更改存入 stash
git stash
# 或者添加一条信息，方便以后识别
# git stash push -m "Working on new feature UI"

# 再次查看状态，工作区是干净的
git status
```

2. **切换分支去修复 Bug**

```git
# 此刻你可以安心切换到主分支
git switch main
# ... 在这里进行你的 bug 修复、提交、推送等操作 ...
```

3. **恢复之前的工作**

```git
# Bug 修完后，切回原来的功能分支
git switch feat/new-feature # 假设你之前的分支是这个

# 查看 stash 列表
git stash list
# 会显示类似 stash@{0}: On feat/new-feature: Working on new feature UI

# 恢复最近的 stash 并从列表中删除它
git stash pop

# 查看状态，之前修改的文件又回来了
git status
```

 `pop` vs `apply`：`git stash pop` 会应用并删除 stash，而 `git stash apply` 只会应用，stash 记录会保留，你可以多次应用它。通常用 `pop` 就足够了。

---

#### **4. 交互式变基 (Interactive Rebase)**
**场景**：在你的功能分支上，为了完成一个功能，你可能提交了很多次，commit 历史看起来很乱，比如 "fix typo", "add console log", "remove console log", "wip"。在合并到主分支之前，你希望把这些零碎的提交合并成一个有意义的 commit，让提交历史更清晰、专业。

**讲解**：`git rebase -i` (i 代表 interactive) 是一个强大的历史编辑工具。它允许你重新排序、合并、修改、删除你的提交记录。

**核心原则**：**永远不要对已经推送到远程并被他人使用的公共分支（如 **`main`**, **`develop`**）进行 rebase 操作**，因为它会重写历史，会给协作者带来巨大的麻烦。只在你自己私有的功能分支上使用它。

**实战演练**：

1. **制造一些凌乱的提交**

```git
# 确保你在一个功能分支上，例如 feat/rebase-practice
git switch -c feat/rebase-practice

# 第一次提交
echo "Content part 1" > rebase-test.txt
git add .
git commit -m "feat: Add initial content"

# 第二次提交 (模拟一个修复)
echo "Content part 1 with fix" > rebase-test.txt
git add .
git commit -m "fix: Correct a typo"

# 第三次提交
echo "Content part 1 with fix\nContent part 2" >> rebase-test.txt
git add .
git commit -m "feat: Add second part"

# 查看历史，有3个零碎的 commit
git log --oneline
```

2. **开始交互式变基**

```git
# 我们想整理最近的 3 次提交
git rebase -i HEAD~3
```

3. **编辑变基脚本**
   
执行上述命令后，Git 会打开一个文本编辑器，内容如下：

```git
pick 1a2b3c4 feat: Add initial content
pick 5d6e7f8 fix: Correct a typo
pick 9g0h1i2 feat: Add second part

# Commands:
# p, pick = use commit
# r, reword = use commit, but edit the commit message
# s, squash = use commit, but meld into previous commit
# ... (其他命令)
```

我们的目标：将这 3 个 commit 合并成一个。我们将第一个 `pick` 保留，把后面的两个改成 `s` (squash)。

```git
pick 1a2b3c4 feat: Add initial content
s 5d6e7f8 fix: Correct a typo
s 9g0h1i2 feat: Add second part
```

4. **编写新的 Commit Message**

关闭上一个编辑器后，Git 会打开第二个编辑器，让你为合并后的新 commit 编写 message。内容包含了之前所有 commit 的 message。

```git
# This is a combination of 3 commits.
# The first commit's message is:
feat: Add initial content

# This is the 2nd commit's message:
fix: Correct a typo

# This is the 3rd commit's message:
feat: Add second part
```

删除所有内容，编写一个清晰、完整的 message，例如：

```git
feat: Implement the complete rebase-test feature
```

5. **完成**

终端会提示 `Successfully rebased and updated refs/heads/feat/rebase-practice.`

再次查看历史，你会发现之前 3 个零碎的 commit 已经变成了一个干净的 commit。

```git
git log --oneline
```

#### 5. 非快进式合并
在 Git 中合并分支时，`--no-ff` 代表的是 **"no fast-forward"（不执行快进式合并）**。

为了让你更直观地理解它的含义，我们需要对比一下 Git 默认的合并方式与使用了 `--no-ff` 后的区别。

##### 默认的 Fast-forward（快进式）合并

比如现在 Git 情况是这样的：
```plaintext
【合并前的初始状态】

main:      A --- B 
                  \
feature:           C --- D
```

当你试图将一个分支（比如 `feature`）合并到当前主分支（比如 `main`），并且 `main` 分支在你检出 `feature` 分支之后**没有任何新的提交**时，Git 默认会执行 Fast-forward 合并。
```plaintext
【Fast-forward 合并后的状态】

main:      A --- B --- C --- D  (main 指针直接跳到了这里)
                             |
feature:                     D  (两个分支完全重合了)
```

- **发生了什么：** Git 发现主分支没有往前走，所以它偷了个懒，只是简单地把 `main` 分支的指针“快进”移动到 `feature` 分支的最新提交上。
    
- **结果：** **不会生成新的合并提交记录（Merge Commit）**。分支的历史会变成一条绝对的直线。一旦你删除了 `feature` 分支，以后看日志时，你根本看不出这些代码曾经是在一个单独的分支里开发的。
    

##### 使用 --no-ff（非快进式）合并

如果你在合并时加上了 `--no-ff` 参数（命令为 `git merge --no-ff feature`），即使当前情况完全允许快进合并，Git 也会**强制**拒绝快进。
```plaintext
【--no-ff 合并后的状态】

main:      A --- B ------------- M  (M 是专门为了合并新生成的节点)
                  \             /
feature:           C --- D ----'
```

- **发生了什么：** Git 会强制创建一个**全新的合并提交节点（Merge Commit）**，将两个分支的历史在这个新节点汇合。
    
- **结果：** 历史记录中会清晰地保留分支的“分叉”与“汇合”的拓扑结构。你可以明确看出某个功能是在一个独立分支上开发的，包含了哪些特定的提交，以及是什么时候被合并回主干的。
    

---

##### 为什么要使用 --no-ff？

在团队协作和成熟的开发流程（如 Git Flow）中，通常强烈建议在合并功能分支（Feature Branch）到开发/主分支时使用 `--no-ff`。这主要是出于以下几个优点的考量：

1. **保留业务上下文（可追溯性）：** 每一个功能分支通常对应一个具体的业务需求。保留合并节点，就等于给这组提交打上了一个“包裹”。以后代码复查时，一眼就能看出这几个相关的提交是为了完成同一个功能。
    
2. **极大地降低回滚难度：** 假设某个新功能合并到主干后引发了严重的线上 Bug，需要紧急撤销。
    
    - 如果是 **Fast-forward**：几十个细碎的提交混杂在主干线上，你必须小心翼翼地逐一找出属于该功能的提交去 revert，极易出错。
        
    - 如果是 **--no-ff**：你只需要针对那个唯一的合并提交（Merge Commit）执行一次 `git revert`，就能干净利落、安全地把整个功能相关的所有代码全部撤销。

#### 6. Rebase 处理本地分支落后

**Re-base = 重新设定基准点。**

把你的分支的"起点"从旧的 base 移动到新的 base 上，然后把你的提交一个一个重新应用上去。

假设你从 master 的 C2 处创建了分支 A，之后两边各自有了新提交：

```text
          D1 -- D2        (A 分支的提交)
         /
C1 -- C2 -- C3 -- C4     (master 更新了 C3 和 C4 提交) 
```

执行 `git rebase origin/master` 后：

```text
                        D1' -- D2'   (A 分支，提交被重新应用)
                       /
C1 -- C2 -- C3 -- C4              (master)
```

A 分支的"基准"从 C2 变成了 C4，D1 和 D2 被**重新创建**为 D1' 和 D2'（commit hash 会变，但内容一样）。

##### Rebase 的本质过程

执行 `git rebase origin/master` 时，Git 做了三件事：

1. **找出**你的分支上独有的提交（D1、D2）
2. **重置**分支指针到目标（origin/master，即 C4）
3. **逐个重放**你的提交到新基准上（生成 D1'、D2'）

如果重放某个提交时发现和新基准有冲突，就暂停让你手动解决。

##### Rebase vs Merge

```text
# Merge：生成一个额外的合并节点，保留分叉历史
          D1 -- D2
         /        \
C1 -- C2 -- C3 -- C4 -- M   (merge commit)

# Rebase：线性历史，没有分叉
C1 -- C2 -- C3 -- C4 -- D1' -- D2'
```

- **Merge**：历史完整但杂乱，多人协作时会有大量合并节点
- **Rebase**：历史线性干净，但改写了提交（hash 变了）

##### 重要注意事项

**已经推送到远程且有其他人在用的分支，不要 rebase。** 因为 rebase 会改写提交历史（hash 变了），其他人基于旧 hash 的工作会出问题。

安全原则：

- **自己的 feature 分支** → 随便 rebase
- **公共分支（master/main）** → 绝不 rebase

`rebase` 侧重“整理和更新我的开发分支”，`merge --no-ff` 侧重“正式、可追踪地把一个功能分支并入主线”。