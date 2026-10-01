import { BadRequestException, Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { TenantAwareDbService } from '../database/tenant-aware-db.service';
import { tenantContext } from '../common/tenant/tenant-context';
import { AdjustStockDto, ReceiveStockDto } from './dto/stock.dto';

interface ApplyMovementInput {
  productId: string;
  branchId: string;
  quantityDelta: number;
  movementType: string;
  referenceType?: string | null;
  referenceId?: string | null;
  userId?: string | null;
  notes?: string | null;
}

@Injectable()
export class InventoryService {
  constructor(private readonly db: TenantAwareDbService) {}

  async findAll(branchId?: string) {
    const result = branchId
      ? await this.db.query(
          `SELECT * FROM inventory_stock WHERE branch_id = $1 ORDER BY updated_at DESC`,
          [branchId],
        )
      : await this.db.query(`SELECT * FROM inventory_stock ORDER BY updated_at DESC`);

    return result.rows;
  }

  async findOne(productId: string, branchId?: string) {
    const result = branchId
      ? await this.db.query(
          `SELECT * FROM inventory_stock WHERE product_id = $1 AND branch_id = $2`,
          [productId, branchId],
        )
      : await this.db.query(`SELECT * FROM inventory_stock WHERE product_id = $1`, [productId]);

    return result.rows[0] ?? null;
  }

  async getStockByBranch(branchId: string) {
    const result = await this.db.query(
      `SELECT stock.*, p.name AS product_name, p.sku
         FROM inventory_stock stock
         JOIN products p ON p.id = stock.product_id
        WHERE stock.branch_id = $1
        ORDER BY p.name`,
      [branchId],
    );

    return result.rows;
  }

  async receiveStock(dto: ReceiveStockDto) {
    const { userId } = tenantContext.get();

    return this.db.withTenant((client) =>
      this.applyMovement(client, {
        productId: dto.productId,
        branchId: dto.branchId,
        quantityDelta: dto.quantity,
        movementType: 'purchase_in',
        referenceType: 'manual_receive',
        userId,
        notes: dto.notes,
      }),
    );
  }

  async adjustStock(dto: AdjustStockDto) {
    const { userId } = tenantContext.get();

    return this.db.withTenant(async (client) => {
      const stockResult = await client.query(
        `SELECT quantity
           FROM inventory_stock
          WHERE product_id = $1 AND branch_id = $2
          FOR UPDATE`,
        [dto.productId, dto.branchId],
      );
      const currentQuantity = Number(stockResult.rows[0]?.quantity ?? 0);

      if (currentQuantity + dto.quantityDelta < 0) {
        throw new BadRequestException(
          `Stock adjustment would make quantity negative (current: ${currentQuantity}, adjustment: ${dto.quantityDelta})`,
        );
      }

      return this.applyMovement(client, {
        productId: dto.productId,
        branchId: dto.branchId,
        quantityDelta: dto.quantityDelta,
        movementType: 'adjustment',
        referenceType: 'manual_adjustment',
        userId,
        notes: dto.notes,
      });
    });
  }

  async applyMovement(client: PoolClient, input: ApplyMovementInput) {
    const { productId, branchId, quantityDelta, movementType, referenceType, referenceId, userId, notes } = input;

    const movementResult = await client.query(
      `INSERT INTO stock_movements
         (tenant_id, product_id, branch_id, movement_type, quantity_delta, reference_type, reference_id, notes, created_by)
       VALUES
         (current_setting('app.current_tenant_id')::UUID, $1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        productId,
        branchId,
        movementType,
        quantityDelta,
        referenceType ?? null,
        referenceId ?? null,
        notes ?? null,
        userId ?? null,
      ],
    );

    const stockResult = await client.query(
      `INSERT INTO inventory_stock
         (tenant_id, product_id, branch_id, quantity, updated_at)
       VALUES
         (current_setting('app.current_tenant_id')::UUID, $1, $2, $3, now())
       ON CONFLICT (product_id, branch_id)
       DO UPDATE SET quantity = inventory_stock.quantity + EXCLUDED.quantity,
                     updated_at = now()
       RETURNING *`,
      [productId, branchId, Number(quantityDelta)],
    );

    return {
      movement: movementResult.rows[0],
      stock: stockResult.rows[0],
    };
  }
}
