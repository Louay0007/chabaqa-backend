import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { ResourceController } from './resource.controller';
import { ResourceService } from './resource.service';
import { Resource, ResourceSchema } from '../schema/resource.schema';
import { AdminGuard } from '../auth/guards/admin.guard';
import { AuthModule } from '../auth/auth.module';

/**
 * Module pour la gestion des ressources
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Resource.name, schema: ResourceSchema }
    ]),
    PassportModule,
    AuthModule
  ],
  controllers: [ResourceController],
  providers: [
    ResourceService,
    AdminGuard,
    Reflector
  ],
  exports: [ResourceService]
})
export class ResourceModule {} 