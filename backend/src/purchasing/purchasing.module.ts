import { Module } from '@nestjs/common';
import { PermissionsGuard } from '../common/auth/permissions.guard';
import { InventoryModule } from '../inventory/inventory.module';
import { PurchaseOrdersController, SuppliersController } from './purchasing.controller';
import { PurchasingService } from './purchasing.service';

@Module({
  imports: [InventoryModule],
  controllers: [SuppliersController, PurchaseOrdersController],
  providers: [PurchasingService, PermissionsGuard],
})
export class PurchasingModule {}
