import { Injectable } from '@nestjs/common';
import { TenantAwareDbService } from '../database/tenant-aware-db.service';
import { CreateProductDto } from './dto/create-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly db: TenantAwareDbService) {}

  async create(dto: CreateProductDto) {
    const result = await this.db.query(
      `INSERT INTO products
         (tenant_id, category_id, sku, barcode, name, description, unit, cost_price, selling_price, reorder_level)
       VALUES
         (current_setting('app.current_tenant_id')::UUID, $1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        dto.categoryId ?? null,
        dto.sku ?? null,
        dto.barcode ?? null,
        dto.name,
        dto.description ?? null,
        dto.unit ?? 'piece',
        dto.costPrice,
        dto.sellingPrice,
        dto.reorderLevel ?? 0,
      ],
    );
    return result.rows[0];
  }

  async findAll() {
    const result = await this.db.query(
      `SELECT * FROM products WHERE is_active = true ORDER BY name`,
    );
    return result.rows;
  }

  async findOne(id: string) {
    const result = await this.db.query(`SELECT * FROM products WHERE id = $1`, [id]);
    return result.rows[0] ?? null;
  }
}
