import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { PermissionsGuard } from '../common/auth/permissions.guard';
import { RequirePermissions } from '../common/auth/permissions.decorator';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';

@Controller('sales')
@UseGuards(PermissionsGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  @RequirePermissions('pos:operate')
  create(@Body() dto: CreateSaleDto) {
    return this.salesService.create(dto);
  }

  @Get()
  @RequirePermissions('reports:view')
  findAll(@Query('branchId') branchId?: string) {
    return this.salesService.findAll(branchId);
  }

  @Get('summary')
  @RequirePermissions('reports:view')
  summary(@Query('days') days?: string) {
    return this.salesService.summary(days);
  }

  @Get(':id')
  @RequirePermissions('reports:view')
  findOne(@Param('id') id: string) {
    return this.salesService.findOne(id);
  }

  @Patch(':id/void')
  @RequirePermissions('inventory:manage') // voiding is a manager-level action, not plain cashier
  void(@Param('id') id: string, @Body('reason') reason: string) {
    return this.salesService.void(id, reason);
  }
}
