五大核心板块：SQL 语句，函数，约束，多表查询，事务。

# 一些 MySQL 基础

通过 `sudo net start mysql80` 启动 MySQL 服务，通过 `sudo net stop mysql80` 停止服务。通过 `mysql -u root -p` 连接 MySQL。MySQL 客户端通过发送命令给 DBMS，由 DBMS 管理多个数据库，每个数据库又可以存储多张表，数据就存储在表中。

# SQL

SQL 语句的分类：
![](assets/MySQL%20基础篇/file-20260128211755106.png)

## DDL
针对数据库的操作：
![](assets/MySQL%20基础篇/file-20260128212557924.png)

针对数据库中表的操作：
![](assets/MySQL%20基础篇/file-20260128212717303.png)


如何创建一个表：
![](assets/MySQL%20基础篇/file-20260128213732854.png)
比如：
```sql
create table tb_user(
	id int comment '编号',
	name varchar(50) comment '姓名',
    age int comment '年龄',
    gender varchar(1) comment '性别'
) comment '用户表';
```

MySQL 中常见的数据类型：
数字类型：Int，Float，Double（默认为为 Signed，可以显式标注 Unsigned）
字符串类型：Char，VarChar
日期类型：Date，Year，Time，DateTime

如何修改一个表：
![](assets/MySQL%20基础篇/file-20260128225605879.png)

![](assets/MySQL%20基础篇/file-20260128225708768.png)

![](assets/MySQL%20基础篇/file-20260128225754478.png)

![](assets/MySQL%20基础篇/file-20260128225839864.png)

![](assets/MySQL%20基础篇/file-20260128230042385.png)

## DML

向数据表中插入数据
![](assets/MySQL%20基础篇/file-20260208102219196.png)

向数据表中更改数据
![](assets/MySQL%20基础篇/file-20260208104344912.png)

向数据表中删除数据
![](assets/MySQL%20基础篇/file-20260208104325509.png)

## DQL

核心就是 SELECT 语句
![](assets/MySQL%20基础篇/file-20260208105147369.png)

### 基本查询操作
![](assets/MySQL%20基础篇/file-20260208105309458.png)

### 条件查询
![](assets/MySQL%20基础篇/file-20260208105848526.png)

### 聚合函数
![](assets/MySQL%20基础篇/file-20260208125507379.png)

### 分组查询
![](assets/MySQL%20基础篇/file-20260208132009334.png)

### 排序查询
![](assets/MySQL%20基础篇/file-20260208133437260.png)

### 分页查询
![](assets/MySQL%20基础篇/file-20260208133952240.png)

## DCL

DCL 一般开发过程中用的很少，了解即可。
管理用户。MySQL 中所有的用户信息都存储在数据库 `mysql` 的 `user` 表中。
![](assets/MySQL%20基础篇/file-20260208135858513.png)


---

# 函数
## 字符串函数
![](assets/MySQL%20基础篇/file-20260208141033769.png)

## 数值函数
![](assets/MySQL%20基础篇/file-20260208141721709.png)

## 日期函数
![](assets/MySQL%20基础篇/file-20260208142113542.png)

## 流程控制函数
![](assets/MySQL%20基础篇/file-20260208142405170.png)


---

# 约束

## 基本约束
本质是表中作用于字段上的规则，用来限制表中的数据，约束的类型如下：
![](assets/MySQL%20基础篇/file-20260208170356537.png)

## 外键约束

### 逻辑层面的定义
通过主键（Primary Key）和外键（Foreign Key），我们可以让两张数据表建立连接，将其他表的主键作为外键的表叫做**子表**（或者**从表**），而被当作外键的那个字段所在的表叫**父表**（或者**主表**）。

一旦两张表建立了主外键的联系，就不能轻易删除主表中的数据，保障数据一致性。
![](assets/MySQL%20基础篇/file-20260208172025513.png)

### 数据库层面的操作
![](assets/MySQL%20基础篇/file-20260208173010942.png)

