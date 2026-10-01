import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

class SaleItemDto {
  @IsUUID()
  productId: string;

  @IsNumber()
  @Min(0.001)
  quantity: number;
}

export class CreateSaleDto {
  @IsUUID()
  branchId: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsIn(['cash', 'mobile_money', 'credit', 'card'])
  paymentMethod: 'cash' | 'mobile_money' | 'credit' | 'card';

  @IsNumber()
  @Min(0)
  amountPaid: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[];
}
