import { Module } from '@nestjs/common';
import { CoursModule } from './cours.module';

@Module({
  imports: [CoursModule],
  exports: [CoursModule],
})
export class CoursDomainModule {}
