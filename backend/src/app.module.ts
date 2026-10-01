import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { TenantMiddleware } from './common/tenant/tenant.middleware';
import { HealthController } from './health.controller';
import { PermissionsGuard } from './common/auth/permissions.guard';
import { JwtModule } from '@nestjs/jwt';
import { InventoryModule } from './inventory/inventory.module';
import { ProductsModule } from './products/products.module';
import { SalesModule } from './sales/sales.module';
import { PurchasingModule } from './purchasing/purchasing.module';
import { BranchesModule } from './branches/branches.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    InventoryModule,
    ProductsModule,
    SalesModule,
    PurchasingModule,
    BranchesModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '8h' },
    }),
  ],
  controllers: [HealthController],
  providers: [PermissionsGuard],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      .exclude(
        { path: 'auth/login', method: RequestMethod.POST },
        { path: 'health', method: RequestMethod.GET },
      )
      .forRoutes('*'); // every other route requires a valid tenant-scoped JWT
  }
}
