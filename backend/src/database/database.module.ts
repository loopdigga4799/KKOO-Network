import { Global, Module } from '@nestjs/common';
import { TenantAwareDbService } from './tenant-aware-db.service';

@Global()
export class DatabaseModuleMarker {}

@Global()
@Module({
  providers: [TenantAwareDbService],
  exports: [TenantAwareDbService],
})
export class DatabaseModule {}
