import { Controller, Get, UseGuards } from '@nestjs/common';
import { PermissionsGuard } from '../common/auth/permissions.guard';
import { RequirePermissions } from '../common/auth/permissions.decorator';
import { TenantAwareDbService } from '../database/tenant-aware-db.service';

@Controller('branches')
@UseGuards(PermissionsGuard)
export class BranchesController {
  constructor(private readonly db: TenantAwareDbService) {}

  @Get()
  @RequirePermissions('inventory:view')
  async findAll() {
    const result = await this.db.query(
      `SELECT id, name, branch_type FROM branches WHERE is_active = true ORDER BY name`,
    );
    return result.rows;
  }
}