比如：
```sql
alter table emp 
	add constraint fk_dept_id foreign key (dept_id) references dept (id);
```

如果要删除或者更新主表中的字段时，通常会有以下几种行为，其中 `NO ACTION` 和 `RESTRICT` 是默认行为。
![](assets/MySQL%20基础篇/file-20260208175301394.png)

# 多表查询
## 多表关系
1. 一对多或者多对一（比如员工表中，多个员工可以属于部门表中的同一个部门），通过**主外键**的形式建立连接。

2. 多对多（比如学生表中，一个学生可以选择课程表中的多个课程，一个课程也能被多个学生选择），通过**一张中间表**的形式，在中间表中建立两个外键，关联两张数据表中的主键。
![](assets/MySQL%20基础篇/file-20260208181040871.png)

3. 一对一（多用于数据类型较复杂的单表情况，比如可以将一张涵盖了各种信息的用户表拆分为基础用户表和用户详情表）通过**拆分单表**的形式，可以提高操作效率。一对一和多对一最主要的区别在于，**外键设置了唯一约束**，保证了一个外键只关联一个主键，而不是像多对一关系中多个外键可以关联一个主键。
![](assets/MySQL%20基础篇/file-20260208181342654.png)

## 多表查询的分类
如果直接采用类似 `select * from emp, dept` 这样的 DQL 去进行多表查询，会查询出两张表的所有笛卡尔积。所以多表查询的核心是**消除不必要的笛卡尔积**。
![](assets/MySQL%20基础篇/file-20260208200514513.png)

## 内外连接

内连接：
![](assets/MySQL%20基础篇/file-20260208200659808.png)

外连接：
![](assets/MySQL%20基础篇/file-20260208201348503.png)

## 自连接

自连接中被查询的表必须要起别名。
![](assets/MySQL%20基础篇/file-20260208201953635.png)

## 联合查询

`union all` 是直接将查询的结果合并，而 `union` 会将查询结果进行去重。
![](assets/MySQL%20基础篇/file-20260208202931068.png)

## 子查询

子查询的概念和分类。大概意思就是，将子查询后的结果继续拿给外部语句去做增/删/改/查等操作。
![](assets/MySQL%20基础篇/file-20260208203134608.png)

### 标量子查询
![](assets/MySQL%20基础篇/file-20260208203454952.png)

如“查询销售部门的所有员工信息”可写为：
```sql
select * from emp where dept_id = (select id from dept where name = '销售部');

# 子查询语句返回的是单个部门的 id
```

### 列子查询
![](assets/MySQL%20基础篇/file-20260208203912757.png)

如“查询销售部门和市场部门的所有员工信息”可写为：
```sql
select * from emp where dept_id in 
	(select id from dept where name = '销售部' or name = '市场部');

# 子查询语句返回的是多个部门的 id，通常是一列多行
```

### 行子查询
![](assets/MySQL%20基础篇/file-20260208204513967.png)

### 表子查询

表子查询通常出现在 FROM 之后，将表子查询的结果继续作为“一张表”去进行联查操作。
![](assets/MySQL%20基础篇/file-20260208204935757.png)

---

# 事务

## 事务的概念

可以参考图中银行转账的例子：
![](assets/MySQL%20基础篇/file-20260208210247398.png)

## 事务的操作

我的理解是，执行完 SQL 语句不会立即更改数据库中的数据，只有将 SQL 语句执行后的结果作为“事务（Transaction）”提交（ `commit` )之后，数据库才会受到影响。

如果执行 SQL 语句期间出现了异常，而事务又没有提交，那么就可以会滚事务（`rollback`）。保障数据库中数据的正确性和完整性。

### 方式一：更改事务的提交方式（自动 or 手动）

`set @@autocommit` 值为 0 是手动提交，值为 1 是自动提交
![](assets/MySQL%20基础篇/file-20260208211800248.png)

