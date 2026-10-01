import { BadRequestException, Injectable } from '@nestjs/common';
import { TenantAwareDbService } from '../database/tenant-aware-db.service';
import { InventoryService } from '../inventory/inventory.service';
import { tenantContext } from '../common/tenant/tenant-context';
import { CreateSupplierDto, CreatePurchaseOrderDto } from './dto/purchasing.dto';

@Injectable()
export class PurchasingService {
  constructor(
    private readonly db: TenantAwareDbService,
    private readonly inventoryService: InventoryService,
  ) {}

  async createSupplier(dto: CreateSupplierDto) {
    const result = await this.db.query(
      `INSERT INTO suppliers (tenant_id, name, contact_person, phone, email, address)
       VALUES (current_setting('app.current_tenant_id')::UUID, $1, $2, $3, $4, $5)
       RETURNING *`,
      [dto.name, dto.contactPerson ?? null, dto.phone ?? null, dto.email ?? null, dto.address ?? null],
    );
    return result.rows[0];
  }

  async findAllSuppliers() {
    const result = await this.db.query(
      `SELECT * FROM suppliers WHERE is_active = true ORDER BY name`,
    );
    return result.rows;
  }

  async createPurchaseOrder(dto: CreatePurchaseOrderDto) {
    const { userId } = tenantContext.get();

    return this.db.withTenant(async (client) => {
      const totalCost = dto.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);

      const poResult = await client.query(
        `INSERT INTO purchase_orders
           (tenant_id, supplier_id, branch_id, expected_date, notes, total_cost, created_by)
         VALUES
           (current_setting('app.current_tenant_id')::UUID, $1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [dto.supplierId, dto.branchId, dto.expectedDate ?? null, dto.notes ?? null, totalCost, userId],
      );
      const purchaseOrder = poResult.rows[0];

      const items: Record<string, unknown>[] = [];
      for (const item of dto.items) {
        const lineTotal = Math.round(item.quantity * item.unitCost * 100) / 100;
        const itemResult = await client.query(
          `INSERT INTO purchase_order_items
             (tenant_id, purchase_order_id, product_id, quantity, unit_cost, line_total)
           VALUES
             (current_setting('app.current_tenant_id')::UUID, $1, $2, $3, $4, $5)
           RETURNING *`,
          [purchaseOrder.id, item.productId, item.quantity, item.unitCost, lineTotal],
        );
        items.push(itemResult.rows[0]);
      }

      return { ...purchaseOrder, items };
    });
  }

  async findAllPurchaseOrders(status?: string) {
    const result = status
      ? await this.db.query(
          `SELECT po.*, s.name AS supplier_name
             FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id
            WHERE po.status = $1 ORDER BY po.created_at DESC`,
          [status],
        )
      : await this.db.query(
          `SELECT po.*, s.name AS supplier_name
             FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id
            ORDER BY po.created_at DESC`,
        );
    return result.rows;
  }

  async findOnePurchaseOrder(id: string) {
    const poResult = await this.db.query(`SELECT * FROM purchase_orders WHERE id = $1`, [id]);
    if (poResult.rows.length === 0) return null;

    const itemsResult = await this.db.query(
      `SELECT poi.*, p.name AS product_name
         FROM purchase_order_items poi JOIN products p ON p.id = poi.product_id
        WHERE poi.purchase_order_id = $1`,
      [id],
    );
    return { ...poResult.rows[0], items: itemsResult.rows };
  }

  async receivePurchaseOrder(id: string) {
    const { userId } = tenantContext.get();

    return this.db.withTenant(async (client) => {
      const poResult = await client.query(
        `SELECT * FROM purchase_orders WHERE id = $1 AND status = 'pending' FOR UPDATE`,
        [id],
      );
      if (poResult.rows.length === 0) {
        throw new BadRequestException('Purchase order not found or already processed');
      }
      const purchaseOrder = poResult.rows[0];

      const itemsResult = await client.query(
        `SELECT * FROM purchase_order_items WHERE purchase_order_id = $1`,
        [id],
      );

      for (const item of itemsResult.rows) {
        await this.inventoryService.applyMovement(client, {
          productId: item.product_id,
          branchId: purchaseOrder.branch_id,
          quantityDelta: Number(item.quantity),
          movementType: 'purchase_in',
          referenceType: 'purchase_order',
          referenceId: purchaseOrder.id,
          userId,
        });
      }

      const updated = await client.query(
        `UPDATE purchase_orders
            SET status = 'received', received_at = now(), received_by = $1, updated_at = now()
          WHERE id = $2
          RETURNING *`,
        [userId, id],
      );
      return updated.rows[0];
    });
  }

  async cancelPurchaseOrder(id: string, reason: string) {
    const { userId } = tenantContext.get();
    const result = await this.db.query(
      `UPDATE purchase_orders
          SET status = 'cancelled', cancelled_at = now(), cancelled_by = $1,
              cancel_reason = $2, updated_at = now()
        WHERE id = $3 AND status = 'pending'
        RETURNING *`,
      [userId, reason, id],
    );
    if (result.rows.length === 0) {
      throw new BadRequestException('Purchase order not found or already processed');
    }
    return result.rows[0];
  }
}
