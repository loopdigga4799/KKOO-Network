import { IsNumber, IsOptional, IsString, IsUUID, Min, NotEquals } from 'class-validator';

export class ReceiveStockDto {
  @IsUUID()
  productId: string;

  @IsUUID()
  branchId: string;

  @IsNumber()
  @Min(0.001)
  quantity: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class AdjustStockDto {
  @IsUUID()
  productId: string;

  @IsUUID()
  branchId: string;

  @IsNumber()
  @NotEquals(0)
  quantityDelta: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