### 方式二：手动开启事务（更常用）

![](assets/MySQL%20基础篇/file-20260208211554201.png)

## 事务的四大特性（ACID）
![](assets/MySQL%20基础篇/file-20260208212235487.png)

要理解事务的四大特性，不妨先认识清楚事务到底是什么以及为什么存在：
MySQL 之所以抽离出“事务”（Transaction）这个概念，就是为了提供一个**原子性容器**。它向你保证，在这个容器里的所有操作，要么全部成功，要么全部失败（回滚），绝对不会出现中间状态。

比如仍然是银行转账的业务场景，在处理 `A 的账户减去 100 块 --> B 的账户增加 100 块。` 这个逻辑时突然断电或者数据库报错了，那么 A 账户的钱被扣除了，B 账户的钱也没加上。如果要手动处理这种问题非常困难（比如你可能要写反向 SQL），有了事务机制，你就可以将这一系列操作归为一个“事务”，可以整体地执行 `commit` 或者 `rollback` ，从而确保了业务逻辑处理过程中的数据一致性。


关于事务的四大特性，以下是我的一些解释：
1. 原子性：就是说一个事务是不可被分割的，比如说“银行转账”这一个事务，它会涉及**查询余额 --> 账户 A 扣钱 --> 账户 B 加钱**这三个操作，但是这三个操作是不能被分割的，要么全部成功，要么全部失败。底层是依赖 MySQL 中的 `Undo Log` 回滚日志实现的。

2. 一致性：事务执行前后，数据库的完整性约束没有被破坏（比如转账过程中，A 账户和 B 账户的总钱数加起来不变）。

3. 隔离性：这一点主要是针对**多事务并发**的场景，一个数据库中可能有多个事务同时发生（比如说多个转账事务并发），此时必须要保障事务之间是相互独立的。事务的隔离机制在不同数据库系统之间会有不同（比如 MySQL 和 PostgreSQL 之间会有不同）。底层是通过锁 (`Lock`) 和 `MVCC` (多版本并发控制)实现的。

4. 持久性：这一点是说，一旦一个事务结束（不管是提交或者是回滚），它对数据库中数据的改变都会被持久化到**磁盘**中去，即其改变是永久的。底层是通过 `Redo Log` 重做日志实现的，持久化时，MySQL 先将修改记录快速写到磁盘的 `Redo Log` 里（这一步非常快，叫 WAL - Write Ahead Log）。就算内存里的数据还没来得及刷到硬盘的数据文件里就断电了，重启后，MySQL 会读 `Redo Log`，把没做完的操作“重做”一遍。

## 事务并发问题

**注意**：一定是多个事务同时发生时才会出现下面几种问题。
![](assets/MySQL%20基础篇/file-20260208213601496.png)

事务的执行过程中有个坑需要注意就是：当多次执行从 `start transaction` 到 `commit` 之前的语句时，MySQL 会**默认**提交上一次执行的所有语句。

```mysql
# 查询事务是否自动提交  
select @@autocommit;  
  
# 查询事务隔离机制  
select @@transaction_isolation;  
  
create table bank_account(  
    id int primary key auto_increment comment 'ID',  
    name varchar(10) unique not null comment '姓名',  
    money int not null comment '余额'  
);  
  
insert into bank_account (name, money)  
values ('张三', 2000), ('李四',4000);  
  
# 开启事务  
start transaction;  
  
select money from bank_account where name = '张三';  
update bank_account set money = money - 1000 where name = '张三';  
update bank_account set money = money + 1000 where name = '李四';  
  
commit;
```

## 事务隔离级别

事务的隔离级别越高，性能越差。

![](assets/MySQL%20基础篇/file-20260208214316520.png)

特别注意一下 `Serializable 串行化` 这个隔离级别，我的理解就是，这个隔离级别相当于完全禁止了事务的并发操作，只允许事务串行执行（前一个执行完才能执行下一个），自然就解决了所有的事务并发问题。 