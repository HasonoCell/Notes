五大核心板块：SQL，函数，约束，多表查询，事务。

# 一些 MySQL 基础

通过 `sudo net start mysql80` 启动 MySQL 服务，通过 `sudo net stop mysql80` 停止服务。通过 `mysql -u root -p` 连接 MySQL。MySQL 客户端通过发送命令给 DBMS，由 DBMS 管理多个数据库，每个数据库又可以存储多张表，数据就存储在表中。

# SQL

SQL 语句的分类：
![](assets/MySQL%20基础篇/file-20260128211755106.png)

## DDL
DDL 针对数据库的操作：
![](assets/MySQL%20基础篇/file-20260128212557924.png)

DDL 针对数据库中表的操作：
![](assets/MySQL%20基础篇/file-20260128212717303.png)


如何创建一个表：
![](assets/MySQL%20基础篇/file-20260128213732854.png)
比如：
```sql
create table tb_user(
    -> id int comment '编号',
    -> name varchar(50) comment '姓名',
    -> age int comment '年龄',
    -> gender varchar(1) comment '性别'
    -> ) comment '用户表';
```

MySQL 中常见的数据类型：
数字类型：Int，Float，Double
字符串类型：Char，VarChar
日期类型：Date，Year，Time，DateTime