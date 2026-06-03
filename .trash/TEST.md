```sql
SELECT 
    b.building_no AS '楼栋编号', 
    SUM(bl.amount) AS '欠费总金额', 
    COUNT(bl.bill_id) AS '欠费账单数'
FROM t_bill bl
JOIN t_house h ON bl.house_id = h.house_id
JOIN t_building b ON h.building_id = b.building_id
WHERE bl.pay_status = 'UNPAID' 
  AND bl.month_record = '2026-06'
GROUP BY b.building_id, b.building_no
ORDER BY 欠费总金额 DESC;
```
