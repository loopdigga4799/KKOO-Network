import { BadRequestException, Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { TenantAwareDbService } from '../database/tenant-aware-db.service';
import { InventoryService } from '../inventory/inventory.service';
import { tenantContext } from '../common/tenant/tenant-context';
import { CreateSaleDto } from './dto/create-sale.dto';

@Injectable()
export class SalesService {
  constructor(
    private readonly db: TenantAwareDbService,
    private readonly inventoryService: InventoryService,
  ) {}

  async summary(daysInput = '7') {
    const days = Number(daysInput);
    if (![7, 30, 90].includes(days)) {
      throw new BadRequestException('days must be one of: 7, 30, 90');
    }

    const result = await this.db.query(
      `WITH dates AS (
         SELECT $1::INTEGER AS days,
                (NOW() AT TIME ZONE 'Africa/Dar_es_Salaam')::DATE AS today
       ), bounds AS (
         SELECT days,
                today - (days - 1) AS current_start,
                today + 1 AS current_end,
                today - (days * 2 - 1) AS previous_start,
                today - (days - 1) AS previous_end
           FROM dates
       ), scoped_sales AS (
         SELECT s.total, s.status, s.payment_method,
                (s.created_at AT TIME ZONE 'Africa/Dar_es_Salaam')::DATE AS sale_date,
                CASE
                  WHEN s.created_at >= (b.current_start::TIMESTAMP AT TIME ZONE 'Africa/Dar_es_Salaam')
                  THEN 'current' ELSE 'previous'
                END AS period
           FROM sales s CROSS JOIN bounds b
          WHERE s.created_at >= (b.previous_start::TIMESTAMP AT TIME ZONE 'Africa/Dar_es_Salaam')
            AND s.created_at < (b.current_end::TIMESTAMP AT TIME ZONE 'Africa/Dar_es_Salaam')
       )
       SELECT b.days,
              TO_CHAR(b.current_start, 'YYYY-MM-DD') AS current_start,
              TO_CHAR(b.current_end - 1, 'YYYY-MM-DD') AS current_end,
              COUNT(*) FILTER (WHERE s.period = 'current' AND s.status = 'completed') AS current_sales_count,
              COALESCE(SUM(s.total) FILTER (WHERE s.period = 'current' AND s.status = 'completed'), 0) AS current_revenue,
              COUNT(*) FILTER (WHERE s.period = 'current' AND s.status = 'voided') AS current_voided_count,
              COUNT(*) FILTER (WHERE s.period = 'previous' AND s.status = 'completed') AS previous_sales_count,
              COALESCE(SUM(s.total) FILTER (WHERE s.period = 'previous' AND s.status = 'completed'), 0) AS previous_revenue,
              COALESCE((
                SELECT JSON_AGG(JSON_BUILD_OBJECT(
                  'date', TO_CHAR(d.sale_date, 'YYYY-MM-DD'),
                  'salesCount', d.sales_count,
                  'revenue', d.revenue
                ) ORDER BY d.sale_date)
                  FROM (
                    SELECT sale_date, COUNT(*) AS sales_count, SUM(total) AS revenue
                      FROM scoped_sales
                     WHERE period = 'current' AND status = 'completed'
                     GROUP BY sale_date
                  ) d
              ), '[]'::JSON) AS daily,
              COALESCE((
                SELECT JSON_AGG(JSON_BUILD_OBJECT(
                  'method', p.payment_method,
                  'salesCount', p.sales_count,
                  'revenue', p.revenue
                ) ORDER BY p.revenue DESC)
                  FROM (
                    SELECT payment_method, COUNT(*) AS sales_count, SUM(total) AS revenue
                      FROM scoped_sales
                     WHERE period = 'current' AND status = 'completed'
                     GROUP BY payment_method
                  ) p
              ), '[]'::JSON) AS payments
         FROM bounds b
         LEFT JOIN scoped_sales s ON TRUE
        GROUP BY b.days, b.current_start, b.current_end`,
      [days],
    );

    const row = result.rows[0];
    const salesCount = Number(row.current_sales_count);
    const revenue = Number(row.current_revenue);

    return {
      period: { days, from: row.current_start, to: row.current_end },
      current: {
        salesCount,
        revenue,
        voidedCount: Number(row.current_voided_count),
        averageSale: salesCount === 0 ? 0 : revenue / salesCount,
      },
      previous: {
        salesCount: Number(row.previous_sales_count),
        revenue: Number(row.previous_revenue),
      },
      daily: row.daily,
      payments: row.payments,
    };
  }

  /**
   * The whole sale — stock check, sale record, line items, stock
   * deduction, and any customer credit update — happens inside ONE
   * transaction. If anything fails partway (e.g. insufficient stock on
   * item 3 of 5), everything rolls back: no partial sale, no stock
   * silently deducted without a matching sale record.
   */
  async create(dto: CreateSaleDto) {
    const { userId } = tenantContext.get();

    return this.db.withTenant(async (client) => {
      // 1. Look up current price + stock for every line item, locking the
      // stock row so two simultaneous sales of the same item can't both
      // read a stale quantity and oversell it (classic race condition on
      // a busy POS with two cashiers on the same product).
      const lineItems: {
        productId: string;
        quantity: number;
        unitPrice: number;
        lineTotal: number;
      }[] = [];

      for (const item of dto.items) {
        const productResult = await client.query(
          `SELECT selling_price, name FROM products WHERE id = $1 AND is_active = true`,
          [item.productId],
        );
        if (productResult.rows.length === 0) {
          throw new BadRequestException(`Product ${item.productId} not found or inactive`);
        }
        const { selling_price: sellingPrice, name } = productResult.rows[0];

        const stockResult = await client.query(
          `SELECT quantity FROM inventory_stock
             WHERE product_id = $1 AND branch_id = $2
             FOR UPDATE`, // row lock — held until this transaction commits/rolls back
          [item.productId, dto.branchId],
        );
        const available = stockResult.rows[0]?.quantity ?? 0;

        if (Number(available) < item.quantity) {
          throw new BadRequestException(
            `Insufficient stock for "${name}": requested ${item.quantity}, available ${available}`,
          );
        }

        const unitPrice = Number(sellingPrice);
        lineItems.push({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice,
          lineTotal: Math.round(unitPrice * item.quantity * 100) / 100,
        });
      }

      const subtotal = lineItems.reduce((sum, li) => sum + li.lineTotal, 0);
      const total = subtotal; // Phase 1: no tax/discount layer yet — add here when built

      // 2. Credit sales need a customer and available credit headroom.
      if (dto.paymentMethod === 'credit') {
        if (!dto.customerId) {
          throw new BadRequestException('A customer is required for credit sales');
        }
        const shortfall = total - dto.amountPaid;
        if (shortfall > 0) {
          const customerResult = await client.query(
            `SELECT credit_limit, credit_balance FROM customers WHERE id = $1 FOR UPDATE`,
            [dto.customerId],
          );
          if (customerResult.rows.length === 0) {
            throw new BadRequestException('Customer not found');
          }
          const { credit_limit: creditLimit, credit_balance: creditBalance } =
            customerResult.rows[0];
          if (Number(creditBalance) + shortfall > Number(creditLimit)) {
            throw new BadRequestException(
              `Sale would exceed customer's credit limit (limit: ${creditLimit}, current balance: ${creditBalance}, this sale adds: ${shortfall})`,
            );
          }
        }
      }

      // 3. Create the sale record.
      const saleResult = await client.query(
        `INSERT INTO sales
           (tenant_id, branch_id, customer_id, sold_by, payment_method, subtotal, total, amount_paid)
         VALUES
           (current_setting('app.current_tenant_id')::UUID, $1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [dto.branchId, dto.customerId ?? null, userId, dto.paymentMethod, subtotal, total, dto.amountPaid],
      );
      const sale = saleResult.rows[0];

      // 4. Insert line items and deduct stock for each, via the shared
      // ledger method — this is the same code path receiveStock/adjustStock
      // use, so every stock change in the system goes through one place.
      for (const li of lineItems) {
        await client.query(
          `INSERT INTO sale_items (tenant_id, sale_id, product_id, quantity, unit_price, line_total)
           VALUES (current_setting('app.current_tenant_id')::UUID, $1, $2, $3, $4, $5)`,
          [sale.id, li.productId, li.quantity, li.unitPrice, li.lineTotal],
        );

        await this.inventoryService.applyMovement(client, {
          productId: li.productId,
          branchId: dto.branchId,
          quantityDelta: -li.quantity,
          movementType: 'sale_out',
          referenceType: 'sale',
          referenceId: sale.id,
          userId,
        });
      }

      // 5. Update customer credit balance if this was (partly) a credit sale.
      const shortfall = total - dto.amountPaid;
      if (dto.paymentMethod === 'credit' && shortfall > 0) {
        await client.query(
          `UPDATE customers SET credit_balance = credit_balance + $1, updated_at = now() WHERE id = $2`,
          [shortfall, dto.customerId],
        );
      }

      return { ...sale, items: lineItems };
    });
  }

  async findOne(id: string) {
    const saleResult = await this.db.query(`SELECT * FROM sales WHERE id = $1`, [id]);
    if (saleResult.rows.length === 0) return null;

    const itemsResult = await this.db.query(
      `SELECT si.*, p.name AS product_name
         FROM sale_items si JOIN products p ON p.id = si.product_id
        WHERE si.sale_id = $1`,
      [id],
    );
    return { ...saleResult.rows[0], items: itemsResult.rows };
  }

  async findAll(branchId?: string) {
    const result = branchId
      ? await this.db.query(
          `SELECT * FROM sales WHERE branch_id = $1 ORDER BY created_at DESC LIMIT 100`,
          [branchId],
        )
      : await this.db.query(`SELECT * FROM sales ORDER BY created_at DESC LIMIT 100`);
    return result.rows;
  }

  /**
   * Void a sale — never deletes it. Marks it voided and reverses the
   * stock movement, so the ledger shows exactly what happened and when,
   * matching the platform's "never hard-delete financial records" rule.
   */
  async void(id: string, reason: string) {
    const { userId } = tenantContext.get();

    return this.db.withTenant(async (client) => {
      const saleResult = await client.query(
        `SELECT * FROM sales WHERE id = $1 AND status = 'completed' FOR UPDATE`,
        [id],
      );
      if (saleResult.rows.length === 0) {
        throw new BadRequestException('Sale not found or already voided');
      }
      const sale = saleResult.rows[0];

      const itemsResult = await client.query(
        `SELECT * FROM sale_items WHERE sale_id = $1`,
        [id],
      );

      for (const item of itemsResult.rows) {
        await this.inventoryService.applyMovement(client, {
          productId: item.product_id,
          branchId: sale.branch_id,
          quantityDelta: Number(item.quantity), // add the stock back
          movementType: 'return_in',
          referenceType: 'sale_void',
          referenceId: sale.id,
          notes: `Reversal for voided sale: ${reason}`,
          userId,
        });
      }

      if (sale.payment_method === 'credit') {
        const shortfall = Number(sale.total) - Number(sale.amount_paid);
        if (shortfall > 0 && sale.customer_id) {
          await client.query(
            `UPDATE customers SET credit_balance = credit_balance - $1, updated_at = now() WHERE id = $2`,
            [shortfall, sale.customer_id],
          );
        }
      }

      const updated = await client.query(
        `UPDATE sales
            SET status = 'voided', voided_at = now(), voided_by = $1, void_reason = $2
          WHERE id = $3
          RETURNING *`,
        [userId, reason, id],
      );
      return updated.rows[0];
    });
  }
}
