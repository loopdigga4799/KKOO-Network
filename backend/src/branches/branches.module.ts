import { Module } from '@nestjs/common';
import { PermissionsGuard } from '../common/auth/permissions.guard';
import { BranchesController } from './branches.controller';

@Module({
  controllers: [BranchesController],
  providers: [PermissionsGuard],
})
export class BranchesModule {}