import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { InventoryModule } from '../inventory/inventory.module';
import { PermissionsGuard } from '../common/auth/permissions.guard';

@Module({
  imports: [InventoryModule],
  controllers: [SalesController],
  providers: [SalesService, PermissionsGuard],
})
export class SalesModule {}
