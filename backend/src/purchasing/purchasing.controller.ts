import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { PermissionsGuard } from '../common/auth/permissions.guard';
import { RequirePermissions } from '../common/auth/permissions.decorator';
import { PurchasingService } from './purchasing.service';
import { CreatePurchaseOrderDto, CreateSupplierDto } from './dto/purchasing.dto';

@Controller('suppliers')
@UseGuards(PermissionsGuard)
export class SuppliersController {
  constructor(private readonly purchasingService: PurchasingService) {}

  @Post()
  @RequirePermissions('purchasing:manage')
  createSupplier(@Body() dto: CreateSupplierDto) {
    return this.purchasingService.createSupplier(dto);
  }

  @Get()
  @RequirePermissions('purchasing:view')
  findAllSuppliers() {
    return this.purchasingService.findAllSuppliers();
  }
}

@Controller('purchase-orders')
@UseGuards(PermissionsGuard)
export class PurchaseOrdersController {
  constructor(private readonly purchasingService: PurchasingService) {}

  @Post()
  @RequirePermissions('purchasing:manage')
  createPurchaseOrder(@Body() dto: CreatePurchaseOrderDto) {
    return this.purchasingService.createPurchaseOrder(dto);
  }

  @Get()
  @RequirePermissions('purchasing:view')
  findAllPurchaseOrders(@Query('status') status?: string) {
    return this.purchasingService.findAllPurchaseOrders(status);
  }

  @Get(':id')
  @RequirePermissions('purchasing:view')
  findOnePurchaseOrder(@Param('id') id: string) {
    return this.purchasingService.findOnePurchaseOrder(id);
  }

  @Patch(':id/receive')
  @RequirePermissions('purchasing:manage')
  receivePurchaseOrder(@Param('id') id: string) {
    return this.purchasingService.receivePurchaseOrder(id);
  }

  @Patch(':id/cancel')
  @RequirePermissions('purchasing:manage')
  cancelPurchaseOrder(@Param('id') id: string, @Body('reason') reason: string) {
    return this.purchasingService.cancelPurchaseOrder(id, reason);
  }
}
