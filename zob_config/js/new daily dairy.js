const util = require('util');
const child_process = require('child_process');
const fs = require('fs');
const path = require('path');
const exec = util.promisify(child_process.exec);

function getCreateTimeAsFileName() {
    const d = new Date();
    const year = d.getFullYear();
    const week = getWeekNumber(d);
    const day = d.getDay(); // 0 = Sunday, 1 = Monday, ...
    const fileName = `${year}-${week}-${day}`;
    return fileName;
}

function getWeekNumber(d) {
    const start = new Date(d.getFullYear(), 0, 1);
    const diff = d - start + (start.getTimezoneOffset() - d.getTimezoneOffset()) * 60 * 1000;
    return Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1;
}

function getTemplate() {
    const today = new Date().toISOString().split("T")[0];
    return `
# ${getCreateTimeAsFileName()}

## 1. 计划

### 🌅 早晨

#### 计划 

- [ ] 构思论文

#### 复盘 

---

### ☀️ 下午

#### 计划 

- [ ] 去讲座
- [ ] 写 essay
- [ ] 做 CS231n 的规划

#### 复盘 

---

### 🌇 晚上

#### 计划
- [ ] 过 JOJ
- [ ] 写 essay
- [ ] 准备四级
#### 复盘 

---

## 2. 笔记索引

\`\`\`dataview
LIST FROM ""
WHERE file.cday = date("${today}")
\`\`\`

---

## 3. 资源与链接

---

## 4. 未完成的任务

\`\`\`dataview
TASK FROM "dairy"
WHERE !completed
  AND file.cday >= (this.file.day - dur(7 days))
  AND file.cday <= this.file.day
SORT file.cday DESC
\`\`\`

---

## 5. 反思
    `;
}

// Create the file with the generated template
async function createDailyLog() {
    const fileName = getCreateTimeAsFileName() + ".md";
    const template = getTemplate();
    const filePath = path.join(app.fileManager.vault.adapter.basePath, "daily_logs", fileName);

    try {
        // Ensure directory exists
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Write the file
        fs.writeFileSync(filePath, template.trim());
        console.log(`New daily log created: ${fileName}`);
        new Notice(`New Daily Log Created [${fileName}]`);
    } catch (error) {
        console.error("Failed to create daily log:", error);
        new Notice("New Daily Log Creation Failed.");
    }
}

module.exports = async function(context, req) {
    await createDailyLog();
};
