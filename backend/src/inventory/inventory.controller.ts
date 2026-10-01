import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { PermissionsGuard } from '../common/auth/permissions.guard';
import { RequirePermissions } from '../common/auth/permissions.decorator';
import { InventoryService } from './inventory.service';
import { AdjustStockDto, ReceiveStockDto } from './dto/stock.dto';

@Controller('inventory')
@UseGuards(PermissionsGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('receive')
  @RequirePermissions('inventory:adjust')
  receive(@Body() dto: ReceiveStockDto) {
    return this.inventoryService.receiveStock(dto);
  }

  @Post('adjust')
  @RequirePermissions('inventory:adjust')
  adjust(@Body() dto: AdjustStockDto) {
    return this.inventoryService.adjustStock(dto);
  }

  @Get('branch/:branchId')
  @RequirePermissions('inventory:view')
  stockByBranch(@Param('branchId') branchId: string) {
    return this.inventoryService.getStockByBranch(branchId);
  }

  @Get()
  @RequirePermissions('inventory:view')
  findAll(@Query('branchId') branchId?: string) {
    return this.inventoryService.findAll(branchId);
  }

  @Get(':productId')
  @RequirePermissions('inventory:view')
  findOne(@Param('productId') productId: string, @Query('branchId') branchId?: string) {
    return this.inventoryService.findOne(productId, branchId);
  }
}
